    // Electron/main-inventario.js
    const { ipcMain, BrowserWindow, app } = require('electron');
    const fs = require('fs');
    const fsPromises = require('fs/promises');
    const path = require('path');

    // Rutas a los JSON junto al ejecutable
            const AGENTS_PATH = path.join(__dirname, 'agents.json');
            const TERMINALES_PATH = path.join(__dirname, 'terminales.json');

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

            // ===== SIM -> Generar PDF =====
            ipcMain.handle('sims:generateSend', async (_e, payload) => {
            try {
                const html = buildSIMHtml(payload);
                // Ventana oculta para renderizar a PDF
                const pdfWin = new BrowserWindow({ show: false });
                await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

                const pdfBuffer = await pdfWin.webContents.printToPDF({
                marginsType: 1, printBackground: true, landscape: false, pageSize: 'A4'
                });

                const fileName = `SIM-${(payload.usuario || 'usuario')}-${(payload.fecha || 'fecha')}.pdf`
                .replace(/[^\w.-]+/g, '_');
                const savePath = path.join(app.getPath('downloads'), fileName);
                await fsPromises.writeFile(savePath, pdfBuffer);
                pdfWin.destroy();

                // Para envío por correo: aquí conectamos Nodemailer o Microsoft Graph si desea.
                return { ok: true, path: savePath, sent: false };
            } catch (err) {
                return { ok: false, error: String(err) };
            }
            });

            function buildSIMHtml({ agente, usuario, correo, fecha, contenido, firmaDataURL }) {
            return `<!doctype html>
            <html lang="es"><meta charset="utf-8"><title>SIM</title>
            <style>
            body { font-family: Arial, sans-serif; margin: 28px; color:#111; }
            h1 { font-size: 18px; margin: 0 0 10px; }
            .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 6px; }
            .box { border:1px solid #ccc; padding:12px; border-radius:8px; }
            pre { white-space: pre-wrap; }
            .sign { margin-top:24px; }
            .line { color:#555; }
            img { height: 46px; }
            </style>
            <h1>SIM</h1>
            <div class="grid">
            <div class="box"><b>Agente:</b> ${esc(agente)}</div>
            <div class="box"><b>Usuario:</b> ${esc(usuario)}</div>
            <div class="box"><b>Correo:</b> ${esc(correo)}</div>
            <div class="box"><b>Fecha:</b> ${esc(fecha)}</div>
            </div>
            <div class="box" style="margin-top:10px"><pre>${esc(contenido)}</pre></div>
            <div class="sign">
            ${firmaDataURL ? `<img src="${firmaDataURL}" alt="firma" />` : ''}
            <div class="line">______________________________</div>
            <div>Firma del supervisor</div>
            </div>
            </html>`;
            }
            function esc(s){ return String(s || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

            console.log('Handlers IPC listos (supervisor, agentes, terminales, SIM->PDF)');