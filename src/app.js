import AudioProcessor from './audio/audioProcessor.js';
import { WaveformVisualizer, BarVisualizer, CircleVisualizer } from './audio/visualizers.js';
import logger from './utils/logger.js';
import { showInfoToast, showWarningToast, showErrorToast } from './utils/showToast.js';

class EventEmitter {
    constructor() {
        this.events = new Map();
    }

    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(callback);
    }

    emit(event, data) {
        if (this.events.has(event)) {
            this.events.get(event).forEach(callback => callback(data));
        }
    }
}

class AudioMixerApp extends EventEmitter {
    constructor() {
        super();
        this.audioProcessor = new AudioProcessor();
        this.visualizers = new Map();
        this.animationFrameId = null;
        
        // Theme initialization
        const mixer = document.getElementById('audio-mixer');
        this.theme = mixer ? (mixer.classList.contains('light') ? 'light' : 'dark') : 'dark';
        
        this.settings = {
            autoNormalize: false,
            stereoEnhancement: false,
            highQuality: true
        };
        
        // Setup event handlers and accessibility
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.setupAccessibility();
        
        // Show welcome dialog
        this.showWelcomeDialog();
        
        // Cleanup on page unload
        window.addEventListener('unload', () => this.cleanup());
        
        logger('Audio Mixer App initialized', 'SYSTEM');
    }

    cleanup() {
        // Stop all visualizers
        this.visualizers.forEach(visualizerGroup => {
            visualizerGroup.forEach(visualizer => visualizer.stop());
        });
        
        // Clear animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // Stop audio processing
        this.audioProcessor.stop();
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        
        logger('Application cleanup completed', 'SYSTEM');
        showInfoToast('Application cleanup completed');
    }

    handleResize = () => {
        // Update visualizers on resize
        this.visualizers.forEach(visualizerGroup => {
            visualizerGroup.forEach(visualizer => {
                if (visualizer.resize) {
                    visualizer.resize();
                }
            });
        });
    }

    setupAccessibility() {
        // Add ARIA labels and roles
        document.querySelectorAll('.track-container').forEach(container => {
            container.setAttribute('role', 'region');
            container.setAttribute('aria-label', 'Audio Track Controls');
        });

        document.querySelectorAll('.meter').forEach(meter => {
            meter.setAttribute('role', 'meter');
            meter.setAttribute('aria-valuemin', '0');
            meter.setAttribute('aria-valuemax', '100');
        });

        // Add keyboard navigation
        this.setupKeyboardNavigation();
    }

