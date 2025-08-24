const { ipcRenderer } = require('electron');
const WaveSurfer = require('wavesurfer.js');

// DOM Elements
const waveformEl = document.getElementById('waveform');
const playPauseBtn = document.getElementById('play-pause');
const openFileBtn = document.getElementById('open-file');
const saveFileBtn = document.getElementById('save-file');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const fileNameEl = document.getElementById('file-name');
const statusMessageEl = document.getElementById('status-message');
const introCutInput = document.getElementById('intro-cut');
const outroCutInput = document.getElementById('outro-cut');
const setIntroBtn = document.getElementById('set-intro');
const setOutroBtn = document.getElementById('set-outro');
const fadeInInput = document.getElementById('fade-in');
const fadeOutInput = document.getElementById('fade-out');

// Global variables
let wavesurfer;
let audioContext;
let audioBuffer;
let currentFilePath;
let introCutTime = 0;
let outroCutTime = null; // null means end of file
let isPlaying = false;

// Initialize WaveSurfer
function initWaveSurfer() {
  wavesurfer = WaveSurfer.create({
    container: waveformEl,
    waveColor: '#4a90e2',
    progressColor: '#357abd',
    cursorColor: '#333',
    barWidth: 2,
    barRadius: 3,
    cursorWidth: 1,
    height: 200,
    barGap: 2,
    responsive: true,
    normalize: true
  });

  // WaveSurfer events
  wavesurfer.on('ready', () => {
    enableControls();
    updateTotalTime();
    statusMessageEl.textContent = 'File loaded successfully';
  });

  wavesurfer.on('audioprocess', () => {
    updateCurrentTime();
  });

  wavesurfer.on('seek', () => {
    updateCurrentTime();
  });

  wavesurfer.on('error', (err) => {
    statusMessageEl.textContent = `Error: ${err}`;
  });
}

