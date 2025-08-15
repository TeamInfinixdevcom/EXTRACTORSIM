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


    /* renderer-inventario.js */
    (() => {
    // ---------- Helpers de almacenamiento ----------
    const hasIPC = () => !!(window.api && window.api.inventory);
    const storeKey = 'inventario.extractorsim.v1';

    async function inv_list() {
        if (hasIPC()) return await window.api.inventory.list();
        const raw = localStorage.getItem(storeKey);
        return raw ? JSON.parse(raw) : [];
    }
    async function inv_bulkUpsert(items = []) {
        if (hasIPC()) return await window.api.inventory.bulkUpsert(items);
        const cur = await inv_list();
        // upsert por (agencia, marca, terminal)
        const key = (r) => `${r.agencia}||${r.marca}||${r.terminal}`.toLowerCase();
        const map = new Map(cur.map(r => [key(r), r]));
        for (const it of items) map.set(key(it), it);
        const out = [...map.values()];
        localStorage.setItem(storeKey, JSON.stringify(out));
        return { ok: true, count: items.length };
    }
    async function inv_upsert(item) {
        return inv_bulkUpsert([item]);
    }
    async function inv_remove(item) {
        if (hasIPC()) return await window.api.inventory.remove(item);
        const cur = await inv_list();
        const out = cur.filter(r =>
        !(
            (r.agencia || '').toLowerCase() === (item.agencia || '').toLowerCase() &&
            (r.marca   || '').toLowerCase() === (item.marca   || '').toLowerCase() &&
            (r.terminal|| '').toLowerCase() === (item.terminal|| '').toLowerCase()
        )
        );
        localStorage.setItem(storeKey, JSON.stringify(out));
        return { ok: true, removed: cur.length - out.length };
    }

    // ---------- DOM refs ----------
    const $ = (s) => document.querySelector(s);
    const txtBulk       = $('#txtBulk');
    const btnCargar     = $('#btnCargar');
    const inpAgencia    = $('#inpAgencia');
    const inpMarca      = $('#inpMarca');
    const inpTerminal   = $('#inpTerminal');
    const inpDisponible = $('#inpDisponible');
    const btnGuardar    = $('#btnGuardar');
    const btnEliminar   = $('#btnEliminar');
    const btnRefrescar  = $('#btnRefrescar');
    const inpBuscar     = $('#inpBuscar');
    const tblInvBody    = $('#tblInvBody');
    const filtersBox    = $('#filtersMarca');

    let INVENTARIO = [];
    let filtroMarca = '';
    let filtroTexto = '';

    // ---------- Parseo del textarea ----------
    function parseLinea(linea) {
        // acepta coma o tab y espacios múltiples
        const parts = linea.split(/\t|,/).map(s => s.trim()).filter(Boolean);
        if (parts.length < 4) return null;
        const [agencia, marca, terminal, disponible] = parts;
        const dispNum = Number(String(disponible).replace(/[^\d-]/g, '')) || 0;
        return {
        agencia,
        marca,
        terminal,
        disponible: dispNum
        };
    }

    function parseBulk(texto) {
        const rows = [];
        (texto || '').split(/\r?\n/).forEach(line => {
        const clean = line.trim();
        if (!clean) return;
        const reg = parseLinea(clean);
        if (reg) rows.push(reg);
        });
        return rows;
    }

    // ---------- Render tabla ----------
    function renderTabla() {
        if (!tblInvBody) return;
        const rows = INVENTARIO
        .filter(r => (filtroMarca ? r.marca.toLowerCase() === filtroMarca : true))
        .filter(r => {
            if (!filtroTexto) return true;
            const t = filtroTexto.toLowerCase();
            return (
            r.agencia.toLowerCase().includes(t) ||
            r.marca.toLowerCase().includes(t) ||
            r.terminal.toLowerCase().includes(t)
            );
        });

        tblInvBody.innerHTML = rows.map(r => `
        <tr data-ag="${esc(r.agencia)}" data-ma="${esc(r.marca)}" data-te="${esc(r.terminal)}">
            <td>${esc(r.agencia)}</td>
            <td>${esc(r.marca)}</td>
            <td>${esc(r.terminal)}</td>
            <td style="text-align:right">${Number(r.disponible)}</td>
        </tr>
        `).join('');

        // click para seleccionar fila y llenar inputs
        tblInvBody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => {
            inpAgencia && (inpAgencia.value = tr.dataset.ag || '');
            inpMarca && (inpMarca.value = tr.dataset.ma || '');
            inpTerminal && (inpTerminal.value = tr.dataset.te || '');
            const row = INVENTARIO.find(r =>
            r.agencia === tr.dataset.ag &&
            r.marca === tr.dataset.ma &&
            r.terminal === tr.dataset.te
            );
            if (row && inpDisponible) inpDisponible.value = row.disponible;
        });
        });
    }

    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, m => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    // ---------- Eventos UI ----------
    btnCargar && (btnCargar.onclick = async () => {
        if (!txtBulk) return;
        const items = parseBulk(txtBulk.value);
        if (!items.length) {
        alert('No se encontraron filas válidas.\nFormato: Agencia,Marca,Terminal,Disponible');
        return;
        }
        await inv_bulkUpsert(items);
        INVENTARIO = await inv_list();
        renderTabla();
        alert(`extractorsim\n\nCargados ${items.length} registros`);
    });

    btnGuardar && (btnGuardar.onclick = async () => {
        const item = {
        agencia: (inpAgencia?.value || '').trim(),
        marca: (inpMarca?.value || '').trim(),
        terminal: (inpTerminal?.value || '').trim(),
        disponible: Number((inpDisponible?.value || '0').trim()) || 0
        };
        if (!item.agencia || !item.marca || !item.terminal) {
        alert('Agencia, Marca y Terminal son obligatorios.');
        return;
        }
        await inv_upsert(item);
        INVENTARIO = await inv_list();
        renderTabla();
        alert('Guardado ✔️');
    });

    btnEliminar && (btnEliminar.onclick = async () => {
        const item = {
        agencia: (inpAgencia?.value || '').trim(),
        marca: (inpMarca?.value || '').trim(),
        terminal: (inpTerminal?.value || '').trim()
        };
        if (!item.agencia || !item.marca || !item.terminal) {
        alert('Para eliminar, seleccioná una fila o llená Agencia/Marca/Terminal.');
        return;
        }
        const res = await inv_remove(item);
        INVENTARIO = await inv_list();
        renderTabla();
        alert(res.removed ? 'Eliminado 🗑️' : 'No se encontró el registro.');
    });

    btnRefrescar && (btnRefrescar.onclick = async () => {
        INVENTARIO = await inv_list();
        renderTabla();
    });

    inpBuscar && (inpBuscar.oninput = (e) => {
        filtroTexto = e.target.value.trim();
        renderTabla();
    });

    if (filtersBox) {
        filtersBox.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-marca]');
        if (!btn) return;
        const m = btn.getAttribute('data-marca');
        filtroMarca = m && m !== 'Todas' ? m.toLowerCase() : '';
        // opcional: marcar activo
        [...filtersBox.querySelectorAll('[data-marca]')].forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTabla();
        });
    }

    // ---------- Init ----------
    document.addEventListener('DOMContentLoaded', async () => {
        INVENTARIO = await inv_list();
        renderTabla();
    });
    })();
