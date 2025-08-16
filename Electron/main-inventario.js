const { ipcMain, BrowserWindow, app } = require('electron');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

// Rutas a los JSON junto al ejecutable
const AGENTS_PATH = path.join(__dirname, 'agents.json');
const TERMINALES_PATH = path.join(__dirname, 'terminales.json');
const KOLBI_LOGO_PATH = path.join(__dirname, 'kolbi.png');
const FIRMA_PATH = path.join(__dirname, 'firmasupervisor.jpg');
const HISTORIAL_PATH = path.join(__dirname, 'historial_entregas.json');
const NOTAS_PATH = path.join(__dirname, 'notas.json');

// -------- helpers JSON --------
function safeReadJsonSync(p, fallback) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { return fallback; }
}
async function readJSON(p, fallback) {
    try { return JSON.parse(await fsPromises.readFile(p, 'utf8')); }
    catch { return fallback; }
}
async function writeJSON(p, data) {
    await fsPromises.mkdir(path.dirname(p), { recursive: true });
    await fsPromises.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

// ===== Supervisor (placeholder) =====
ipcMain.handle('supervisor:auth', async (_evt, { email, password }) => {
    const ok = typeof email === 'string' && email.includes('@') && !!password;
    return { ok, email, ts: Date.now() };
});

// ===== Agentes =====
ipcMain.handle('agents:list', async () => {
    const cfg = await readJSON(AGENTS_PATH, { defaultAgent: null, agents: [] });
    const list = [];
    if (cfg.defaultAgent) list.push(cfg.defaultAgent);
    if (Array.isArray(cfg.agents)) list.push(...cfg.agents);
    return list;
});

ipcMain.handle('agents:add', async (_evt, agent) => {
    if (!agent?.correo) return { ok: false, error: 'Correo requerido' };
    const cfg = await readJSON(AGENTS_PATH, { defaultAgent: null, agents: [] });
    cfg.agents = Array.isArray(cfg.agents) ? cfg.agents : [];
    const i = cfg.agents.findIndex(a => a.correo === agent.correo);
    if (i >= 0) cfg.agents[i] = { ...cfg.agents[i], ...agent };
    else cfg.agents.push(agent);
    await writeJSON(AGENTS_PATH, cfg);
    return { ok: true };
});

ipcMain.handle('agents:remove', async (_evt, correo) => {
    const cfg = await readJSON(AGENTS_PATH, { defaultAgent: null, agents: [] });
    cfg.agents = (cfg.agents || []).filter(a => a.correo !== correo);
    if (cfg.defaultAgent?.correo === correo) cfg.defaultAgent = null;
    await writeJSON(AGENTS_PATH, cfg);
    return { ok: true };
});

// ===== Terminales =====
ipcMain.handle('terminales:list', async () => {
    return await readJSON(TERMINALES_PATH, []);
});

ipcMain.handle('terminales:add', async (_e, t) => {
    const list = await readJSON(TERMINALES_PATH, []);
    const key = x => `${x.agencia}__${x.marca}__${x.terminal}`.toLowerCase();
    const idx = list.findIndex(x => key(x) === key(t));
    if (idx >= 0) list[idx] = { ...list[idx], ...t, disponible: Number(t.disponible) || 0 };
    else list.push({ ...t, disponible: Number(t.disponible) || 0 });
    await writeJSON(TERMINALES_PATH, list);
    return { ok: true };
});

ipcMain.handle('terminales:remove', async (_e, t) => {
    const list = await readJSON(TERMINALES_PATH, []);
    const key = x => `${x.agencia}__${x.marca}__${x.terminal}`.toLowerCase();
    const out = list.filter(x => key(x) !== key(t));
    await writeJSON(TERMINALES_PATH, out);
    return { ok: true };
});

ipcMain.handle('terminales:bulkAdd', async (_e, bulk) => {
    if (!Array.isArray(bulk)) return { ok: false, error: 'Formato inválido' };
    const norm = bulk.map(t => ({ ...t, disponible: Number(t.disponible) || 0 }));
    await writeJSON(TERMINALES_PATH, norm);
    return { ok: true, count: norm.length };
});

// ===== Notas del supervisor =====
ipcMain.handle('notas:list', async () => {
    return await readJSON(NOTAS_PATH, []);
});
ipcMain.handle('notas:add', async (_e, nota) => {
    const notas = await readJSON(NOTAS_PATH, []);
    nota.id = Date.now().toString();
    notas.push(nota);
    await writeJSON(NOTAS_PATH, notas);
    return { ok: true, id: nota.id };
});
ipcMain.handle('notas:edit', async (_e, nota) => {
    const notas = await readJSON(NOTAS_PATH, []);
    const idx = notas.findIndex(n => n.id === nota.id);
    if (idx >= 0) notas[idx] = nota;
    await writeJSON(NOTAS_PATH, notas);
    return { ok: idx >= 0 };
});
ipcMain.handle('notas:remove', async (_e, id) => {
    const notas = await readJSON(NOTAS_PATH, []);
    const out = notas.filter(n => n.id !== id);
    await writeJSON(NOTAS_PATH, out);
    return { ok: true };
});

// ===== SIM -> Generar PDF y guardar historial =====
ipcMain.handle('sims:generateSend', async (_e, payload) => {
    try {
        const html = await buildSIMHtmlKolbi(payload);
        const pdfWin = new BrowserWindow({ show: false });
        await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

        const pdfBuffer = await pdfWin.webContents.printToPDF({
            marginsType: 1, printBackground: true, landscape: false, pageSize: 'A4'
        });

        const fileName = `SIM-Kolbi-${(payload.usuario || 'usuario')}-${(payload.fecha || 'fecha')}.pdf`
            .replace(/[^\w.-]+/g, '_');
        const savePath = path.join(app.getPath('downloads'), fileName);
        await fsPromises.writeFile(savePath, pdfBuffer);
        pdfWin.destroy();

        await agregarHistorialEntrega({
            agente: payload.agente,
            usuario: payload.usuario,
            correo: payload.correo,
            fecha: payload.fecha,
            hora: new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            contenido: payload.contenido,
            pdf: savePath
        });

        return { ok: true, path: savePath, sent: false };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
});

// ===== Historial de entregas =====
async function agregarHistorialEntrega(entrega) {
    const historial = await readJSON(HISTORIAL_PATH, []);
    historial.push({ ...entrega, id: Date.now().toString() });
    await writeJSON(HISTORIAL_PATH, historial);
}

// Filtrar historial por correo
ipcMain.handle('historial:list', async (_e, filtroCorreo) => {
    const historial = await readJSON(HISTORIAL_PATH, []);
    if (filtroCorreo) {
        return historial.filter(h => h.correo === filtroCorreo);
    }
    return historial;
});

// ===== Generar PDF de historial por correo =====
ipcMain.handle('historial:pdf', async (_e, correo) => {
    try {
        const historial = await readJSON(HISTORIAL_PATH, []);
        const entregas = historial.filter(h => h.correo === correo);
        const html = await buildHistorialPdfHtmlKolbi(correo, entregas);

        const pdfWin = new BrowserWindow({ show: false });
        await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

        const pdfBuffer = await pdfWin.webContents.printToPDF({
            marginsType: 1, printBackground: true, landscape: false, pageSize: 'A4'
        });

        const fileName = `Historial-Entregas-${correo}.pdf`.replace(/[^\w.-]+/g, '_');
        const savePath = path.join(app.getPath('downloads'), fileName);
        await fsPromises.writeFile(savePath, pdfBuffer);
        pdfWin.destroy();

        return { ok: true, path: savePath };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
});

// ===== HTML para PDF Kolbi =====
async function buildSIMHtmlKolbi({ agente, usuario, correo, fecha, contenido, firmaPath }) {
    const logoKolbi = fs.existsSync(KOLBI_LOGO_PATH)
        ? 'data:image/png;base64,' + fs.readFileSync(KOLBI_LOGO_PATH).toString('base64')
        : '';
    const firmaSupervisor = fs.existsSync(FIRMA_PATH)
        ? 'data:image/jpeg;base64,' + fs.readFileSync(FIRMA_PATH).toString('base64')
        : '';
    const hora = new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return `<!doctype html>
<html lang="es"><meta charset="utf-8"><title>Entrega de SIMs Físicas Kolbi</title>
<style>
body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    background: #43b02a;
    color: #fff;
}
.header-kolbi {
    display: flex;
    align-items: center;
    gap: 18px;
    background: #43b02a;
    padding: 32px 32px 12px 32px;
}
.header-kolbi img {
    height: 70px;
}
.header-kolbi .title {
    font-size: 2rem;
    font-weight: bold;
    color: #fff;
}
.eslogan {
    font-size: 1.1em;
    color: #0c59cc;
    font-weight: bold;
    margin-left: 120px;
    margin-top: -18px;
    margin-bottom: 18px;
}
.leyenda {
    background: rgba(255,255,255,0.13);
    color: #fff;
    font-size: 1.15em;
    padding: 18px 32px 10px 32px;
    border-radius: 12px;
    margin: 0 32px 18px 32px;
}
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0 32px;
}
.box {
    background: rgba(255,255,255,0.18);
    color: #fff;
    border-radius: 8px;
    padding: 12px;
    font-size: 1em;
    border: none;
}
pre {
    white-space: pre-wrap;
    background: rgba(255,255,255,0.10);
    color: #fff;
    border-radius: 8px;
    padding: 12px;
    margin: 0 32px 0 32px;
    font-size: 1em;
}
.sign {
    margin-top: 32px;
    margin-left: 32px;
}
.line {
    color: #fff;
    margin-top: 8px;
    margin-bottom: 4px;
}
.firma-img {
    height: 60px;
    margin-bottom: 6px;
}
.footer {
    margin-top: 48px;
    text-align: center;
    color: #0c59cc;
    font-size: 1.2em;
    font-weight: bold;
}
</style>
<body>
    <div class="header-kolbi">
        ${logoKolbi ? `<img src="${logoKolbi}" alt="Kolbi" />` : ''}
        <div class="title">Entrega de SIMs Físicas Kolbi</div>
    </div>
    <div class="eslogan">#somos de los mismos</div>
    <div class="leyenda">
        Se hace constar que el supervisor <b>${esc(agente)}</b> entrega las siguientes SIMs físicas el <b>${esc(fecha)}</b> a las <b>${hora}</b>.
    </div>
    <div class="grid">
        <div class="box"><b>Agente:</b> ${esc(agente)}</div>
        <div class="box"><b>Usuario:</b> ${esc(usuario)}</div>
        <div class="box"><b>Correo:</b> ${esc(correo)}</div>
        <div class="box"><b>Fecha:</b> ${esc(fecha)}</div>
    </div>
    <pre>${esc(contenido)}</pre>
    <div class="sign">
        ${firmaSupervisor ? `<img class="firma-img" src="${firmaSupervisor}" alt="firma" />` : ''}
        <div class="line">______________________________</div>
        <div>Firma del supervisor</div>
    </div>
    <div class="footer">#somos de los mismos</div>
</body>
</html>`;
}

// ===== HTML para PDF de historial por correo =====
async function buildHistorialPdfHtmlKolbi(correo, entregas) {
    const logoKolbi = fs.existsSync(KOLBI_LOGO_PATH)
        ? 'data:image/png;base64,' + fs.readFileSync(KOLBI_LOGO_PATH).toString('base64')
        : '';
    return `<!doctype html>
<html lang="es"><meta charset="utf-8"><title>Historial de Entregas Kolbi</title>
<style>
body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    background: #43b02a;
    color: #fff;
}
.header-kolbi {
    display: flex;
    align-items: center;
    gap: 18px;
    background: #43b02a;
    padding: 32px 32px 12px 32px;
}
.header-kolbi img {
    height: 70px;
}
.header-kolbi .title {
    font-size: 2rem;
    font-weight: bold;
    color: #fff;
}
.eslogan {
    font-size: 1.1em;
    color: #0c59cc;
    font-weight: bold;
    margin-left: 120px;
    margin-top: -18px;
    margin-bottom: 18px;
}
.historial-table {
    width: 90%;
    margin: 0 auto;
    border-collapse: collapse;
    background: rgba(255,255,255,0.10);
    color: #fff;
    border-radius: 12px;
    overflow: hidden;
}
.historial-table th, .historial-table td {
    padding: 8px 12px;
    border-bottom: 1px solid #fff;
    font-size: 1em;
}
.historial-table th {
    background: rgba(255,255,255,0.18);
    color: #fff;
}
.footer {
    margin-top: 48px;
    text-align: center;
    color: #0c59cc;
    font-size: 1.2em;
    font-weight: bold;
}
</style>
<body>
    <div class="header-kolbi">
        ${logoKolbi ? `<img src="${logoKolbi}" alt="Kolbi" />` : ''}
        <div class="title">Historial de Entregas Kolbi</div>
    </div>
    <div class="eslogan">#somos de los mismos</div>
    <h2 style="text-align:center;">Correo: ${esc(correo)}</h2>
    <table class="historial-table">
        <thead>
            <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Usuario</th>
                <th>Agente</th>
                <th>SIMs Entregadas</th>
            </tr>
        </thead>
        <tbody>
            ${entregas.map(e => `
                <tr>
                    <td>${esc(e.fecha)}</td>
                    <td>${esc(e.hora)}</td>
                    <td>${esc(e.usuario)}</td>
                    <td>${esc(e.agente)}</td>
                    <td><pre style="background:none;color:#fff;">${esc(e.contenido)}</pre></td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    <div class="footer">#somos de los mismos</div>
</body>
</html>`;
}

function esc(s) {
    return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

console.log('Handlers IPC listos (supervisor, agentes, terminales, SIM->PDF Kolbi, historial entregas, notas)');