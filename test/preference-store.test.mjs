import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PreferenceStore } from '../out/extension/preferenceStore.js';

test('atomic personal store round trips, detects concurrent writes and reports malformed input', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'abc-preferences-'));
    try {
        const filename = path.join(directory, 'settings', 'preferences.json');
        const store = new PreferenceStore(filename);
        const empty = await store.read();
        assert.equal(empty.revision, 'missing');
        await store.write({ version: 1, defaults: { notation: { instrumentKey: 'Bb' } } }, empty.revision);
        const loaded = await store.read();
        assert.equal(loaded.value.defaults.notation.instrumentKey, 'Bb');
        await assert.rejects(store.write({ version: 1 }, empty.revision), /another window/);
        assert.equal(JSON.parse(await readFile(filename, 'utf8')).defaults.notation.instrumentKey, 'Bb');
        await chmod(filename, 0o400);
        await assert.rejects(store.write({ version: 1 }, loaded.revision), /read-only/);
        await chmod(filename, 0o600);
        await writeFile(`${filename}.lock`, '');
        await assert.rejects(store.write({ version: 1 }, loaded.revision), /EEXIST/);
        await rm(`${filename}.lock`);
        await writeFile(filename, '{"version":99}');
        await assert.rejects(store.read(), /Unsupported/);
    } finally { await rm(directory, { recursive: true }); }
});
