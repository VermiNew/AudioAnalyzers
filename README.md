# Audio Analyzer Studio

A professional web-based audio analysis and mixing tool that allows you to visualize and process audio tracks in real-time. Features include waveform visualization, spectrum analysis, and separate control over instrumental and vocal tracks.

## Features

- Real-time audio visualization (waveform, spectrum, circular)
- Separate control for instrumental and vocal tracks
- Volume control with automatic normalization
- Stereo enhancement capabilities
- High-quality audio processing
- Professional mixing tools (solo, mute, effects)
- Responsive and modern UI

## Prerequisites

- Python 3.8 or higher
- Node.js 14.0 or higher
- Modern web browser with Web Audio API support

## Quick Start

### Windows
```bash
setup.bat
```

### Linux/MacOS
```bash
chmod +x setup.sh
./setup.sh
```

The setup scripts will automatically:
1. Create a Python virtual environment
2. Install required Python dependencies
3. Set up the Flask server
4. Configure the development environment

## Manual Setup

If you prefer manual setup:

1. Create Python virtual environment:
```bash
python -m venv venv
```

2. Activate virtual environment:
- Windows: `venv\Scripts\activate`
- Linux/MacOS: `source venv/bin/activate`

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Start the server:
```bash
python server.py
```

5. Open your browser and navigate to `http://localhost:5000`

## Usage

1. Upload your audio files (instrumental and vocal tracks)
2. Use the transport controls to play, pause, and stop playback
3. Adjust individual track volumes using the volume sliders
4. Toggle solo/mute for each track as needed
5. Enable/disable audio processing features:
   - Auto-normalize
   - Stereo enhancement
   - High-quality mode

## Development

The project structure:
```
├── server.py           # Flask server
├── requirements.txt    # Python dependencies
├── setup.bat          # Windows setup script
├── setup.sh           # Linux/MacOS setup script
├── src/
│   ├── app.js         # Main application logic
│   ├── audio/         # Audio processing modules
│   ├── styles.css     # Application styles
│   └── utils/         # Utility functions
└── index.html         # Main HTML file
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
