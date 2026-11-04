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
test('per-file tempo persists alongside other preferences and can be reset independently', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'abc-tempo-'));
    try {
        const store = new PreferenceStore(path.join(directory, 'preferences.json'));
        const empty = await store.read();
        await store.write({ version: 1, files: { 'fixture.abc': { tempo: 1, transposition: { semitones: 2 } } } }, empty.revision);
        const saved = await store.read();
        assert.equal(saved.value.files['fixture.abc'].tempo, 1);
        saved.value.files['fixture.abc'].tempo = 100000;
        await store.write(saved.value, saved.revision);
        const high = await store.read();
        assert.equal(high.value.files['fixture.abc'].tempo, 100000);
        await assert.rejects(store.write({ version: 1, files: { 'fixture.abc': { tempo: 0 } } }, high.revision), /whole number/);
        delete high.value.files['fixture.abc'].tempo;
        await store.write(high.value, high.revision);
        const cleared = await store.read();
        assert.equal(cleared.value.files['fixture.abc'].tempo, undefined);
        assert.equal(cleared.value.files['fixture.abc'].transposition.semitones, 2);
    } finally { await rm(directory, { recursive: true }); }
});
