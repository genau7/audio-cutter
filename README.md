# MP3 Editor with Waveform Visualization

An Electron desktop application for editing MP3 and M4A files with waveform visualization. This tool allows you to:
- Open audio files and view their waveform
- Select cutting points for intro and outro
- Preview audio before saving
- Apply fade-in and fade-out effects
- Save edited audio as a new file or overwrite the original

## Installation

1. Ensure you have Node.js installed (version 14+ recommended)
2. Clone this repository
3. Install the required dependencies:
   ```
   npm install
   ```

## Usage

Run the application:
```
npm start
```

### Opening Files
You can open audio files in two ways:
1. Click the "Open MP3" button or use Cmd+O (Ctrl+O on Windows)
2. Drag and drop an audio file directly onto the waveform area

## Features
- Waveform visualization
- Audio playback with position tracking
- Precise time selection for cuts
- Fade in/out effects
- Audio preview before saving
- Drag and drop file selection
- Support for MP3 and M4A audio formats
