const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const NodeID3 = require('node-id3');
const https = require('https');
const querystring = require('querystring');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');
  
  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools();
  
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
  
  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open MP3',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog({
              properties: ['openFile'],
              filters: [{ name: 'Audio Files', extensions: ['mp3', 'm4a'] }]
            });
            
            if (!canceled && filePaths.length > 0) {
              mainWindow.webContents.send('file-opened', filePaths[0]);
            }
          }
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            mainWindow.webContents.send('save-file');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggledevtools' },
        { 
          label: 'Open DevTools (F12)',
          accelerator: 'F12',
          click: () => mainWindow.webContents.openDevTools()
        },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Handle file open dialog
ipcMain.on('open-file-dialog', async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Audio Files', extensions: ['mp3', 'm4a'] }]
  });
  
  if (!canceled && filePaths.length > 0) {
    mainWindow.webContents.send('file-opened', filePaths[0]);
  }
});

// Handle file save dialog
ipcMain.on('save-file-dialog', async (event, originalFilename) => {
  // Set default filename to original name + '2' or fallback to 'edited.mp3'
  const defaultFilename = originalFilename ? `${originalFilename} - edited.mp3` : 'edited.mp3';
  
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Edited Audio',
    defaultPath: defaultFilename,
    filters: [{ name: 'Audio Files', extensions: ['mp3', 'm4a'] }]
  });
  
  if (!canceled && filePath) {
    event.reply('save-file-path', filePath);
  }
});

// Handle reading audio file
ipcMain.handle('read-audio-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (error) {
    console.error('Error reading audio file:', error);
    return null;
  }
});

// Handle writing audio file
ipcMain.handle('write-audio-file', async (event, filePath, arrayBuffer) => {
  try {
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);
    return true;
  } catch (error) {
    console.error('Error writing audio file:', error);
    return false;
  }
});

// Handle getting file stats (for bitrate detection)
ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    return fs.promises.stat(filePath);
  } catch (error) {
    console.error('Error getting file stats:', error);
    return null;
  }
});

// Read MP3 tags
ipcMain.handle('read-mp3-tags', async (event, filePath) => {
  try {
    const tags = NodeID3.read(filePath);
    console.log('Read MP3 tags:', tags);
    return tags;
  } catch (error) {
    console.error('Error reading MP3 tags:', error);
    return null;
  }
});

// Write MP3 tags
ipcMain.handle('write-mp3-tags', async (event, filePath, tags) => {
  try {
    const success = NodeID3.write(tags, filePath);
    console.log('Wrote MP3 tags:', success ? 'success' : 'failed');
    return success;
  } catch (error) {
    console.error('Error writing MP3 tags:', error);
    return false;
  }
});

// Handle music info search using MusicBrainz API (no API key required)
ipcMain.handle('search-web', async (event, { artist, title }) => {
  try {
    console.log('Searching for track info:', { artist, title });
    
    // Encode the artist and title for the URL
    const encodedArtist = querystring.escape(artist);
    const encodedTitle = querystring.escape(title);
    
    // MusicBrainz requires a proper user agent with contact information
    const userAgent = 'AudioCutter/1.0.0 (https://github.com/genau7/audio-cutter)';
    
    // First search for the recording to get the release info
    const options = {
      hostname: 'musicbrainz.org',
      path: `/ws/2/recording/?query=artist:${encodedArtist}+AND+recording:${encodedTitle}&fmt=json`,
      method: 'GET',
      headers: {
        'User-Agent': userAgent
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            
            // Check if we got any recordings
            if (jsonData.recordings && jsonData.recordings.length > 0) {
              // Find the best match recording
              const recording = jsonData.recordings[0];
              
              // Default result with no information
              const result = {
                success: true,
                album: '',
                year: ''
              };
              
              // Try to get album (release) information
              if (recording.releases && recording.releases.length > 0) {
                // Get the first release (album)
                const release = recording.releases[0];
                
                // Set the album name
                result.album = release.title || '';
                
                // Try to get the release date
                if (release.date) {
                  // Extract year from date (format: YYYY-MM-DD or YYYY)
                  const yearMatch = release.date.match(/^(\d{4})/);
                  if (yearMatch) {
                    result.year = yearMatch[1];
                  }
                }
                
                // If we have a release ID but no date, make a second request to get more details
                if (release['id'] && !result.year) {
                  // Make a second request to get detailed release info
                  const releaseOptions = {
                    hostname: 'musicbrainz.org',
                    path: `/ws/2/release/${release['id']}?fmt=json`,
                    method: 'GET',
                    headers: {
                      'User-Agent': userAgent
                    }
                  };
                  
                  const releaseReq = https.request(releaseOptions, (releaseRes) => {
                    let releaseData = '';
                    
                    releaseRes.on('data', (chunk) => {
                      releaseData += chunk;
                    });
                    
                    releaseRes.on('end', () => {
                      try {
                        const releaseJson = JSON.parse(releaseData);
                        
                        // Try to get the release date
                        if (releaseJson.date) {
                          // Extract year from date (format: YYYY-MM-DD or YYYY)
                          const yearMatch = releaseJson.date.match(/^(\d{4})/);
                          if (yearMatch) {
                            result.year = yearMatch[1];
                          }
                        }
                        
                        resolve(result);
                      } catch (e) {
                        // If release info parsing fails, just return what we have
                        console.error('Error parsing release info:', e);
                        resolve(result);
                      }
                    });
                  });
                  
                  releaseReq.on('error', (error) => {
                    // If release request fails, just return what we have
                    console.error('Release request error:', error);
                    resolve(result);
                  });
                  
                  releaseReq.end();
                  return; // Exit early as we're handling the resolve in the nested request
                }
              }
              
              // If we didn't make a second request, resolve with what we have
              resolve(result);
            } else {
              // No recordings found
              resolve({
                success: false,
                error: 'No matching tracks found'
              });
            }
          } catch (e) {
            console.error('Error parsing MusicBrainz response:', e);
            reject({
              success: false,
              error: 'Failed to parse search results'
            });
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('MusicBrainz API request error:', error);
        reject({
          success: false,
          error: error.message
        });
      });
      
      req.end();
    });
  } catch (error) {
    console.error('Error during music info search:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
