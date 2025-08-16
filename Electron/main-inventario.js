const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fsPromises = require('fs/promises');
const path = require('path');

// Helper para obtener la ventana que llamó
function getCallerWindow(event) {
    return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
}

/* Handler para mostrar el diálogo "Guardar como" */
ipcMain.handle('save-dialog', async (event, defaultName = 'document.pdf') => {
    try {
        const win = getCallerWindow(event);
        const { canceled, filePath } = await dialog.showSaveDialog(win || null, {
            title: 'Guardar PDF',
            defaultPath: path.join(app.getPath('desktop'), defaultName),
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });
        if (canceled) return null;
        return filePath;
    } catch (err) {
        console.error('save-dialog error:', err);
        return null;
    }
});

/* Handler para generar PDF */
ipcMain.handle('sims:generateSend', async (event, payload = {}) => {
    try {
        // 1) obtener/solicitar ruta de guardado
        let savePath = payload.savePath;
        if (!savePath) {
            const fileName = payload.fileName || `SIM_${payload.usuario || 'user'}_${(payload.fecha || new Date().toISOString().slice(0,10))}.pdf`;
            const win = getCallerWindow(event);
            const result = await dialog.showSaveDialog(win || null, {
                title: 'Guardar PDF',
                defaultPath: path.join(app.getPath('desktop'), fileName),
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });
            if (result.canceled || !result.filePath) {
                return { ok: false, error: 'Guardado cancelado por el usuario' };
            }
            savePath = result.filePath;
        }

        // 2) generar el buffer PDF
        const printOptions = Object.assign({ printBackground: true }, payload.printOptions || {});
        let pdfBuffer = null;

        if (payload.useCurrentWindow) {
            // Generar desde la webContents que invocó (captura la página actual)
            const senderWebContents = event.sender;
            pdfBuffer = await senderWebContents.printToPDF(printOptions);
        } else if (payload.html) {
            // Crear una ventana oculta, cargar el HTML y generar PDF desde allí
            const win = new BrowserWindow({
                show: false,
                width: 800,
                height: 600,
                webPreferences: {
                    sandbox: false,
                    nodeIntegration: false,
                    contextIsolation: true,
                }
            });

            await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(payload.html));

            // esperar a que deje de cargar
            await new Promise(resolve => {
                if (win.webContents.isLoading()) win.webContents.once('did-finish-load', resolve);
                else resolve();
            });

            pdfBuffer = await win.webContents.printToPDF(printOptions);
            win.destroy();
        } else {
            return { ok: false, error: 'No se indicó source para generar el PDF (useCurrentWindow o html).' };
        }

        // 3) escribir el archivo en disco
        await fsPromises.writeFile(savePath, pdfBuffer);

        // 4) respuesta
        return { ok: true, path: savePath };
    } catch (err) {
        console.error('sims:generateSend error:', err);
        return { ok: false, error: err && err.message ? err.message : String(err) };
    }
});