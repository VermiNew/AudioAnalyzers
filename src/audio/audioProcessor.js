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

        this.bufferSize = 1024;
        this.initialize();
    }

    async initialize() {
        if (this.audioContext) return;
        
        logger('Initializing AudioProcessor', 'SYSTEM');
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'playback',
                sampleRate: 48000
            });
            
            logger(`AudioContext created with sample rate: ${this.audioContext.sampleRate}Hz`, 'DEBUG');
            
            // Create limiter for master output
            this.limiter = this.audioContext.createDynamicsCompressor();
            this.limiter.threshold.value = -1.0;  // dB
            this.limiter.knee.value = 0.0;        // dB
            this.limiter.ratio.value = 20.0;      // compression ratio
            this.limiter.attack.value = 0.003;    // seconds
            this.limiter.release.value = 0.25;    // seconds
            this.limiter.connect(this.audioContext.destination);
            
            logger('Master limiter configured', 'DEBUG');
            
            // Initialize master analyzer and gain nodes with limiter
            await this.setupAnalyzers('master', this.limiter);
            
            // Set initial volumes
            this.gainNodes.get('master').gain.value = this.userVolumes.get('master');
            logger(`Master volume set to ${this.userVolumes.get('master')}`, 'DEBUG');

            // Set initial volumes for tracks
            ['instrumental', 'vocal'].forEach(track => {
                if (this.gainNodes.has(track)) {
                    this.gainNodes.get(track).gain.value = this.userVolumes.get(track);
                    logger(`${track} volume set to ${this.userVolumes.get(track)}`, 'DEBUG');
                }
            });
            
            logger('AudioProcessor initialization complete', 'SYSTEM');
        } catch (error) {
            logger(`Failed to initialize AudioProcessor: ${error.message}`, 'CRITICAL');
            throw error;
        }
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
            logger(`File ${file.name} loaded into memory`, 'DEBUG');
            
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            logger(`Audio data decoded successfully: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels`, 'DEBUG');
            
            if (type === 'instrumental') {
                this.instrumental = audioBuffer;
                await this.setupAnalyzers('instrumental');
                logger('Instrumental track analyzers configured', 'DEBUG');
            } else if (type === 'vocal') {
                this.vocal = audioBuffer;
                await this.setupAnalyzers('vocal');
                logger('Vocal track analyzers configured', 'DEBUG');
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

        // Handle end of playback
        source.onended = () => {
            // Check if all sources have finished playing
            const allSourcesEnded = Array.from(this.sources.values())
                .every(src => !src.buffer || src.playbackState === 'finished');
            
            if (allSourcesEnded) {
                this.stop();
                this.playing = false;
                this.pauseTime = 0;
                this.startTime = 0;
                if (this.onPlaybackEnd) {
                    this.onPlaybackEnd();
                }
                logger('Playback finished', 'INFO');
            }
        };
        
        logger(`Created buffer source for ${type}`, 'DEBUG');
        return source;
    }

    async play() {
        if (this.playing) return;

        try {
            // Ensure AudioContext is initialized and resumed
            await this.initialize();
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                logger('AudioContext resumed', 'DEBUG');
            }

            const currentTime = this.audioContext.currentTime;
            const offset = this.pauseTime;

            if (this.instrumental) {
                const instrumentalSource = this.createBufferSource(this.instrumental, 'instrumental');
                instrumentalSource.start(0, offset);
                logger(`Instrumental playback started at offset ${offset.toFixed(2)}s`, 'DEBUG');
            }

            if (this.vocal) {
                const vocalSource = this.createBufferSource(this.vocal, 'vocal');
                vocalSource.start(0, offset);
                logger(`Vocal playback started at offset ${offset.toFixed(2)}s`, 'DEBUG');
            }

            this.playing = true;
            this.startTime = currentTime - offset;
            logger('Playback started', 'INFO');
        } catch (error) {
            logger(`Error starting playback: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    pause() {
        if (!this.playing) return;
        
        try {
            this.pauseTime = this.audioContext.currentTime - this.startTime;
            this.playing = false;
            this.audioContext.suspend();
            logger(`Playback paused at ${this.pauseTime.toFixed(2)}s`, 'INFO');
        } catch (error) {
            logger(`Error pausing playback: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    stop() {
        if (!this.playing) return;
        
        try {
            this.pauseTime = 0;
            this.startTime = 0;
            this.playing = false;
            this.audioContext.suspend();
            logger('Playback stopped', 'INFO');
        } catch (error) {
            logger(`Error stopping playback: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    setVolume(type, value) {
        const gainNode = this.gainNodes.get(type);
        if (gainNode) {
            try {
                this.userVolumes.set(type, value);
                if (this.autoNormalize && type !== 'master') {
                    this.normalizeAudio();
                    logger(`Volume normalization applied for ${type}`, 'DEBUG');
                } else {
                    gainNode.gain.value = value;
                    logger(`Volume set for ${type}: ${value}`, 'DEBUG');
                }
            } catch (error) {
                logger(`Error setting volume for ${type}: ${error.message}`, 'ERROR');
                throw error;
            }
        }
    }

    getAnalyzerNode(type, analyzerType = 'rms') {
        const analyzers = this.analyzerNodes.get(type);
        return analyzers ? analyzers[analyzerType] : null;
    }

    getCurrentTime() {
        if (!this.playing) return this.pauseTime;
        const duration = this.getDuration();
        const currentTime = this.audioContext.currentTime - this.startTime;
        
        // If we've reached the end of the audio
        if (currentTime >= duration) {
            this.playing = false;
            this.pauseTime = duration;
            this.startTime = 0;
            return duration;
        }
        
        return currentTime;
    }

    getDuration() {
        // Return the shortest duration of loaded tracks
        const durations = [];
        if (this.instrumental) durations.push(this.instrumental.duration);
        if (this.vocal) durations.push(this.vocal.duration);
        return durations.length > 0 ? Math.min(...durations) : 0;
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
        try {
            this.soloStates.set(track, !this.soloStates.get(track));
            this.updateTrackStates();
            logger(`Solo toggled for ${track}: ${this.soloStates.get(track)}`, 'DEBUG');
        } catch (error) {
            logger(`Error toggling solo for ${track}: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    toggleMute(track) {
        try {
            this.muteStates.set(track, !this.muteStates.get(track));
            this.updateTrackStates();
            logger(`Mute toggled for ${track}: ${this.muteStates.get(track)}`, 'DEBUG');
        } catch (error) {
            logger(`Error toggling mute for ${track}: ${error.message}`, 'ERROR');
            throw error;
        }
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
        try {
            this.autoNormalize = enabled;
            if (enabled) {
                this.normalizeAudio();
            } else {
                this.resetNormalization();
            }
            logger(`Auto-normalize ${enabled ? 'enabled' : 'disabled'}`, 'INFO');
        } catch (error) {
            logger(`Error setting auto-normalize: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    setStereoEnhancement(enabled) {
        try {
            this.stereoEnhancement = enabled;
            if (enabled) {
                this.enhanceStereo();
            } else {
                this.resetStereo();
            }
            logger(`Stereo enhancement ${enabled ? 'enabled' : 'disabled'}`, 'INFO');
        } catch (error) {
            logger(`Error setting stereo enhancement: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    setHighQuality(enabled) {
        try {
            this.highQuality = enabled;
            this.updateQualitySettings();
            logger(`High quality mode ${enabled ? 'enabled' : 'disabled'}`, 'INFO');
        } catch (error) {
            logger(`Error setting high quality mode: ${error.message}`, 'ERROR');
            throw error;
        }
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

    setBufferSize(size) {
        if (size && Number.isInteger(size) && size > 0) {
            this.bufferSize = size;
            logger('Buffer size updated: ' + size, 'DEBUG');
            // Reinitialize analyzers with new buffer size if needed
            if (this.initialized) {
                this.setupAnalyzers();
            }
        }
    }

    setLimiterThreshold(value) {
        if (this.limiter) {
            this.limiter.threshold.value = value;
            logger(`Limiter threshold set to ${value}dB`, 'DEBUG');
        }
    }
}

export default AudioProcessor; 