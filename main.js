const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

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
  
  // Open DevTools if in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

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
  const defaultFilename = originalFilename ? `${originalFilename} -  edited.mp3` : 'edited.mp3';
  
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
