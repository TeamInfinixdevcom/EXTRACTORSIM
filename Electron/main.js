const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Estado global
let mainWindow = null;
const AGENTS_FILE = path.join(__dirname, 'agents.json');
const TERMINALES_FILE = path.join(__dirname, 'terminales.json');
const NOTAS_FILE = path.join(__dirname, 'notas.json');
const HISTORIAL_FILE = path.join(__dirname, 'historial_entregas.json');
const INVENTARIO_FILE = path.join(__dirname, 'inventario.json');

function createWindow() {
    // Configuración básica
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'kolbi.png'), // Icono de la aplicación
        show: false // No mostrar hasta que esté listo
    });

    // Verificar que el archivo HTML existe antes de cargarlo
    const htmlPath = path.join(__dirname, 'index.html');
    console.log('Intentando cargar HTML desde:', htmlPath);
    
    // Cargar HTML
    mainWindow.loadFile(htmlPath)
        .then(() => {
            console.log('HTML cargado exitosamente');
            mainWindow.show(); // Mostrar ventana cuando esté listo
        })
        .catch(error => {
            console.error('Error cargando HTML:', error);
            mainWindow.show();
        });
    
    // DevTools en desarrollo
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // Logging de eventos
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Página cargada completamente');
    });
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Error cargando página:', errorCode, errorDescription);
    });
}

// Funciones auxiliares para manejar archivos JSON
async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error leyendo ${filePath}:`, error);
        // Retornar estructura por defecto según el archivo
        if (filePath.includes('agents.json')) {
            return { agents: [] };
        }
        return [];
    }
}

async function writeJsonFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error escribiendo ${filePath}:`, error);
        return false;
    }
}

// Función para inicializar archivos JSON si no existen
async function initializeDataFiles() {
    const files = [
        { path: AGENTS_FILE, defaultData: { agents: [] } },
        { path: TERMINALES_FILE, defaultData: [] },
        { path: NOTAS_FILE, defaultData: [] },
        { path: HISTORIAL_FILE, defaultData: [] },
        { path: INVENTARIO_FILE, defaultData: [] }
    ];

    for (const file of files) {
        try {
            await fs.access(file.path);
        } catch (error) {
            console.log(`Creando archivo ${file.path}`);
            await writeJsonFile(file.path, file.defaultData);
        }
    }
}

// Iniciar cuando esté listo
app.whenReady().then(async () => {
    // Inicializar archivos de datos
    await initializeDataFiles();
    
    createWindow();
    
    // Cargar handlers de inventario
    try {
        require('./main-inventario');
        console.log('Handlers de inventario registrados');
    } catch (error) {
        console.error('Error al registrar handlers de inventario:', error);
    }

    // Registrar todos los handlers IPC
    setupIpcHandlers();
});

