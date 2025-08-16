/*
  pdf.js - Código para mejorar la generación de PDF con diálogo de guardado
*/

// Reemplazar el comportamiento original del botón
document.addEventListener('DOMContentLoaded', () => {
    const btnGenerar = document.getElementById('btnGenerar');
    
    if (btnGenerar) {
        // Guardar la función original
        const originalHandler = btnGenerar.onclick;
        
        // Reemplazar con la nueva que incluye diálogo de guardado
        btnGenerar.onclick = async function() {
            if (!window.supervisorAutenticado) return alert('Debe autenticarse como supervisor.');
            window.actualizarPreviewSIM();
            
            // Preparar datos para el nombre del archivo
            const usuario = document.getElementById('usuario').value.trim();
            const fecha = document.getElementById('miniDate').value;
            const fileName = `SIM-Kolbi-${usuario}-${fecha}.pdf`;
            
            try {
                // 1. Mostrar diálogo para elegir dónde guardar
                const savePath = await window.electronAPI.saveDialog(fileName);
                if (!savePath) {
                    console.log('Guardado cancelado por el usuario');
                    return;
                }
                
                // 2. Preparar payload con los datos del formulario
                const payload = {
                    agente: document.getElementById('agente').value.trim(),
                    usuario: document.getElementById('usuario').value.trim(),
                    correo: document.getElementById('correo').value.trim(),
                    fecha: document.getElementById('miniDate').value,
                    contenido: document.getElementById('contenido').value,
                    firmaPath: "./firmasupervisor.jpg",
                    savePath: savePath // Añadir la ruta seleccionada
                };
                
                // 3. Generar el PDF
                const res = await window.electronAPI.generateAndSendSIM(payload);
                if (res?.ok) {
                    alert(`PDF guardado correctamente en:\n${res.path}${res.sent ? '\nCorreo enviado.' : ''}`);
                } else {
                    alert(`Error al generar/enviar: ${res?.error || 'desconocido'}`);
                }
            } catch (error) {
                console.error('Error generando PDF:', error);
                alert(`Error: ${error.message || 'Error desconocido'}`);
            }
        };
    }
    
    // También mejorar el botón de historial PDF
    const btnHistorialPdf = document.getElementById('btnHistorialPdf');
    if (btnHistorialPdf) {
        btnHistorialPdf.onclick = async function() {
            const correo = document.getElementById('filtroCorreo').value.trim();
            if (!correo) return alert('Indica el correo para el PDF');
            
            // Nombre de archivo sugerido
            const fileName = `Historial-${correo}-${new Date().toISOString().slice(0,10)}.pdf`;
            
            try {
                // Mostrar diálogo para elegir dónde guardar
                const savePath = await window.electronAPI.saveDialog(fileName);
                if (!savePath) return;
                
                // Generar PDF con la ruta seleccionada
                const res = await window.electronAPI.historialPdf({correo, savePath});
                
                if (res?.ok) alert(`PDF guardado correctamente en:\n${res.path}`);
                else alert(`Error al generar PDF: ${res?.error || 'desconocido'}`);
            } catch (error) {
                alert(`Error: ${error.message || 'Error desconocido'}`);
            }
        };
    }
});