import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

test('previews restore their saved source without an active editor and remain live', async t => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const directory = await mkdtemp(path.join(os.tmpdir(), 'abc-preview-restore-'));
    const commands = new Map();
    const errors = [];
    let serializer;
    let changeDocument;
    let saveDocument;
    let openedDocument;
    let createdPanels = 0;
    const disposable = { dispose() {} };
    const uri = value => ({ scheme: new URL(value).protocol.slice(0, -1), fsPath: fileURLToPath(value), toString: () => value });
    const vscode = {
        Uri: {
            file: filename => uri(pathToFileURL(filename).href),
            parse: uri,
            joinPath: (base, ...parts) => uri(pathToFileURL(path.join(base.fsPath, ...parts)).href)
        },
        ViewColumn: { Beside: -2 },
        EndOfLine: { CRLF: 2 },
        commands: { registerCommand(name, callback) { commands.set(name, callback); return disposable; } },
        workspace: {
            getWorkspaceFolder: () => ({ uri: vscode.Uri.file(directory) }),
            onDidChangeTextDocument(callback) { changeDocument = callback; return disposable; },
            onDidSaveTextDocument(callback) { saveDocument = callback; return disposable; },
            async openTextDocument(resource) {
                if (resource.toString() !== openedDocument.uri.toString()) throw new Error('Source file not found');
                return openedDocument;
            }
        },
        window: {
            registerWebviewPanelSerializer(type, value) {
                assert.equal(type, 'musicSheet');
                serializer = value;
                return disposable;
            },
            createWebviewPanel() { createdPanels++; return makePanel(); },
            showErrorMessage(message) { errors.push(message); }
        },
        languages: {
            createDiagnosticCollection: () => ({ set() {}, ...disposable }),
            registerCompletionItemProvider: () => disposable
        }
    };
    function makePanel() {
        let receive;
        let onDispose;
        let resolveRender;
        const rendered = new Promise(resolve => { resolveRender = resolve; });
        return {
            webview: {
                asWebviewUri: resource => resource,
                onDidReceiveMessage(callback) { receive = callback; return disposable; },
                postMessage(message) { resolveRender(message); return Promise.resolve(true); }
            },
            rendered,
            send(message) { receive(message); },
            onDidDispose(callback) { onDispose = callback; return disposable; },
            dispose() { this.disposed = true; onDispose?.(); },
            reveal() { this.revealed = true; }
        };
    }
    const require = createRequire(import.meta.url);
    const originalLoad = Module._load;
    let extension;
    try {
        Module._load = function (id, ...args) {
            return id === 'vscode' ? vscode : originalLoad.call(this, id, ...args);
        };
        extension = require('../out/extension/extension.js');
    } finally { Module._load = originalLoad; }
    try {
        const folder = path.join(directory, 'tunes');
        await mkdir(folder);
        const filename = path.join(folder, 'restored.raw.abc');
        let content = 'X:1\nT:Restored\nM:2/4\nL:1/4\nK:C\nC D|]\n';
        await writeFile(filename, content);
        openedDocument = {
            uri: vscode.Uri.file(filename), fileName: filename, languageId: 'abc',
            eol: 1, getText: () => content
        };
        extension.activate({
            extensionPath: root, extensionUri: vscode.Uri.file(root),
            globalStorageUri: vscode.Uri.file(path.join(directory, 'storage')),
            workspaceState: { get() {} }, subscriptions: []
        });
        const restored = makePanel();
        await serializer.deserializeWebviewPanel(restored, { documentId: openedDocument.uri.toString() });
        assert.equal(createdPanels, 0, 'restore must reuse the panel and editor group supplied by VS Code');
        assert.equal(restored.title, 'ABC Preview: restored.raw.abc');
        assert.equal(restored.webview.options.enableScripts, true);
        assert.equal(restored.webview.options.localResourceRoots.length, 3);
        assert.match(restored.webview.html, /<html/);
        restored.send({ command: 'ready' });
        const message = await restored.rendered;
        assert.equal(message.command, 'render');
        assert.equal(message.documentId, openedDocument.uri.toString());
        assert.match(message.content, /T:Restored/);
        let updated;
        restored.webview.postMessage = async message => { updated = message; return true; };
        content = content.replace('T:Restored', 'T:Edited after restore');
        await changeDocument({ document: openedDocument });
        assert.match(updated.content, /T:Edited after restore/);
        assert.ok(updated.revision > message.revision);
        await t.test('templates inherit, override and refresh when library configuration is saved', async () => {
            const define = rhythm => `%%template rhythm\n%%MIDI gchordon\n%%MIDI gchord ${rhythm}\n%%endtemplate\n`;
            const parentConfig = path.join(directory, '.base.abcconfig');
            const childConfig = path.join(folder, '.tunes.abcconfig');
            const configDocument = fileName => ({ fileName, uri: vscode.Uri.file(fileName) });
            await writeFile(parentConfig, define('fzccfzcz'));
            content = 'X:1\nT:Templates\nM:2/4\nL:1/8\nK:C\n"C"C {{rhythm}} DEF |]\n';
            await changeDocument({ document: openedDocument });
            assert.match(updated.content, /"C"C \[I:MIDI gchordon\] \[I:MIDI gchord fzccfzcz\] DEF/);
            assert.doesNotMatch(updated.content, /%%(?:end)?template|\{\{rhythm\}\}/);

            await writeFile(childConfig, define('fzzz'));
            await saveDocument(configDocument(childConfig));
            assert.match(updated.content, /\[I:MIDI gchord fzzz\]/);
            assert.doesNotMatch(updated.content, /fzccfzcz/);

            await writeFile(parentConfig, define('fcfc'));
            await rm(childConfig);
            await saveDocument(configDocument(parentConfig));
            assert.match(updated.content, /\[I:MIDI gchord fcfc\]/);

            content = content.replace('K:C', `${define('fzcz')}K:C`);
            await changeDocument({ document: openedDocument });
            assert.match(updated.content, /\[I:MIDI gchord fzcz\]/);
            assert.doesNotMatch(updated.content, /fcfc|%%(?:end)?template/);

            const renderedRevision = updated.revision;
            await saveDocument(configDocument(path.join(directory, 'unrelated', '.other.abcconfig')));
            await saveDocument(configDocument(path.join(path.dirname(directory), '.outside.abcconfig')));
            await saveDocument(openedDocument);
            assert.equal(updated.revision, renderedRevision);
        });
        await t.test('invalid template calls report an error instead of sending unexpanded ABC', async () => {
            const originalError = console.error;
            console.error = () => {};
            try {
                content = content.replace('{{rhythm}}', '{{missing}}');
                await changeDocument({ document: openedDocument });
                assert.equal(updated.command, 'preferenceError');
                assert.match(updated.message, /restored\.raw\.abc:\d+: Unknown template "missing"/);
                assert.match(errors.pop(), /ABC preview:.*Unknown template "missing"/);
            } finally { console.error = originalError; }
            content = content.replace('{{missing}}', '{{rhythm}}');
            await changeDocument({ document: openedDocument });
            assert.equal(updated.command, 'render');
        });
        vscode.window.activeTextEditor = { document: openedDocument };
        commands.get('vscode-abc-music-editor.showMusicsheet')();
        assert.equal(createdPanels, 0, 'the preview command reuses the restored panel');
        assert.equal(restored.revealed, true);
        restored.dispose();
        assert.deepEqual(errors, []);

        const originalError = console.error;
        console.error = () => {};
        try {
            for (const state of [undefined, {}, { documentId: 'file:///missing.abc' }]) {
                const invalid = makePanel();
                await serializer.deserializeWebviewPanel(invalid, state);
                assert.equal(invalid.disposed, true);
            }
        } finally { console.error = originalError; }
        assert.equal(errors.length, 3);
        assert.match(errors[0], /source file was not saved/);
        assert.match(errors[2], /Source file not found/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