// Initialize the application
function init() {
  initWaveSurfer();
  setupEventListeners();
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// Setup event listeners
function setupEventListeners() {
  // Open file button
  openFileBtn.addEventListener('click', () => {
    ipcRenderer.send('open-file-dialog');
  });
  
  // Setup drag and drop events
  setupDragAndDrop();

  // Play/Pause button
  playPauseBtn.addEventListener('click', togglePlayPause);

  // Save file button
  saveFileBtn.addEventListener('click', saveEditedFile);

  // Set intro cut point
  setIntroBtn.addEventListener('click', () => {
    introCutTime = wavesurfer.getCurrentTime();
    introCutInput.value = formatTime(introCutTime, true);
    statusMessageEl.textContent = `Intro cut point set at ${formatTime(introCutTime)}`;
  });

  // Set outro cut point
  setOutroBtn.addEventListener('click', () => {
    outroCutTime = wavesurfer.getCurrentTime();
    outroCutInput.value = formatTime(outroCutTime, true);
    statusMessageEl.textContent = `Outro cut point set at ${formatTime(outroCutTime)}`;
  });

  // Listen for file open event from main process
  ipcRenderer.on('file-opened', (event, filePath) => {
    loadAudioFile(filePath);
  });

  // Listen for save file path from main process
  ipcRenderer.on('save-file-path', (event, filePath) => {
    processAndSaveAudio(filePath);
  });
}

// Load audio file
async function loadAudioFile(filePath) {
  try {
    currentFilePath = filePath;
    fileNameEl.textContent = filePath.split('/').pop();
    statusMessageEl.textContent = 'Loading file...';
    
    // Load the file using WaveSurfer
    wavesurfer.load(filePath);
    
    // Also load the file as an ArrayBuffer for processing
    const arrayBuffer = await ipcRenderer.invoke('read-audio-file', filePath);
    if (arrayBuffer) {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    }
  } catch (error) {
    statusMessageEl.textContent = `Error loading file: ${error.message}`;
  }
}

// Toggle play/pause
function togglePlayPause() {
  if (isPlaying) {
    wavesurfer.pause();
    playPauseBtn.textContent = 'Play';
  } else {
    wavesurfer.play();
    playPauseBtn.textContent = 'Pause';
  }
  isPlaying = !isPlaying;
}

// Enable controls after file is loaded
function enableControls() {
  playPauseBtn.disabled = false;
  saveFileBtn.disabled = false;
  introCutInput.disabled = false;
  outroCutInput.disabled = false;
  setIntroBtn.disabled = false;
  setOutroBtn.disabled = false;
  fadeInInput.disabled = false;
  fadeOutInput.disabled = false;
}

// Update current time display
function updateCurrentTime() {
  currentTimeEl.textContent = formatTime(wavesurfer.getCurrentTime());
}

// Update total time display
function updateTotalTime() {
  totalTimeEl.textContent = formatTime(wavesurfer.getDuration());
  outroCutTime = wavesurfer.getDuration();
  outroCutInput.value = formatTime(outroCutTime, true);
}

// Format time in MM:SS or MM:SS.mmm format
function formatTime(timeInSeconds, includeMilliseconds = false) {
  if (!timeInSeconds && timeInSeconds !== 0) return '0:00';
  
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  
  if (includeMilliseconds) {
    const milliseconds = Math.floor((timeInSeconds % 1) * 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Parse time string to seconds
function parseTimeToSeconds(timeString) {
  if (!timeString) return 0;
  
  const parts = timeString.split(':');
  let seconds = 0;
  
  if (parts.length === 2) {
    const minutePart = parseInt(parts[0], 10);
    let secondPart = parts[1];
    
    if (secondPart.includes('.')) {
      const [sec, ms] = secondPart.split('.');
      seconds = minutePart * 60 + parseInt(sec, 10) + parseInt(ms, 10) / 1000;
    } else {
      seconds = minutePart * 60 + parseInt(secondPart, 10);
    }
  }
  
  return seconds;
}

// Save edited file
function saveEditedFile() {
  statusMessageEl.textContent = 'Preparing to save...';
  
  // Get the original filename without extension
  let originalFilename = '';
  if (currentFilePath) {
    const filename = currentFilePath.split('/').pop();
    // Get filename without extension
    originalFilename = filename.substring(0, filename.lastIndexOf('.'));
  }
  
  ipcRenderer.send('save-file-dialog', originalFilename);
}

// Process and save audio
async function processAndSaveAudio(outputFilePath) {
  try {
    statusMessageEl.textContent = 'Processing audio...';
    
    // Get cut points and fade values
    const introTime = parseTimeToSeconds(introCutInput.value) || 0;
    const outroTime = parseTimeToSeconds(outroCutInput.value) || audioBuffer.duration;
    const fadeInDuration = parseFloat(fadeInInput.value) || 0;
    const fadeOutDuration = parseFloat(fadeOutInput.value) || 0;
    
    // Create a new AudioContext for processing
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      (outroTime - introTime) * audioBuffer.sampleRate,
      audioBuffer.sampleRate
    );
    
    // Create source buffer
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // Create gain node for fades
    const gainNode = offlineContext.createGain();
    source.connect(gainNode);
    gainNode.connect(offlineContext.destination);
    
    // Apply fades if needed
    if (fadeInDuration > 0) {
      gainNode.gain.setValueAtTime(0, 0);
      gainNode.gain.linearRampToValueAtTime(1, fadeInDuration);
    }
    
    if (fadeOutDuration > 0) {
      const fadeOutStart = (outroTime - introTime) - fadeOutDuration;
      gainNode.gain.setValueAtTime(1, fadeOutStart);
      gainNode.gain.linearRampToValueAtTime(0, outroTime - introTime);
    }
    
    // Start the source at the negative of intro cut time to offset the audio
    source.start(0, introTime, outroTime - introTime);
    
    // Render the audio
    statusMessageEl.textContent = 'Rendering audio...';
    const renderedBuffer = await offlineContext.startRendering();
    
    // Convert AudioBuffer to WAV format
    const wavData = audioBufferToWav(renderedBuffer);
    
    // Save the file
    const success = await ipcRenderer.invoke('write-audio-file', outputFilePath, wavData);
    
    if (success) {
      statusMessageEl.textContent = 'File saved successfully!';
    } else {
      statusMessageEl.textContent = 'Error saving file';
    }
  } catch (error) {
    statusMessageEl.textContent = `Error processing audio: ${error.message}`;
    console.error('Error processing audio:', error);
  }
}

// Convert AudioBuffer to WAV format
function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2;
  const sampleRate = buffer.sampleRate;
  const result = new ArrayBuffer(44 + length);
  const view = new DataView(result);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + length, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numOfChan, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 4, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numOfChan * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, length, true);

  // Write the PCM samples
  const offset = 44;
  let pos = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numOfChan; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset + pos, value, true);
      pos += 2;
    }
  }

  return result;
}

// Helper function to write strings to DataView
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Setup drag and drop functionality
function setupDragAndDrop() {
  const dropZone = document.querySelector('.waveform-container');
  const container = document.querySelector('.container');
  
  // Prevent default behavior for drag events to allow drop
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });
  
  // Add visual feedback when file is dragged over the drop zone
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
  });
  
  // Handle the dropped file
  dropZone.addEventListener('drop', handleDrop, false);
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  function highlight() {
    dropZone.classList.add('highlight');
    statusMessageEl.textContent = 'Drop audio file here';
  }
  
  function unhighlight() {
    dropZone.classList.remove('highlight');
    statusMessageEl.textContent = '';
  }
  
  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
      const file = files[0];
      // Check if the file is an audio file
      if (file.type.includes('audio') || file.name.endsWith('.mp3') || file.name.endsWith('.m4a')) {
        loadAudioFile(file.path);
      } else {
        statusMessageEl.textContent = 'Please drop an audio file (MP3 or M4A)';
      }
    }
  }
}

// Initialize the application
init();