    setupKeyboardNavigation() {
        const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const focusable = Array.from(document.querySelectorAll(focusableElements));
                const firstFocusable = focusable[0];
                const lastFocusable = focusable[focusable.length - 1];

                if (e.shiftKey && document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable.focus();
                } else if (!e.shiftKey && document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable.focus();
                }
            }
        });
    }

    initializeVisualizers(track) {
        const analyzerNode = this.audioProcessor.getAnalyzerNode(track);
        if (analyzerNode) {
            const waveCanvas = document.getElementById(`${track}-wave`);
            const barsCanvas = document.getElementById(`${track}-bars`);
            const circleCanvas = document.getElementById(`${track}-circle`);

            if (waveCanvas && barsCanvas && circleCanvas) {
                // Stop and remove old visualizers if they exist
                const oldVisualizers = this.visualizers.get(track);
                if (oldVisualizers) {
                    oldVisualizers.forEach(v => v.stop());
                }

                // Create new visualizers
                const waveform = new WaveformVisualizer(analyzerNode, waveCanvas);
                const bars = new BarVisualizer(analyzerNode, barsCanvas);
                const circle = new CircleVisualizer(analyzerNode, circleCanvas);

                // Store visualizers
                this.visualizers.set(track, [waveform, bars, circle]);

                // Start animations
                waveform.start();
                bars.start();
                circle.start();

                logger(`Initialized visualizers for ${track}`, 'DEBUG');
            }
        }
    }

    showWelcomeDialog() {
        // Remove existing dialog if it exists
        const existingDialog = document.querySelector('.welcome-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        // Hide controls
        document.querySelector('.settings-panel')?.style.setProperty('display', 'none');
        document.querySelector('.volume-menu')?.style.setProperty('display', 'none');
        document.querySelector('#settings-toggle')?.style.setProperty('display', 'none');
        document.querySelector('#volume-toggle')?.style.setProperty('display', 'none');
        document.querySelector('.transport-controls')?.style.setProperty('display', 'none');

        const dialog = document.createElement('div');
        dialog.className = 'welcome-dialog';
        dialog.innerHTML = `
            <div class="welcome-content">
                <h2>Welcome to Audio Analyzer Studio</h2>
                <p>To begin, please select your audio files:</p>
                <div class="file-inputs">
                    <div class="file-input-group">
                        <label for="welcome-instrumental">Instrumental Track:</label>
                        <input type="file" id="welcome-instrumental" accept="audio/*">
                    </div>
                    <div class="file-input-group">
                        <label for="welcome-vocal">Vocal Track:</label>
                        <input type="file" id="welcome-vocal" accept="audio/*">
                    </div>
                </div>
                <button id="welcome-start" disabled>Start</button>
            </div>
        `;
        document.body.appendChild(dialog);

        const startButton = document.getElementById('welcome-start');
        const instrumentalInput = document.getElementById('welcome-instrumental');
        const vocalInput = document.getElementById('welcome-vocal');

        if (startButton && instrumentalInput && vocalInput) {
            const checkFiles = () => {
                startButton.disabled = !(instrumentalInput.files[0] && vocalInput.files[0]);
            };

            instrumentalInput.addEventListener('change', checkFiles);
            vocalInput.addEventListener('change', checkFiles);

            startButton.addEventListener('click', async () => {
                const instrumental = instrumentalInput.files[0];
                const vocal = vocalInput.files[0];

                if (instrumental && vocal) {
                    try {
                        await this.handleFileInput(instrumental, 'instrumental');
                        await this.handleFileInput(vocal, 'vocal');
                        dialog.remove();
                        
                        // Show controls after closing dialog
                        document.querySelector('#settings-toggle')?.style.removeProperty('display');
                        document.querySelector('#volume-toggle')?.style.removeProperty('display');
                        document.querySelector('.transport-controls')?.style.removeProperty('display');
                    } catch (error) {
                        logger(`Error loading audio files: ${error.message}`, 'ERROR');
                        showErrorToast(`Error loading audio files: ${error.message}`);
                    }
                }
            });
        }
    }

    setupEventListeners() {
        // Volume menu controls
        const volumeToggle = document.getElementById('volume-toggle');
        const volumeMenu = document.querySelector('.volume-menu');
        const closeVolume = document.getElementById('close-volume');

        if (volumeToggle && volumeMenu) {
            volumeToggle.addEventListener('click', () => {
                volumeMenu.style.display = volumeMenu.style.display === 'none' ? 'block' : 'none';
            });
        }

        if (closeVolume) {
            closeVolume.addEventListener('click', () => {
                volumeMenu.style.display = 'none';
            });
        }

        // Volume controls with value display
        ['instrumental', 'vocal', 'master'].forEach(track => {
            const volumeSlider = document.getElementById(`${track}-volume-menu`);
            const volumeValue = volumeSlider.closest('.volume-slider-container').querySelector('.volume-slider-value');
            
            volumeSlider.addEventListener('input', (e) => {
                const value = Math.round(e.target.value * 100);
                volumeValue.textContent = `${value}%`;
                this.audioProcessor.setVolume(track, e.target.value);
            });

            // Solo and mute buttons for tracks (except master)
            if (track !== 'master') {
                const soloBtn = document.querySelector(`button.solo-btn[data-track="${track}"]`);
                const muteBtn = document.querySelector(`button.mute-btn[data-track="${track}"]`);

                if (soloBtn) {
                    soloBtn.addEventListener('click', () => {
                        const wasSolo = soloBtn.classList.contains('active');
                        // Remove active state from other solo buttons if this is being activated
                        if (!wasSolo) {
                            document.querySelectorAll('button.solo-btn').forEach(btn => {
                                if (btn !== soloBtn) {
                                    btn.classList.remove('active');
                                    const otherTrack = btn.getAttribute('data-track');
                                    if (otherTrack) {
                                        this.audioProcessor.soloStates.set(otherTrack, false);
                                    }
                                }
                            });
                        }
                        soloBtn.classList.toggle('active');
                        this.audioProcessor.toggleSolo(track);
                    });
                }

                if (muteBtn) {
                    muteBtn.addEventListener('click', () => {
                        // If track is soloed, remove solo first
                        const soloBtn = document.querySelector(`button.solo-btn[data-track="${track}"]`);
                        if (soloBtn && soloBtn.classList.contains('active')) {
                            soloBtn.classList.remove('active');
                            this.audioProcessor.soloStates.set(track, false);
                        }
                        muteBtn.classList.toggle('active');
                        this.audioProcessor.toggleMute(track);
                    });
                }
            }
        });

        // Settings panel controls
        const settingsToggle = document.getElementById('settings-toggle');
        const settingsPanel = document.querySelector('.settings-panel');
        const closeSettings = document.getElementById('close-settings');

        if (settingsToggle && settingsPanel) {
            settingsToggle.addEventListener('click', () => {
                settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
            });
        }

        if (closeSettings) {
            closeSettings.addEventListener('click', () => {
                settingsPanel.style.display = 'none';
            });
        }

        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Change files button
        const changeFiles = document.getElementById('change-files');
        if (changeFiles) {
            changeFiles.addEventListener('click', () => this.showWelcomeDialog());
        }

        // Settings checkboxes
        const autoNormalize = document.getElementById('auto-normalize');
        const stereoEnhancement = document.getElementById('stereo-enhancement');
        const highQuality = document.getElementById('high-quality');

        if (autoNormalize) {
            autoNormalize.checked = this.settings.autoNormalize;
            const normalizeLabel = autoNormalize.parentElement;
            const infoSpan = document.createElement('span');
            infoSpan.className = 'settings-info';
            infoSpan.style.marginLeft = '8px';
            infoSpan.style.fontSize = '0.8em';
            infoSpan.style.opacity = '0.8';
            normalizeLabel.appendChild(infoSpan);

            autoNormalize.addEventListener('change', (e) => {
                this.settings.autoNormalize = e.target.checked;
                this.audioProcessor.setAutoNormalize(e.target.checked);
                
                if (e.target.checked) {
                    // Store current user volumes
                    ['instrumental', 'vocal'].forEach(track => {
                        const volume = this.audioProcessor.userVolumes.get(track);
                        if (volume !== undefined) {
                            const volumeControls = document.querySelectorAll(`input[type="range"]#${track}-volume`);
                            volumeControls.forEach(control => {
                                control.setAttribute('data-original-value', volume);
                            });
                        }
                    });
                    
                    // Update info span
                    this.updateNormalizationInfo();
                } else {
                    // Restore original volumes
                    ['instrumental', 'vocal'].forEach(track => {
                        const volumeControls = document.querySelectorAll(`input[type="range"]#${track}-volume`);
                        volumeControls.forEach(control => {
                            const originalValue = control.getAttribute('data-original-value');
                            if (originalValue) {
                                control.value = originalValue;
                                this.audioProcessor.setVolume(track, parseFloat(originalValue));
                            }
                        });
                    });
                    infoSpan.textContent = '';
                }
            });

            // Update normalization info periodically when settings panel is visible
            setInterval(() => {
                if (document.querySelector('.settings-panel').style.display !== 'none' && this.settings.autoNormalize) {
                    this.updateNormalizationInfo();
                }
            }, 1000);
        }

        if (stereoEnhancement) {
            stereoEnhancement.checked = this.settings.stereoEnhancement;
            stereoEnhancement.addEventListener('change', (e) => {
                this.settings.stereoEnhancement = e.target.checked;
                this.audioProcessor.setStereoEnhancement(e.target.checked);
            });
        }

        if (highQuality) {
            highQuality.checked = this.settings.highQuality;
            highQuality.addEventListener('change', (e) => {
                this.settings.highQuality = e.target.checked;
                this.audioProcessor.setHighQuality(e.target.checked);
            });
        }

        // Add solo and mute buttons for each track
        ['instrumental', 'vocal'].forEach(track => {
            const container = document.querySelector(`[data-track="${track}"] .volume-controls`);
            if (container) {
                const soloButton = document.createElement('button');
                soloButton.innerHTML = '<i class="fas fa-headphones"></i>';
                soloButton.title = 'Solo';
                soloButton.onclick = () => this.audioProcessor.toggleSolo(track);

                const muteButton = document.createElement('button');
                muteButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
                muteButton.title = 'Mute';
                muteButton.onclick = () => this.audioProcessor.toggleMute(track);

                container.appendChild(soloButton);
                container.appendChild(muteButton);
            }
        });

        // Transport controls
        const playButton = document.getElementById('play');
        const pauseButton = document.getElementById('pause');
        const stopButton = document.getElementById('stop');
        const seekBar = document.getElementById('seek');

        if (playButton) {
            playButton.onclick = async () => {
                try {
                    await this.audioProcessor.play();
                } catch (error) {
                    logger(`Error playing audio: ${error.message}`, 'ERROR');
                    showErrorToast(`Error playing audio: ${error.message}`);
                }
            };
        }
        if (pauseButton) pauseButton.onclick = () => this.audioProcessor.pause();
        if (stopButton) stopButton.onclick = () => this.audioProcessor.stop();
        if (seekBar) {
            seekBar.oninput = (e) => {
                const duration = this.audioProcessor.getDuration();
                this.audioProcessor.seek((e.target.value / 100) * duration);
            };
        }

        this.startUpdateLoop();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.audioProcessor.playing) {
                    this.audioProcessor.pause();
                } else {
                    this.audioProcessor.play();
                }
            } else if (e.code === 'KeyS' && e.ctrlKey) {
                e.preventDefault();
                this.audioProcessor.stop();
            } else if (e.code === 'KeyM') {
                e.preventDefault();
                const track = document.activeElement.closest('.track-container')?.dataset.track;
                if (track) {
                    this.audioProcessor.toggleMute(track);
                }
            } else if (e.code === 'KeyS') {
                e.preventDefault();
                const track = document.activeElement.closest('.track-container')?.dataset.track;
                if (track) {
                    this.audioProcessor.toggleSolo(track);
                }
            }
        });

        logger('Keyboard shortcuts initialized', 'SYSTEM');
    }

    async handleFileInput(file, type) {
        try {
            // Validate file type
            if (!file.type.startsWith('audio/')) {
                showErrorToast(`Invalid file type. Please select an audio file for ${type} track`);
                return false;
            }

            // Validate file size (max 100MB)
            const maxSize = 100 * 1024 * 1024; // 100MB in bytes
            if (file.size > maxSize) {
                showErrorToast(`File size too large. Maximum size is 100MB`);
                return false;
            }

            logger(`Loading ${type} file: ${file.name}`, 'INFO');
            showInfoToast(`Loading ${type} track: ${file.name}`);
            
            if (await this.audioProcessor.loadFile(file, type)) {
                // Initialize visualizers for the new track
                this.initializeVisualizers(type);
                
                if (this.audioProcessor.instrumental && this.audioProcessor.vocal) {
                    // Both tracks are loaded, initialize master track visualizers
                    this.initializeVisualizers('master');
                    showInfoToast('All tracks loaded successfully');
                }
                return true;
            }
            showWarningToast(`Failed to load ${type} track`);
            return false;
        } catch (error) {
            logger(`Error loading ${type} file: ${error.message}`, 'ERROR');
            showErrorToast(`Error loading ${type} track: ${error.message}`);
            return false;
        }
    }

    startUpdateLoop() {
        const update = () => {
            // Update time display and seek bar
            const currentTime = this.audioProcessor.getCurrentTime();
            const duration = this.audioProcessor.getDuration();
            
            const timeDisplay = document.getElementById('time-display');
            const seekBar = document.getElementById('seek');
            
            if (timeDisplay) {
                timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
            }
            
            if (seekBar) {
                seekBar.value = duration ? (currentTime / duration) * 100 : 0;
            }

            this.animationFrameId = requestAnimationFrame(update);
        };

        update();
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    toggleTheme() {
        const mixer = document.getElementById('audio-mixer');
        if (mixer) {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            mixer.classList.toggle('dark');
            mixer.classList.toggle('light');
            showInfoToast(`Theme switched to ${this.theme} mode`);
        }
    }

    updateNormalizationInfo() {
        const infoSpan = document.querySelector('.settings-info');
        if (!infoSpan) return;

        let maxPeak = 0;
        ['instrumental', 'vocal'].forEach(track => {
            const source = this.audioProcessor.sources.get(track);
            if (source && source.buffer) {
                const peaks = this.audioProcessor.getPeaks(source.buffer);
                maxPeak = Math.max(maxPeak, ...peaks);
            }
        });

        if (maxPeak > 0) {
            const normalizeGain = 0.8 / maxPeak;
            infoSpan.textContent = `(Gain: ${(normalizeGain * 100).toFixed(1)}%)`;
        } else {
            infoSpan.textContent = '';
        }
    }
}

// Create and export app instance
const app = new AudioMixerApp();
export default app; 