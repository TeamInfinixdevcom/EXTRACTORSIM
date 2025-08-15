    const { contextBridge, ipcRenderer } = require('electron');

    contextBridge.exposeInMainWorld('electronAPI', {
    // Supervisor
    authSupervisor: (credentials) => ipcRenderer.invoke('supervisor:auth', credentials),

    // Agentes
    listAgents: () => ipcRenderer.invoke('agents:list'),
    addAgent: (agent) => ipcRenderer.invoke('agents:add', agent),
    removeAgent: (correo) => ipcRenderer.invoke('agents:remove', correo),

    // Terminales
    listTerminales: () => ipcRenderer.invoke('terminales:list'),
    addTerminal: (terminal) => ipcRenderer.invoke('terminales:add', terminal),
    removeTerminal: (terminal) => ipcRenderer.invoke('terminales:remove', terminal),
    bulkAddTerminales: (terminalesBulk) => ipcRenderer.invoke('terminales:bulkAdd', terminalesBulk),

    // SIM -> PDF / Envío
    generateAndSendSIM: (payload) => ipcRenderer.invoke('sims:generateSend', payload)
    });
