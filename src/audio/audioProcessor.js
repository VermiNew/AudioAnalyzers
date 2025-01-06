import logger from '../utils/logger.js';

class AudioProcessor {
    constructor() {
        // Create AudioContext
        this.audioContext = null;
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
        this.userVolumes = new Map();
        
        // Settings
        this.autoNormalize = false;
        this.stereoEnhancement = false;
        this.highQuality = true;

        // Initialize states and default volumes
        ['instrumental', 'vocal', 'master'].forEach(track => {
            try {
                this.effects.set(track, []);
                this.soloStates.set(track, false);
                this.muteStates.set(track, false);
                
                // Set initial volumes
                let volume = 0.7; // default for tracks
                if (track === 'master') {
                    volume = 0.95;
                }
                this.userVolumes.set(track, volume);
            } catch (error) {
                logger(`Error initializing track ${track}: ${error.message}`, 'ERROR');
            }
        });
    }

    async initialize() {
        if (this.audioContext) return;
        
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'playback',
            sampleRate: 48000
        });
        
        // Create limiter for master output
        const limiter = this.audioContext.createDynamicsCompressor();
        limiter.threshold.value = -1.0;  // dB
        limiter.knee.value = 0.0;        // dB
        limiter.ratio.value = 20.0;      // compression ratio
        limiter.attack.value = 0.003;    // seconds
        limiter.release.value = 0.25;    // seconds
        limiter.connect(this.audioContext.destination);
        
        // Initialize master analyzer and gain nodes with limiter
        await this.setupAnalyzers('master', limiter);
        
        // Set initial volumes
        this.gainNodes.get('master').gain.value = this.userVolumes.get('master');

        // Set initial volumes for tracks
        ['instrumental', 'vocal'].forEach(track => {
            if (this.gainNodes.has(track)) {
                this.gainNodes.get(track).gain.value = this.userVolumes.get(track);
            }
        });
    }

    async setupAnalyzers(type, outputNode = null) {
        // Create RMS/Peak analyzer
        const rmsAnalyzer = this.audioContext.createAnalyser();
        rmsAnalyzer.fftSize = 2048;
        rmsAnalyzer.smoothingTimeConstant = 0.8;
        
        // Create spectral analyzer
        const spectralAnalyzer = this.audioContext.createAnalyser();
        spectralAnalyzer.fftSize = 2048;
        spectralAnalyzer.smoothingTimeConstant = 0.85;
        
        // Create gain node with anti-pop filter
        const gainNode = this.audioContext.createGain();
        let volume;
        if (type === 'master') {
            volume = this.userVolumes.get('master');
        } else {
            volume = this.userVolumes.get(type);
        }
        
        // Apply smooth initial volume
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.1);

        // Connect the chain
        gainNode.connect(rmsAnalyzer);
        gainNode.connect(spectralAnalyzer);
        
        if (type === 'master') {
            if (outputNode) {
                rmsAnalyzer.connect(outputNode);
                spectralAnalyzer.connect(outputNode);
            } else {
                rmsAnalyzer.connect(this.audioContext.destination);
                spectralAnalyzer.connect(this.audioContext.destination);
            }
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
        // Ensure AudioContext is initialized
        await this.initialize();
        
        logger(`Loading ${type} file: ${file.name}`, 'INFO');
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            if (type === 'instrumental') {
                this.instrumental = audioBuffer;
                await this.setupAnalyzers('instrumental');
                logger('Instrumental loaded successfully', 'INFO');
            } else if (type === 'vocal') {
                this.vocal = audioBuffer;
                await this.setupAnalyzers('vocal');
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
            const oldSource = this.sources.get(type);
            // Fade out old source
            const currentTime = this.audioContext.currentTime;
            oldSource.gain.setValueAtTime(oldSource.gain.value, currentTime);
            oldSource.gain.linearRampToValueAtTime(0, currentTime + 0.1);
            setTimeout(() => {
                oldSource.disconnect();
                oldSource.stop();
            }, 100);
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        
        // Add gain node to source for smooth transitions
        const sourceGain = this.audioContext.createGain();
        sourceGain.gain.setValueAtTime(0, this.audioContext.currentTime);
        sourceGain.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
        
        source.connect(sourceGain);
        sourceGain.connect(this.gainNodes.get(type));
        
        // Store both source and its gain node
        source.gain = sourceGain.gain;
        this.sources.set(type, source);
        
        logger(`Created buffer source for ${type}`, 'DEBUG');
        return source;
    }

    async play() {
        if (this.playing) return;

        // Ensure AudioContext is initialized and resumed
        await this.initialize();
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const currentTime = this.audioContext.currentTime;
        const offset = this.pauseTime;

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
            this.userVolumes.set(type, value);
            if (this.autoNormalize && type !== 'master') {
                this.normalizeAudio();
            } else {
                gainNode.gain.value = value;
            }
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
        const analyzers = this.analyzerNodes.get(track);
        const effects = this.effects.get(track);

        if (!source || !gainNode || !analyzers) return;

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

        // Connect to analyzers
        currentNode.connect(analyzers.rms);
        currentNode.connect(analyzers.spectral);
        
        if (track === 'master') {
            analyzers.rms.connect(this.audioContext.destination);
            analyzers.spectral.connect(this.audioContext.destination);
        } else {
            analyzers.rms.connect(this.gainNodes.get('master'));
            analyzers.spectral.connect(this.gainNodes.get('master'));
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
        try {
            const anySolo = Array.from(this.soloStates.values()).some(state => state);

            ['instrumental', 'vocal'].forEach(track => {
                const gainNode = this.gainNodes.get(track);
                if (gainNode) {
                    const isMuted = this.muteStates.get(track);
                    const isSolo = this.soloStates.get(track);
                    const userVolume = this.userVolumes.get(track);
                    
                    let finalVolume = userVolume;

                    // If any track is soloed
                    if (anySolo) {
                        finalVolume = isSolo ? userVolume : 0;
                    }
                    
                    // Apply mute state
                    if (isMuted) {
                        finalVolume = 0;
                    }

                    // Apply volume with smooth transition
                    const currentTime = this.audioContext.currentTime;
                    gainNode.gain.cancelScheduledValues(currentTime);
                    gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
                    gainNode.gain.linearRampToValueAtTime(finalVolume, currentTime + 0.05);
                }
            });
        } catch (error) {
            logger(`Error updating track states: ${error.message}`, 'ERROR');
        }
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

        let maxPeak = 0;
        ['instrumental', 'vocal'].forEach(track => {
            const source = this.sources.get(track);
            if (source && source.buffer) {
                const peaks = this.getPeaks(source.buffer);
                maxPeak = Math.max(maxPeak, ...peaks);
            }
        });

        if (maxPeak > 0) {
            const normalizeGain = 0.8 / maxPeak; // Target level of 80%
            ['instrumental', 'vocal'].forEach(track => {
                const gain = this.gainNodes.get(track);
                if (gain) {
                    const userVolume = this.userVolumes.get(track);
                    gain.gain.value = normalizeGain * userVolume;
                }
            });
        }
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
            if (gain) {
                gain.gain.value = this.userVolumes.get(track);
            }
        });
    }

    enhanceStereo() {
        if (!this.stereoEnhancement) return;

        ['instrumental', 'vocal'].forEach(track => {
            try {
                const source = this.sources.get(track);
                if (!source || !source.buffer || source.buffer.numberOfChannels !== 2) {
                    logger(`Skipping stereo enhancement for ${track}: invalid source or not stereo`, 'DEBUG');
                    return;
                }

                const stereoEnhancer = this.audioContext.createStereoPanner();
                let panValue = 0;
                if (track === 'instrumental') {
                    panValue = -0.3;
                } else {
                    panValue = 0.3;
                }
                stereoEnhancer.pan.value = panValue;
                
                // Remove any existing stereo enhancer
                const effects = this.effects.get(track);
                const enhancerIndex = effects.findIndex(e => e.type === 'stereo-enhancer');
                if (enhancerIndex !== -1) {
                    effects.splice(enhancerIndex, 1);
                }
                
                // Add new stereo enhancer
                effects.push({
                    type: 'stereo-enhancer',
                    node: stereoEnhancer,
                    bypass: false
                });
                
                this.reconnectEffectsChain(track);
                logger(`Stereo enhancement applied to ${track}`, 'DEBUG');
            } catch (error) {
                logger(`Error applying stereo enhancement to ${track}: ${error.message}`, 'ERROR');
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