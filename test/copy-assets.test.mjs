import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('build preserves every bundled library and webview asset byte for byte', async () => {
    const root = new URL('../', import.meta.url);
    const library = (await readdir(new URL('lib/', root), { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.includes('.'))
        .map(entry => [`lib/${entry.name}`, `out/lib/${entry.name}`]);
    const assets = [
        ...library,
        ['node_modules/lz-string/libs/lz-string.min.js', 'out/lib/lz-string.min.js'],
        ['node_modules/abctools/dist/preferences.js', 'out/lib/preferences.js'],
        ['src/webview/webview.html', 'out/webview/webview.html'],
        ['src/webview/package.json', 'out/webview/package.json']
    ];
    await Promise.all(assets.map(async ([source, destination]) => {
        assert.deepEqual(await readFile(new URL(destination, root)), await readFile(new URL(source, root)), destination);
    }));
});
