// Local-only harness for exercising the real webview without an extension host.
import http from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolvePreferences, validateChoices } from 'abctools/preferences';
import { PreferenceStore } from '../out/extension/preferenceStore.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(path.join(os.tmpdir(), 'abc-webview-'));
const store = new PreferenceStore(path.join(directory, 'preferences.json'));
let revision = 0;
let snapshot = await store.read();
let fixture = '%%fit2box * *\n%%pagescale 1\nX:1\nT:Preview fixture\nM:2/4\nL:1/4\nV:lead name="Melody"\nV:low name="Counterpoint"\nK:C\n[V:lead] "C/G" C D | E F |]\n[V:low] C, D, | E, F, |]\n';
function message() {
    return {
        command: 'render', documentId: 'fixture.abc', revision: ++revision,
        resourceKey: 'fixture.abc', content: fixture,
        preferences: resolvePreferences(snapshot.value, 'fixture.abc'),
        defaultChoices: resolvePreferences({ version: 1, defaults: snapshot.value.defaults }, 'fixture.abc'),
        fileChoices: snapshot.value.files?.['fixture.abc'] ?? {},
        origin: snapshot.value.files?.['fixture.abc'] ? 'file' : 'defaults', storageLabel: store.filename
    };
}
const server = http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/fixture' && request.method === 'POST') {
            let body = '';
            for await (const chunk of request) body += chunk;
            const update = JSON.parse(body);
            if (typeof update.content !== 'string') throw new Error('Fixture content must be ABC text.');
            fixture = update.content;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(message()));
            return;
        }
        if (url.pathname === '/message') {
            if (request.method === 'POST') {
                let body = '';
                for await (const chunk of request) body += chunk;
                const update = JSON.parse(body);
                const value = structuredClone(snapshot.value);
                const files = value.files ??= {};
                if (update.action === 'reset') delete files['fixture.abc'];
                else if (update.action === 'file') files['fixture.abc'] = validateChoices(update.choices);
                else {
                    value.defaults = validateChoices(update.choices, false);
                }
                await store.write(value, snapshot.revision);
                snapshot = await store.read();
            }
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(message()));
            return;
        }
        if (url.pathname === '/' || url.pathname === '/index.html') {
            let html = await readFile(path.join(root, 'out/webview/webview.html'), 'utf8');
            html = html.replaceAll('__BASE_URI__', '');
            html = html.replace('<head>', `<head><script>
                window.acquireVsCodeApi = () => ({
                    getState() {}, setState() {},
                    async postMessage(message) {
                        if (!['ready', 'preferences', 'reloadPreferences'].includes(message.command)) return;
                        try {
                            const response = await fetch('/message', message.command === 'preferences'
                                ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)} : {});
                            if (!response.ok) throw new Error(await response.text());
                            window.postMessage(await response.json(), location.origin);
                        } catch(error) { window.postMessage({command:'preferenceError',message:String(error)}, location.origin); }
                    }
                });
            </script>`);
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
            return;
        }
        if (!/^\/(?:lib|out)\//.test(url.pathname)) { response.writeHead(404).end(); return; }
        const filename = path.resolve(root, `.${url.pathname}`);
        if (!filename.startsWith(root)) throw new Error('Invalid asset path');
        response.setHeader('Content-Type', /\.m?js$/.test(filename) ? 'text/javascript' : 'application/octet-stream');
        response.end(await readFile(filename));
    } catch (error) {
        response.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(error));
    }
});
server.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}`));
process.on('SIGTERM', () => server.close(async () => { await rm(directory, { recursive: true }); process.exit(0); }));
