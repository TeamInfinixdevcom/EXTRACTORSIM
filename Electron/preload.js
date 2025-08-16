const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ============= AUTENTICACIÓN DE SUPERVISOR =============
    supervisor: {
        auth: (credentials) => ipcRenderer.invoke('supervisor:auth', credentials),
        check: (email) => ipcRenderer.invoke('supervisor:check', email)
    },

    // ============= GESTIÓN DE AGENTES =============
    agents: {
        list: () => ipcRenderer.invoke('agents:list'),
        add: (agent) => ipcRenderer.invoke('agents:add', agent),
        remove: (correo) => ipcRenderer.invoke('agents:remove', correo)
    },

    // ============= GESTIÓN DE TERMINALES =============
    terminales: {
        list: () => ipcRenderer.invoke('terminales:list'),
        add: (terminal) => ipcRenderer.invoke('terminales:add', terminal),
        remove: (terminal) => ipcRenderer.invoke('terminales:remove', terminal),
        bulkAdd: (terminales) => ipcRenderer.invoke('terminales:bulkAdd', terminales)
    },

    // ============= FUNCIONES LEGACY (para compatibilidad) =============
    // Estas son las funciones que el frontend está buscando
    listTerminales: () => ipcRenderer.invoke('terminales:list'),
    listNotas: () => ipcRenderer.invoke('notas:list'),
    listHistorial: (correo) => ipcRenderer.invoke('historial:list', correo),
    
    // ============= GESTIÓN DE NOTAS =============
    notas: {
        list: () => ipcRenderer.invoke('notas:list'),
        add: (nota) => ipcRenderer.invoke('notas:add', nota),
        update: (id, nota) => ipcRenderer.invoke('notas:update', id, nota),
        remove: (id) => ipcRenderer.invoke('notas:remove', id)
    },

    // ============= GESTIÓN DE HISTORIAL =============
    historial: {
        list: (correo) => ipcRenderer.invoke('historial:list', correo),
        add: (entrega) => ipcRenderer.invoke('historial:add', entrega),
        pdf: (correo) => ipcRenderer.invoke('historial:pdf', correo)
    },

    // ============= GESTIÓN DE INVENTARIO =============
    inventario: {
        agregar: (item) => ipcRenderer.invoke('inventario:agregar', item),
        obtener: () => ipcRenderer.invoke('inventario:obtener'),
        actualizar: (id, item) => ipcRenderer.invoke('inventario:actualizar', id, item),
        eliminar: (id) => ipcRenderer.invoke('inventario:eliminar', id),
        filtrar: (filtros) => ipcRenderer.invoke('inventario:filtrar', filtros)
    },

    // ============= UTILIDADES =============
    data: {
        export: (tipo) => ipcRenderer.invoke('data:export', tipo)
    },

    app: {
        info: () => ipcRenderer.invoke('app:info')
    }
});

console.log('✅ Preload cargado exitosamente');