function setupIpcHandlers() {
    // Handler mejorado para autenticación de supervisor
    ipcMain.handle('supervisor:auth', async (event, credentials) => {
        console.log('Autenticación de supervisor solicitada:', credentials.email);
        
        // Lista de supervisores autorizados
        const supervisoresAutorizados = [
            { email: 'rmadrigalj@ice.go.cr', password: 'Kolbi2525', nombre: 'R. Madrigal J.' },
            { email: 'supervisor@ice.go.cr', password: 'admin123', nombre: 'Supervisor Principal' },
            { email: 'admin@kolbi.cr', password: 'kolbi2024', nombre: 'Administrador' }
        ];
        
        // Buscar supervisor
        const supervisor = supervisoresAutorizados.find(s => 
            s.email === credentials.email && s.password === credentials.password
        );
        
        if (supervisor) {
            console.log('Autenticación exitosa para:', supervisor.nombre);
            return { 
                ok: true, 
                user: supervisor.email,
                nombre: supervisor.nombre,
                timestamp: new Date().toISOString()
            };
        }
        
        console.log('Credenciales inválidas para:', credentials.email);
        return { 
            ok: false, 
            error: 'Credenciales de supervisor inválidas' 
        };
    });

    // Handler para verificar si un usuario es supervisor
    ipcMain.handle('supervisor:check', async (event, email) => {
        const supervisoresAutorizados = [
            'rmadrigalj@ice.go.cr',
            'supervisor@ice.go.cr',
            'admin@kolbi.cr'
        ];
        
        return {
            isSupervisor: supervisoresAutorizados.includes(email)
        };
    });

    // Handlers para agentes
    ipcMain.handle('agents:list', async () => {
        const data = await readJsonFile(AGENTS_FILE);
        return data.agents || [];
    });

    ipcMain.handle('agents:add', async (event, agent) => {
        try {
            const data = await readJsonFile(AGENTS_FILE);
            const agents = data.agents || [];
            
            // Verificar si ya existe el agente
            const index = agents.findIndex(a => a.correo === agent.correo);
            if (index >= 0) {
                agents[index] = { ...agent, fechaActualizacion: new Date().toISOString() };
                console.log('Agente actualizado:', agent.correo);
            } else {
                agents.push({ ...agent, fechaCreacion: new Date().toISOString() });
                console.log('Agente agregado:', agent.correo);
            }
            
            data.agents = agents;
            const success = await writeJsonFile(AGENTS_FILE, data);
            return { ok: success, message: index >= 0 ? 'Agente actualizado' : 'Agente agregado' };
        } catch (error) {
            console.error('Error en agents:add:', error);
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle('agents:remove', async (event, correo) => {
        try {
            const data = await readJsonFile(AGENTS_FILE);
            const agents = data.agents || [];
            
            const filtered = agents.filter(a => a.correo !== correo);
            if (filtered.length === agents.length) {
                return { ok: false, error: 'Agente no encontrado' };
            }
            
            data.agents = filtered;
            const success = await writeJsonFile(AGENTS_FILE, data);
            console.log('Agente eliminado:', correo);
            return { ok: success, message: 'Agente eliminado correctamente' };
        } catch (error) {
            console.error('Error en agents:remove:', error);
            return { ok: false, error: error.message };
        }
    });

    // Handlers para terminales
    ipcMain.handle('terminales:list', async () => {
        return await readJsonFile(TERMINALES_FILE);
    });

    ipcMain.handle('terminales:add', async (event, terminal) => {
        try {
            const terminales = await readJsonFile(TERMINALES_FILE);
            
            // Buscar si existe para actualizar
            const index = terminales.findIndex(t => 
                t.agencia === terminal.agencia && 
                t.marca === terminal.marca && 
                t.terminal === terminal.terminal
            );
            
            if (index >= 0) {
                terminales[index] = { ...terminal, fechaActualizacion: new Date().toISOString() };
            } else {
                terminales.push({ ...terminal, fechaCreacion: new Date().toISOString() });
            }
            
            const success = await writeJsonFile(TERMINALES_FILE, terminales);
            console.log('Terminal procesado:', terminal.terminal);
            return { ok: success, message: index >= 0 ? 'Terminal actualizado' : 'Terminal agregado' };
        } catch (error) {
            console.error('Error en terminales:add:', error);
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle('terminales:remove', async (event, terminal) => {
        try {
            const terminales = await readJsonFile(TERMINALES_FILE);
            
            const filtered = terminales.filter(t => 
                !(t.agencia === terminal.agencia && 
                  t.marca === terminal.marca && 
                  t.terminal === terminal.terminal)
            );
            
            if (filtered.length === terminales.length) {
                return { ok: false, error: 'Terminal no encontrado' };
            }
            
            const success = await writeJsonFile(TERMINALES_FILE, filtered);
            console.log('Terminal eliminado:', terminal.terminal);
            return { ok: success, message: 'Terminal eliminado correctamente' };
        } catch (error) {
            console.error('Error en terminales:remove:', error);
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle('terminales:bulkAdd', async (event, terminalesBulk) => {
        try {
            const terminales = await readJsonFile(TERMINALES_FILE);
            
            // Mapa para identificar terminales únicos
            const terminalMap = new Map();
            
            // Primero añadir los existentes al mapa
            terminales.forEach(t => {
                const key = `${t.agencia}||${t.marca}||${t.terminal}`;
                terminalMap.set(key, t);
            });
            
            let nuevos = 0;
            let actualizados = 0;
            
            // Añadir o actualizar con nuevos
            terminalesBulk.forEach(t => {
                const key = `${t.agencia}||${t.marca}||${t.terminal}`;
                const existe = terminalMap.has(key);
                
                if (existe) {
                    actualizados++;
                    terminalMap.set(key, { ...t, fechaActualizacion: new Date().toISOString() });
                } else {
                    nuevos++;
                    terminalMap.set(key, { ...t, fechaCreacion: new Date().toISOString() });
                }
            });
            
            // Convertir mapa a array
            const updatedTerminales = Array.from(terminalMap.values());
            
            const success = await writeJsonFile(TERMINALES_FILE, updatedTerminales);
            console.log(`Carga masiva completada: ${nuevos} nuevos, ${actualizados} actualizados`);
            return { 
                ok: success, 
                count: terminalesBulk.length,
                nuevos,
                actualizados,
                message: `Procesados: ${nuevos} nuevos, ${actualizados} actualizados`
            };
        } catch (error) {
            console.error('Error en bulkAdd terminales:', error);
            return { ok: false, error: error.message };
        }
    });

    // Handlers para notas
    ipcMain.handle('notas:list', async () => {
        return await readJsonFile(NOTAS_FILE);
    });

    ipcMain.handle('notas:add', async (event, nota) => {
        try {
            const notas = await readJsonFile(NOTAS_FILE);
            
            // Generar ID si no existe
            if (!nota.id) {
                nota.id = Date.now().toString();
            }
            
            nota.fechaCreacion = new Date().toISOString();
            notas.push(nota);
            
            const success = await writeJsonFile(NOTAS_FILE, notas);
            console.log('Nota agregada:', nota.id);
            return { ok: success, message: 'Nota agregada correctamente', id: nota.id };
        } catch (error) {
            console.error('Error en notas:add:', error);
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle('notas:remove', async (event, id) => {
        try {
            const notas = await readJsonFile(NOTAS_FILE);
            
            const filtered = notas.filter(n => n.id !== id);
            if (filtered.length === notas.length) {
                return { ok: false, error: 'Nota no encontrada' };
            }
            
            const success = await writeJsonFile(NOTAS_FILE, filtered);
            console.log('Nota eliminada:', id);
            return { ok: success, message: 'Nota eliminada correctamente' };
        } catch (error) {
            console.error('Error en notas:remove:', error);
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle('notas:update', async (event, id, notaActualizada) => {
        try {
            const notas = await readJsonFile(NOTAS_FILE);
            
            const index = notas.findIndex(n => n.id === id);
            if (index === -1) {
                return { ok: false, error: 'Nota no encontrada' };
            }
            
            notas[index] = { ...notaActualizada, id, fechaActualizacion: new Date().toISOString() };
            
            const success = await writeJsonFile(NOTAS_FILE, notas);
            console.log('Nota actualizada:', id);
            return { ok: success, message: 'Nota actualizada correctamente' };
        } catch (error) {
            console.error('Error en notas:update:', error);
            return { ok: false, error: error.message };
        }
    });

    // Handlers para historial
    ipcMain.handle('historial:list', async (event, correo) => {
        try {
            const historial = await readJsonFile(HISTORIAL_FILE);
            
            if (correo) {
                return historial.filter(h => h.correo === correo);
            }
            return historial;
        } catch (error) {
            console.error('Error en historial:list:', error);
            return [];
        }
    });

    ipcMain.handle('historial:add', async (event, entrega) => {
        try {
            const historial = await readJsonFile(HISTORIAL_FILE);
            
            // Generar ID si no existe
            if (!entrega.id) {
                entrega.id = Date.now().toString();
            }
            
            entrega.fechaEntrega = new Date().toISOString();
            historial.push(entrega);
            
            const success = await writeJsonFile(HISTORIAL_FILE, historial);
            console.log('Entrega registrada:', entrega.id);
            return { ok: success, message: 'Entrega registrada correctamente', id: entrega.id };
        } catch (error) {
            console.error('Error en historial:add:', error);
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle('historial:pdf', async (event, correo) => {
        try {
            console.log('Generando PDF de historial para:', correo);
            
            // Obtener datos del historial
            const historial = await readJsonFile(HISTORIAL_FILE);
            const historicalAgente = historial.filter(h => h.correo === correo);
            
            if (historicalAgente.length === 0) {
                return { ok: false, error: 'No hay entregas registradas para este agente' };
            }
            
            // Aquí implementarías la generación real del PDF
            // Por ahora simulamos la respuesta
            const fileName = `Historial-${correo}-${new Date().toISOString().split('T')[0]}.pdf`;
            const filePath = path.join(app.getPath('downloads'), fileName);
            
            return { 
                ok: true, 
                path: filePath,
                message: `PDF generado: ${fileName}`,
                registros: historicalAgente.length
            };
        } catch (error) {
            console.error('Error en historial:pdf:', error);
            return { ok: false, error: error.message };
        }
    });

    // Handler para exportar datos
    ipcMain.handle('data:export', async (event, tipo) => {
        try {
            let data;
            let fileName;
            
            switch (tipo) {
                case 'agents':
                    data = await readJsonFile(AGENTS_FILE);
                    fileName = `agentes-${new Date().toISOString().split('T')[0]}.json`;
                    break;
                case 'terminales':
                    data = await readJsonFile(TERMINALES_FILE);
                    fileName = `terminales-${new Date().toISOString().split('T')[0]}.json`;
                    break;
                case 'historial':
                    data = await readJsonFile(HISTORIAL_FILE);
                    fileName = `historial-${new Date().toISOString().split('T')[0]}.json`;
                    break;
                default:
                    return { ok: false, error: 'Tipo de exportación no válido' };
            }
            
            const result = await dialog.showSaveDialog(mainWindow, {
                defaultPath: fileName,
                filters: [
                    { name: 'JSON', extensions: ['json'] },
                    { name: 'Todos los archivos', extensions: ['*'] }
                ]
            });
            
            if (!result.canceled) {
                await writeJsonFile(result.filePath, data);
                console.log('Datos exportados a:', result.filePath);
                return { ok: true, path: result.filePath, message: 'Datos exportados correctamente' };
            }
            
            return { ok: false, error: 'Exportación cancelada' };
        } catch (error) {
            console.error('Error en data:export:', error);
            return { ok: false, error: error.message };
        }
    });

    // Handler para mostrar información de la aplicación
    ipcMain.handle('app:info', async () => {
        return {
            version: app.getVersion(),
            name: app.getName(),
            electron: process.versions.electron,
            node: process.versions.node,
            platform: process.platform
        };
    });

    console.log('Todos los handlers IPC registrados correctamente');
}

// Cerrar app cuando se cierran ventanas (excepto en macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Recrear ventana en macOS
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
    console.error('Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promesa rechazada no manejada:', reason);
});