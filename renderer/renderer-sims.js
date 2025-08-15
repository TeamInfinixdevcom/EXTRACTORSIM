// Este script se ejecuta cuando el DOM está listo.
document.addEventListener('DOMContentLoaded', () => {
    
    // ========== AGENTES ==========
    const selAgente = document.getElementById('selAgente');
    const btnAddAgente = document.getElementById('btnAddAgente');
    const btnDelAgente = document.getElementById('btnDelAgente');

    async function cargarAgentes() {
        // Usa la API expuesta por el preload, no ipcRenderer
        if (!window.api || !selAgente) {
            console.error("API de Preload no encontrada o el select de agentes no existe.");
            return;
        }
        
        const agentes = await window.api.agentsList();

        selAgente.innerHTML = '<option value="">-- Seleccione --</option>';
        agentes.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.correo;
            opt.textContent = `${a.nombre || a.usuario} (${a.correo})`;
            selAgente.appendChild(opt);
        });
    }

    // Cargar agentes al inicio
    cargarAgentes();

    // Lógica de botones y select
    if (btnAddAgente) {
        btnAddAgente.onclick = async () => {
            const nombre = document.getElementById('newNombre').value.trim();
            const usuario = document.getElementById('newUsuario').value.trim();
            const correo = document.getElementById('newCorreo').value.trim();
            if (!correo) return alert('El correo es obligatorio.');
            
            await window.api.agentsAdd({ nombre, usuario, correo });
            cargarAgentes(); // Recargar la lista
            
            document.getElementById('newNombre').value = '';
            document.getElementById('newUsuario').value = '';
            document.getElementById('newCorreo').value = '';
        };
    }

    if (btnDelAgente) {
        btnDelAgente.onclick = async () => {
            const correo = document.getElementById('newCorreo').value.trim();
            if (!correo) return alert('Indica un correo para eliminar.');
            await window.api.agentsRemove(correo);
            cargarAgentes(); // Recargar la lista
        };
    }

    if (selAgente) {
        selAgente.onchange = async () => {
            const correo = selAgente.value;
            if (!correo) return;
            const agentes = await window.api.agentsList();
            const agente = agentes.find(a => a.correo === correo);
            if (agente) {
                document.getElementById('agente').value = agente.nombre || '';
                document.getElementById('usuario').value = agente.usuario || '';
                document.getElementById('correo').value = agente.correo || '';
            }
        };
    }

    // Aquí puedes agregar el resto de la lógica de tu UI que necesite la API
});