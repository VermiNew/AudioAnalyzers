import logger from '../utils/logger.js';

class AudioProcessor {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.instrumental = null;
        this.vocal = null;
        this.master = null;
        this.analyzerNodes = new Map();
        this.gainNodes = new Map();
        this.sources = new Map();
        this.effects = new Map();
        this.soloStates = new Map();
        this.muteStates = new Map();
        this.playing = false;
        this.startTime = 0;
        this.pauseTime = 0;
        
        // Settings
        this.autoNormalize = false;
        this.stereoEnhancement = false;
        this.highQuality = true;

        // Initialize master analyzer and gain nodes by default
        this.setupAnalyzers('master');
        
        // Initialize effects chains and states
        ['instrumental', 'vocal', 'master'].forEach(track => {
            this.effects.set(track, []);
            this.soloStates.set(track, false);
            this.muteStates.set(track, false);
        });
    }

    setupAnalyzers(type) {
        // Create RMS/Peak analyzer
        const rmsAnalyzer = this.audioContext.createAnalyser();
        rmsAnalyzer.fftSize = 2048;
        rmsAnalyzer.smoothingTimeConstant = 0.8;
        
        // Create spectral analyzer
        const spectralAnalyzer = this.audioContext.createAnalyser();
        spectralAnalyzer.fftSize = 2048;
        spectralAnalyzer.smoothingTimeConstant = 0.85;
        
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 1.0;

        // Connect the chain
        gainNode.connect(rmsAnalyzer);
        gainNode.connect(spectralAnalyzer);
        
        if (type === 'master') {
            rmsAnalyzer.connect(this.audioContext.destination);
            spectralAnalyzer.connect(this.audioContext.destination);
        } else {
            rmsAnalyzer.connect(this.gainNodes.get('master'));
            spectralAnalyzer.connect(this.gainNodes.get('master'));
        }

        this.analyzerNodes.set(type, {
            rms: rmsAnalyzer,
            spectral: spectralAnalyzer
        });
        this.gainNodes.set(type, gainNode);
        
        logger(`Set up analyzers for ${type}`, 'DEBUG');
    }

    async loadFile(file, type) {
        logger(`Loading ${type} file: ${file.name}`, 'INFO');
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            if (type === 'instrumental') {
                this.instrumental = audioBuffer;
                this.setupAnalyzers('instrumental');
                logger('Instrumental loaded successfully', 'INFO');
            } else if (type === 'vocal') {
                this.vocal = audioBuffer;
                this.setupAnalyzers('vocal');
                logger('Vocal loaded successfully', 'INFO');
            }

            return true;
        } catch (error) {
            logger(`Error loading ${type}: ${error.message}`, 'ERROR');
            return false;
        }
    }

    createBufferSource(buffer, type) {
        if (this.sources.get(type)) {
            this.sources.get(type).disconnect();
            this.sources.get(type).stop();
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.gainNodes.get(type));
        this.sources.set(type, source);
        
        logger(`Created buffer source for ${type}`, 'DEBUG');
        return source;
    }

    play() {
        if (this.playing) return;

        const currentTime = this.audioContext.currentTime;
        const offset = this.pauseTime;

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        if (this.instrumental) {
            const instrumentalSource = this.createBufferSource(this.instrumental, 'instrumental');
            instrumentalSource.start(0, offset);
        }

        if (this.vocal) {
            const vocalSource = this.createBufferSource(this.vocal, 'vocal');
            vocalSource.start(0, offset);
        }

        this.playing = true;
        this.startTime = currentTime - offset;
        logger('Playback started', 'INFO');
    }

    pause() {
        if (!this.playing) return;
        
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        this.playing = false;
        this.audioContext.suspend();
        logger('Playback paused', 'INFO');
    }

    stop() {
        if (!this.playing) return;
        
        this.pauseTime = 0;
        this.playing = false;
        this.audioContext.suspend();
        logger('Playback stopped', 'INFO');
    }

    setVolume(type, value) {
        const gainNode = this.gainNodes.get(type);
        if (gainNode) {
            gainNode.gain.value = value;
            logger(`Volume for ${type} set to ${value}`, 'DEBUG');
        }
    }

    getAnalyzerNode(type, analyzerType = 'rms') {
        const analyzers = this.analyzerNodes.get(type);
        return analyzers ? analyzers[analyzerType] : null;
    }

    getCurrentTime() {
        if (!this.playing) return this.pauseTime;
        return this.audioContext.currentTime - this.startTime;
    }

    getDuration() {
        return this.master ? this.master.duration :
               this.instrumental ? this.instrumental.duration :
               this.vocal ? this.vocal.duration : 0;
    }

    seek(time) {
        const wasPlaying = this.playing;
        if (wasPlaying) {
            this.stop();
        }
        this.pauseTime = time;
        if (wasPlaying) {
            this.play();
        }
        logger(`Seeked to ${time}s`, 'DEBUG');
    }

    createEffect(type, track) {
        let effect;
        switch (type) {
            case 'reverb':
                effect = this.audioContext.createConvolver();
                // Load impulse response...
                break;
            case 'delay':
                effect = this.audioContext.createDelay();
                effect.delayTime.value = 0.5;
                break;
            case 'eq':
                effect = this.audioContext.createBiquadFilter();
                break;
            default:
                throw new Error(`Unknown effect type: ${type}`);
        }
        
        this.effects.get(track).push({
            type,
            node: effect,
            bypass: false
        });

        this.reconnectEffectsChain(track);
        return effect;
    }

    reconnectEffectsChain(track) {
        const source = this.sources.get(track);
        const gainNode = this.gainNodes.get(track);
        const analyzerNode = this.analyzerNodes.get(track);
        const effects = this.effects.get(track);

        if (!source || !gainNode || !analyzerNode) return;

        // Disconnect all nodes
        source.disconnect();
        gainNode.disconnect();
        effects.forEach(effect => effect.node.disconnect());

        // Reconnect chain
        let currentNode = source;
        currentNode.connect(gainNode);
        currentNode = gainNode;

        effects.forEach(effect => {
            if (!effect.bypass) {
                currentNode.connect(effect.node);
                currentNode = effect.node;
            }
        });

        currentNode.connect(analyzerNode);
        
        if (track === 'master') {
            analyzerNode.connect(this.audioContext.destination);
        } else {
            analyzerNode.connect(this.gainNodes.get('master'));
        }
    }

    toggleSolo(track) {
        const currentState = this.soloStates.get(track);
        this.soloStates.set(track, !currentState);
        
        // Update gain nodes based on solo states
        this.updateTrackStates();
        
        logger(`${track} solo ${!currentState ? 'enabled' : 'disabled'}`, 'DEBUG');
    }

    toggleMute(track) {
        const currentState = this.muteStates.get(track);
        this.muteStates.set(track, !currentState);
        
        // Update gain nodes based on mute states
        this.updateTrackStates();
        
        logger(`${track} mute ${!currentState ? 'enabled' : 'disabled'}`, 'DEBUG');
    }

    updateTrackStates() {
        const anySolo = Array.from(this.soloStates.values()).some(state => state);

        ['instrumental', 'vocal'].forEach(track => {
            const gainNode = this.gainNodes.get(track);
            if (gainNode) {
                const isMuted = this.muteStates.get(track);
                const isSolo = this.soloStates.get(track);
                
                // If any track is soloed, only play soloed tracks
                if (anySolo) {
                    gainNode.gain.value = isSolo ? 1 : 0;
                } else {
                    gainNode.gain.value = isMuted ? 0 : 1;
                }
            }
        });
    }

    setAutoNormalize(enabled) {
        this.autoNormalize = enabled;
        if (enabled) {
            this.normalizeAudio();
        } else {
            this.resetNormalization();
        }
        logger(`Auto normalize ${enabled ? 'enabled' : 'disabled'}`, 'DEBUG');
    }

    setStereoEnhancement(enabled) {
        this.stereoEnhancement = enabled;
        if (enabled) {
            this.enhanceStereo();
        } else {
            this.resetStereo();
        }
        logger(`Stereo enhancement ${enabled ? 'enabled' : 'disabled'}`, 'DEBUG');
    }

    setHighQuality(enabled) {
        this.highQuality = enabled;
        this.updateQualitySettings();
        logger(`High quality processing ${enabled ? 'enabled' : 'disabled'}`, 'DEBUG');
    }

    normalizeAudio() {
        if (!this.autoNormalize) return;

        ['instrumental', 'vocal'].forEach(track => {
            const source = this.sources.get(track);
            if (source && source.buffer) {
                const buffer = source.buffer;
                const peaks = this.getPeaks(buffer);
                const maxPeak = Math.max(...peaks);
                if (maxPeak > 0) {
                    const gain = this.gainNodes.get(track);
                    gain.gain.value = 1 / maxPeak;
                }
            }
        });
    }

    getPeaks(buffer) {
        const peaks = [];
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            let peak = 0;
            for (let i = 0; i < data.length; i++) {
                const abs = Math.abs(data[i]);
                if (abs > peak) peak = abs;
            }
            peaks.push(peak);
        }
        return peaks;
    }

    resetNormalization() {
        ['instrumental', 'vocal'].forEach(track => {
            const gain = this.gainNodes.get(track);
            if (gain) gain.gain.value = 1;
        });
    }

    enhanceStereo() {
        if (!this.stereoEnhancement) return;

        ['instrumental', 'vocal'].forEach(track => {
            const source = this.sources.get(track);
            if (source && source.buffer && source.buffer.numberOfChannels === 2) {
                const stereoEnhancer = this.audioContext.createStereoPanner();
                stereoEnhancer.pan.value = track === 'instrumental' ? -0.3 : 0.3;
                
                // Insert the enhancer into the chain
                const effects = this.effects.get(track);
                effects.push({
                    type: 'stereo-enhancer',
                    node: stereoEnhancer,
                    bypass: false
                });
                
                this.reconnectEffectsChain(track);
            }
        });
    }

    resetStereo() {
        ['instrumental', 'vocal'].forEach(track => {
            const effects = this.effects.get(track);
            const enhancerIndex = effects.findIndex(e => e.type === 'stereo-enhancer');
            if (enhancerIndex !== -1) {
                effects.splice(enhancerIndex, 1);
                this.reconnectEffectsChain(track);
            }
        });
    }

    updateQualitySettings() {
        ['instrumental', 'vocal', 'master'].forEach(track => {
            const analyzers = this.analyzerNodes.get(track);
            if (analyzers) {
                analyzers.rms.fftSize = this.highQuality ? 2048 : 1024;
                analyzers.spectral.fftSize = this.highQuality ? 2048 : 1024;
                analyzers.rms.smoothingTimeConstant = this.highQuality ? 0.8 : 0.6;
                analyzers.spectral.smoothingTimeConstant = this.highQuality ? 0.85 : 0.7;
            }
        });
    }
}

export default AudioProcessor; 