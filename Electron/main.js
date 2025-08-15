    // Electron/main.js
    const { app, BrowserWindow } = require('electron');
    const path = require('path');

    function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true
        }
    });
    win.loadFile(path.join(__dirname, 'index.html'));
    }

    app.whenReady().then(() => {
    createWindow();

    // Registrar todos los handlers IPC (supervisor, agentes, terminales, SIM->PDF)
    require('./main-inventario');

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    });

    app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
    });
