// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Dark mode handling
    const darkModeToggle = document.getElementById('darkMode');
    
    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.setAttribute('data-theme', 'dark');
        darkModeToggle.checked = true;
    }

    darkModeToggle.addEventListener('change', function() {
        if (this.checked) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('darkMode', 'false');
        }
    });

    // Audio upload handling
    const setupAudioUpload = (fileInput, audioPlayer, uploadArea) => {
        const updateUploadArea = (isActive) => {
            if (isActive) {
                uploadArea.classList.add('drag-over');
            } else {
                uploadArea.classList.remove('drag-over');
            }
        };

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Drag & drop events
        uploadArea.addEventListener('dragenter', () => updateUploadArea(true));
        uploadArea.addEventListener('dragover', () => updateUploadArea(true));
        uploadArea.addEventListener('dragleave', () => updateUploadArea(false));
        uploadArea.addEventListener('drop', (e) => {
            updateUploadArea(false);
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('audio/')) {
                handleFile(file);
            } else {
                showError(uploadArea, 'Please upload an audio file');
            }
        });

        // Click upload handling
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFile(file);
            }
        });

        const showError = (element, message) => {
            const p = element.querySelector('p');
            const originalText = p.textContent;
            p.textContent = message;
            p.style.color = '#ff6b6b';
            
            setTimeout(() => {
                p.textContent = originalText;
                p.style.color = '';
            }, 3000);
        };

        const handleFile = (file) => {
            const audioUrl = URL.createObjectURL(file);
            audioPlayer.src = audioUrl;
            
            // Update upload area to show file name
            const fileName = file.name;
            const uploadText = uploadArea.querySelector('p');
            uploadText.textContent = `File selected: ${fileName}`;
            
            // Show the audio player container
            audioPlayer.parentElement.style.display = 'block';
        };
    };

    // Setup both upload areas
    setupAudioUpload(
        document.getElementById('audioFile1'),
        document.getElementById('audioPlayer1'),
        document.getElementById('instrumentalUpload')
    );

    setupAudioUpload(
        document.getElementById('audioFile2'),
        document.getElementById('audioPlayer2'),
        document.getElementById('vocalUpload')
    );

    // Initially hide audio players until files are uploaded
    document.querySelectorAll('.player-container').forEach(container => {
        container.style.display = 'none';
    });
});