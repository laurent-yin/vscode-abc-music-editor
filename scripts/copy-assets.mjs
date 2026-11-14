import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const library = (await readdir(path.join(root, 'lib'), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.includes('.'))
    .map(entry => `lib/${entry.name}`);
const groups = [
    { destination: 'out/lib', sources: [...library, 'node_modules/lz-string/libs/lz-string.min.js', 'node_modules/abctools/dist/preferences.js', 'node_modules/abctools/dist/chordGrid.js'] },
    { destination: 'out/webview', sources: ['src/webview/webview.html', 'src/webview/package.json'] }
];
for (const { destination, sources } of groups) {
    const directory = path.join(root, destination);
    await mkdir(directory, { recursive: true });
    await Promise.all(sources.map(source => copyFile(path.join(root, source), path.join(directory, path.basename(source)))));
}
