const { ipcRenderer } = require('electron');
const WaveSurfer = require('wavesurfer.js');

// DOM Elements
const waveformEl = document.getElementById('waveform');
const waveformContainer = document.querySelector('.waveform-container');
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
const snapToIntroBtn = document.getElementById('snap-to-intro');
const snapToOutroBtn = document.getElementById('snap-to-outro');
const loadingOverlay = document.getElementById('loading-overlay');
// Tag input elements
const tagArtistInput = document.getElementById('tag-artist');
const tagTitleInput = document.getElementById('tag-title');
const tagAlbumInput = document.getElementById('tag-album');
const tagYearInput = document.getElementById('tag-year');

// Global variables
let wavesurfer;
let audioContext;
let audioBuffer;
let currentFilePath;
let introCutTime = 0;
let outroCutTime = null; // null means end of file
let isPlaying = false;
let introMarkerElement = null;
let outroMarkerElement = null;
let originalBitrate = 256; // Default bitrate if we can't detect it
let mp3Tags = null; // Store original MP3 tags

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
    
    // Initialize cut points
    introCutTime = 0;
    outroCutTime = wavesurfer.getDuration();
    
    // Wait a moment for the waveform to render completely before adding markers
    setTimeout(() => {
      updateCutMarkers();
    }, 100);
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
  
  // Auto-select content on focus for all input fields
  const inputFields = [
    fadeInInput, fadeOutInput, introCutInput, outroCutInput,
    tagArtistInput, tagTitleInput, tagAlbumInput, tagYearInput
  ];
  
  // Add focus and keydown event listeners to all input fields
  inputFields.forEach(input => {
    // Select all text on focus
    input.addEventListener('focus', function() {
      this.select();
    });
    
    // Handle cmd+A (or ctrl+A) to select all text
    input.addEventListener('keydown', function(e) {
      // Check for cmd+A (Mac) or ctrl+A (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault(); // Prevent default browser behavior
        this.select();      // Select all text in the input field
      }
    });
  });
  
  // Snap to cut point buttons
  snapToIntroBtn.addEventListener('click', () => {
    if (introCutTime !== null) {
      snapToCutPoint(introCutTime);
    }
  });
  
  snapToOutroBtn.addEventListener('click', () => {
    if (outroCutTime !== null) {
      snapToCutPoint(outroCutTime);
    }
  });

  // Set intro cut point
  setIntroBtn.addEventListener('click', () => {
    introCutTime = wavesurfer.getCurrentTime();
    introCutInput.value = formatTime(introCutTime, true);
    statusMessageEl.textContent = `Intro cut point set at ${formatTime(introCutTime)}`;
    updateCutMarkers();
  });

  // Set outro cut point
  setOutroBtn.addEventListener('click', () => {
    outroCutTime = wavesurfer.getCurrentTime();
    outroCutInput.value = formatTime(outroCutTime, true);
    statusMessageEl.textContent = `Outro cut point set at ${formatTime(outroCutTime)}`;
    updateCutMarkers();
  });

  // Create or update cut point markers in the waveform
  function updateCutMarkers() {
    const duration = wavesurfer.getDuration();
    const waveformRect = waveformEl.getBoundingClientRect();
    const containerRect = waveformContainer.getBoundingClientRect();
    
    // Calculate the offset and width of the actual waveform within the container
    const waveformOffset = waveformRect.left - containerRect.left;
    const waveformWidth = waveformRect.width;
  
    // Create or update intro marker
    if (introCutTime !== null && introCutTime >= 0) {
      // Calculate position in pixels based on time and waveform width
      const introPixelPosition = (introCutTime / duration) * waveformWidth + waveformOffset;
      // Convert to percentage of container width
      const introPosition = (introPixelPosition / containerRect.width) * 100;
    
      if (!introMarkerElement) {
        introMarkerElement = document.createElement('div');
        introMarkerElement.className = 'cut-marker intro-marker';
        introMarkerElement.title = 'Intro Cut Point';
        introMarkerElement.addEventListener('click', () => snapToCutPoint(introCutTime));
        waveformContainer.appendChild(introMarkerElement);
      }
    
      introMarkerElement.style.left = `${introPosition}%`;
      snapToIntroBtn.disabled = false;
    }
  
    // Create or update outro marker
    if (outroCutTime !== null) {
      // Calculate position in pixels based on time and waveform width
      const outroPixelPosition = (outroCutTime / duration) * waveformWidth + waveformOffset;
      // Convert to percentage of container width
      const outroPosition = (outroPixelPosition / containerRect.width) * 100;
    
      if (!outroMarkerElement) {
        outroMarkerElement = document.createElement('div');
        outroMarkerElement.className = 'cut-marker outro-marker';
        outroMarkerElement.title = 'Outro Cut Point';
        outroMarkerElement.addEventListener('click', () => snapToCutPoint(outroCutTime));
        waveformContainer.appendChild(outroMarkerElement);
      }
    
      outroMarkerElement.style.left = `${outroPosition}%`;
      snapToOutroBtn.disabled = false;
    }
  }

  // Snap to a specific time point
  function snapToCutPoint(timePoint) {
    if (timePoint !== null && wavesurfer) {
      wavesurfer.seekTo(timePoint / wavesurfer.getDuration());
      statusMessageEl.textContent = `Jumped to ${formatTime(timePoint)}`;
    }
  }

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
    // Reset markers and cut points
    introCutTime = 0;
    outroCutTime = null;
    
    // Remove existing markers if any
    if (introMarkerElement) {
      introMarkerElement.remove();
      introMarkerElement = null;
    }
    if (outroMarkerElement) {
      outroMarkerElement.remove();
      outroMarkerElement = null;
    }
    
    // Disable snap buttons
    snapToIntroBtn.disabled = true;
    snapToOutroBtn.disabled = true;
    
    currentFilePath = filePath;
    fileNameEl.textContent = filePath.split('/').pop();
    statusMessageEl.textContent = 'Loading file...';
    
    // Get file extension
    const fileExt = filePath.split('.').pop().toLowerCase();
    fileFormat = fileExt;
    
    // Load the file using WaveSurfer
    wavesurfer.load(filePath);
    
    // Also load the file as an ArrayBuffer for processing
    const arrayBuffer = await ipcRenderer.invoke('read-audio-file', filePath);
    if (arrayBuffer) {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Attempt to detect bitrate for MP3 files
      if (fileExt === 'mp3') {
        try {
          // Get file stats to determine file size
          const fileStats = await ipcRenderer.invoke('get-file-stats', filePath);
          const fileSizeInBytes = fileStats.size;
          
          // Estimate bitrate based on file size and duration
          // This is a rough estimate: (file size in bits) / (duration in seconds) / 1000
          const fileSizeInBits = fileSizeInBytes * 8;
          const durationInSeconds = audioBuffer.duration;
          
          // MP3 has some overhead, so we adjust the calculation
          // Typical MP3 overhead is about 4-5% of the file size
          const estimatedBitrate = Math.round((fileSizeInBits * 0.95) / durationInSeconds / 1000);
          
          // Clamp to common bitrates (128, 192, 256, 320)
          if (estimatedBitrate <= 160) {
            originalBitrate = 128;
          } else if (estimatedBitrate <= 224) {
            originalBitrate = 192;
          } else if (estimatedBitrate <= 288) {
            originalBitrate = 256;
          } else {
            originalBitrate = 320;
          }
          
          console.log(`Detected approximate bitrate: ${estimatedBitrate}kbps, using ${originalBitrate}kbps`);
          
          // Read MP3 tags
          mp3Tags = await ipcRenderer.invoke('read-mp3-tags', filePath);
          if (mp3Tags) {
            console.log('MP3 tags loaded:', mp3Tags);
            displayMP3Tags(mp3Tags);
          }
        } catch (bitrateError) {
          console.warn('Could not detect bitrate, using default:', originalBitrate);
        }
      }
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
  // Enable tag input fields
  tagArtistInput.disabled = false;
  tagTitleInput.disabled = false;
  tagAlbumInput.disabled = false;
  tagYearInput.disabled = false;
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

// Toggle loading state
function setSaveLoadingState(isLoading) {
  if (isLoading) {
    loadingOverlay.classList.add('active');
    saveFileBtn.disabled = true;
  } else {
    loadingOverlay.classList.remove('active');
    saveFileBtn.disabled = false;
    statusMessageEl.classList.remove('status-loading');
  }
}

// Process and save audio
async function processAndSaveAudio(outputFilePath) {
  try {
    // If user canceled the save dialog, don't do anything
    if (!outputFilePath) {
      statusMessageEl.textContent = 'Save canceled';
      return;
    }
    
    // Show loading state now that user has submitted the filename
    setSaveLoadingState(true);
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
    
    // Determine if we should output MP3 or M4A based on the output file extension
    const isMP3 = outputFilePath.toLowerCase().endsWith('.mp3');
    
    if (isMP3) {
      // Convert AudioBuffer to MP3 format
      statusMessageEl.textContent = 'Encoding to MP3...';
      const mp3Data = audioBufferToMP3(renderedBuffer);
      
      // Save the file
      const success = await ipcRenderer.invoke('write-audio-file', outputFilePath, mp3Data);
      
      if (success) {
        // Apply the original MP3 tags if available
        if (mp3Tags) {
          statusMessageEl.textContent = 'Applying MP3 tags...';
          console.log('Applying MP3 tags to new file:', mp3Tags);
          
          try {
            // Get values from tag input fields
            const updatedTags = {
              ...mp3Tags,
              title: tagTitleInput.value || mp3Tags.title,
              artist: tagArtistInput.value || mp3Tags.artist,
              album: tagAlbumInput.value || mp3Tags.album,
              year: tagYearInput.value || mp3Tags.year
            };
            
            console.log('Applying updated MP3 tags:', updatedTags);
            
            const tagSuccess = await ipcRenderer.invoke('write-mp3-tags', outputFilePath, updatedTags);
            if (tagSuccess) {
              console.log('MP3 tags applied successfully');
              statusMessageEl.textContent = 'File saved with updated tags!';
            } else {
              console.warn('Failed to apply MP3 tags');
              statusMessageEl.textContent = 'File saved, but failed to apply tags';
            }
          } catch (tagError) {
            console.error('Error applying MP3 tags:', tagError);
            statusMessageEl.textContent = 'File saved, but error applying tags';
          }
        } else {
          statusMessageEl.textContent = 'File saved successfully!';
        }
      } else {
        statusMessageEl.textContent = 'Error saving file';
      }
    } else {
      // For now, if it's not MP3, fall back to WAV format
      // In a future update, we could add M4A encoding
      statusMessageEl.textContent = 'Encoding to WAV (M4A encoding not yet supported)...';
      const wavData = audioBufferToWav(renderedBuffer);
      
      // Save the file
      const success = await ipcRenderer.invoke('write-audio-file', outputFilePath, wavData);
      
      if (success) {
        statusMessageEl.textContent = 'File saved successfully!';
      } else {
        statusMessageEl.textContent = 'Error saving file';
      }
    }
  } catch (error) {
    statusMessageEl.textContent = `Error processing audio: ${error.message}`;
    console.error('Error processing audio:', error);
  } finally {
    setSaveLoadingState(false);
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

// Convert AudioBuffer to MP3 format using @breezystack/lamejs
function audioBufferToMP3(buffer) {
  try {
    console.log('Starting MP3 encoding with @breezystack/lamejs...');
    
    // Get info from the buffer
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    
    console.log('Audio buffer info:', {
      channels: numOfChan,
      sampleRate: sampleRate,
      length: buffer.length,
      duration: buffer.duration
    });
    
    // Create MP3 encoder using @breezystack/lamejs with the original bitrate
    console.log(`Using bitrate: ${originalBitrate}kbps`);
    
    // The script exposes a global 'lamejs' object
    console.log('Global lamejs object:', window.lamejs);
    
    // Use the global lamejs object that was loaded via script tag
    const mp3encoder = new window.lamejs.Mp3Encoder(numOfChan, sampleRate, originalBitrate);
    
    // Extract channel data
    const channels = [];
    for (let i = 0; i < numOfChan; i++) {
      channels.push(buffer.getChannelData(i));
    }
    
    // Convert float samples to int16 samples
    const blockSize = 1152; // Must be a multiple of 576 for lamejs
    const mp3Data = [];
    
    // Process the audio in chunks
    for (let i = 0; i < buffer.length; i += blockSize) {
      // Create sample arrays for each channel
      const leftChunk = new Int16Array(blockSize);
      const rightChunk = numOfChan > 1 ? new Int16Array(blockSize) : null;
      
      // Convert samples to int16
      for (let j = 0; j < blockSize; j++) {
        if (i + j < buffer.length) {
          // Left channel
          const left = Math.max(-1, Math.min(1, channels[0][i + j]));
          leftChunk[j] = left < 0 ? left * 0x8000 : left * 0x7FFF;
          
          // Right channel (if stereo)
          if (numOfChan > 1 && rightChunk) {
            const right = Math.max(-1, Math.min(1, channels[1][i + j]));
            rightChunk[j] = right < 0 ? right * 0x8000 : right * 0x7FFF;
          }
        }
      }
      
      // Encode the chunk
      let mp3buf;
      if (numOfChan === 1) {
        mp3buf = mp3encoder.encodeBuffer(leftChunk);
      } else if (rightChunk) {
        mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      }
      
      if (mp3buf && mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    
    // Finalize the encoding
    const end = mp3encoder.flush();
    
    if (end && end.length > 0) {
      mp3Data.push(end);
    }
    
    // Combine all chunks into a single buffer
    let totalLength = 0;
    for (let i = 0; i < mp3Data.length; i++) {
      totalLength += mp3Data[i].length;
    }
    
    console.log('MP3 encoding complete. Total encoded data length:', totalLength);
    
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < mp3Data.length; i++) {
      result.set(mp3Data[i], offset);
      offset += mp3Data[i].length;
    }
    
    return result.buffer;
  } catch (error) {
    console.error('Error in MP3 encoding:', error);
    console.error('Error stack:', error.stack);
    throw new Error(`MP3 encoding failed: ${error.message}`);
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

// Display MP3 tags in the UI
function displayMP3Tags(tags) {
  // Set basic info in status message
  statusMessageEl.textContent = `Loaded: ${tags.title || 'Unknown'} - ${tags.artist || 'Unknown'}`;
  
  // Create a more detailed tag display
  let tagInfo = '';
  
  if (tags.title) tagInfo += `Title: ${tags.title}\n`;
  if (tags.artist) tagInfo += `Artist: ${tags.artist}\n`;
  if (tags.album) tagInfo += `Album: ${tags.album}\n`;
  if (tags.year) tagInfo += `Year: ${tags.year}\n`;
  if (tags.genre) tagInfo += `Genre: ${tags.genre}\n`;
  if (tags.trackNumber) tagInfo += `Track: ${tags.trackNumber}\n`;
  
  // Add bitrate information
  tagInfo += `Bitrate: ${originalBitrate}kbps\n`;
  
  // Display in console for debugging
  console.log('MP3 Tag Details:\n' + tagInfo);
  
  // Populate tag input fields
  tagTitleInput.value = tags.title || '';
  tagArtistInput.value = tags.artist || '';
  tagAlbumInput.value = tags.album || '';
  tagYearInput.value = tags.year || '';
  
  // You could also add this to a tooltip or a modal if desired
  // For now, we'll just update the status message on hover
  const originalStatus = statusMessageEl.textContent;
  
  statusMessageEl.addEventListener('mouseenter', () => {
    if (mp3Tags) {
      statusMessageEl.textContent = 'MP3 Tags: ' + 
        (tags.title ? tags.title + ' - ' : '') + 
        (tags.artist ? tags.artist + ' - ' : '') + 
        (tags.album ? tags.album + ' (' + (tags.year || '') + ')' : '');
    }
  });
  
  statusMessageEl.addEventListener('mouseleave', () => {
    statusMessageEl.textContent = originalStatus;
  });
}

// Initialize the application
init();
