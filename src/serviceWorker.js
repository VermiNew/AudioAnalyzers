const CACHE_NAME = 'audio-analyzers-v1';
const ASSETS = [
    '/',
    './index.html',
    './src/styles.css',
    './src/app.js',
    './src/audio/audioProcessor.js',
    './src/audio/visualizers.js',
    './src/utils/logger.js',
    './src/utils/showToast.js',
    'https://cdn.jsdelivr.net/npm/toastify-js@1.12.0/src/toastify.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Poppins:wght@400;500;600&display=swap'
];

// Install event - cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return Promise.all(
                    ASSETS.map(url => {
                        return fetch(url)
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error(`Failed to fetch ${url}`);
                                }
                                return cache.put(url, response);
                            })
                            .catch(error => {
                                console.error(`Failed to cache ${url}:`, error);
                            });
                    })
                );
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request)
                    .then(response => {
                        // Don't cache audio files
                        if (response.headers.get('content-type')?.includes('audio')) {
                            return response;
                        }
                        
                        // Clone the response before caching
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        return response;
                    });
            })
            .catch(() => {
                // Return offline fallback if available
                return caches.match('./offline.html');
            })
    );
});

// Handle audio file processing
self.addEventListener('message', event => {
    if (event.data.type === 'PROCESS_AUDIO') {
        // Handle audio processing in the background
        processAudio(event.data.file)
            .then(result => {
                event.ports[0].postMessage({
                    type: 'AUDIO_PROCESSED',
                    result
                });
            })
            .catch(error => {
                event.ports[0].postMessage({
                    type: 'AUDIO_PROCESS_ERROR',
                    error: error.message
                });
            });
    }
});

async function processAudio(file) {
    // This is a placeholder for actual audio processing
    // In a real implementation, you might want to:
    // 1. Convert audio formats
    // 2. Apply effects
    // 3. Generate waveform data
    // 4. etc.
    
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                processed: true,
                filename: file.name,
                size: file.size
            });
        }, 1000);
    });
} 