import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChoices, validatePreferences, parsePreferences, serializePreferences, resolvePreferences, refreshFileVoices } from 'abctools/preferences';

test('tempo accepts positive whole-number BPM without an application upper bound', () => {
    for (const tempo of [1, 120, 1000, 1000000, Number.MAX_SAFE_INTEGER]) {
        assert.equal(validateChoices({ tempo }).tempo, tempo);
    }
    for (const tempo of [0, -1, 1.5, NaN, Infinity, -Infinity, '120', null]) {
        assert.throws(() => validateChoices({ tempo }), /whole number/);
    }
    assert.equal(validateChoices({ tempo: undefined }).tempo, undefined);
    assert.throws(() => validateChoices({ tempo: 90 }, false), /Unknown preference/);
    assert.throws(() => validateChoices({ typo: true, tempo: 90 }), /Unknown preference/);
    assert.throws(() => validatePreferences({ version: 1, defaults: { tempo: 90 } }), /Unknown preference/);
    assert.throws(() => validatePreferences({ version: 1, files: { '../bad.abc': { tempo: 90 } } }), /Invalid library-relative/);
});
test('tempo is resolved per file, survives voice refresh and serializes without losing other choices', () => {
    const value = {
        version: 1, defaults: { notation: { instrumentKey: 'Bb' } },
        files: { 'fixture.abc': { tempo: 75, transposition: { semitones: 2 }, playback: { selectedVoiceIds: ['lead'], knownVoiceIds: ['lead', 'removed'] } } }
    };
    const before = structuredClone(value);
    const loaded = parsePreferences(serializePreferences(value));
    assert.deepEqual(loaded, value);
    const effective = resolvePreferences(loaded, 'fixture.abc');
    assert.equal(effective.tempo, 75);
    assert.equal(effective.notation.instrumentKey, 'Bb');
    assert.equal(effective.transposition.semitones, 2);
    assert.equal(resolvePreferences(loaded, 'other.abc').tempo, undefined);
    const refreshed = refreshFileVoices(loaded.files['fixture.abc'], effective, [{ id: 'lead' }]);
    assert.equal(refreshed.tempo, 75);
    assert.deepEqual(refreshed.playback.knownVoiceIds, ['lead']);
    delete refreshed.tempo;
    loaded.files['fixture.abc'] = refreshed;
    assert.equal(resolvePreferences(parsePreferences(serializePreferences(loaded)), 'fixture.abc').tempo, undefined);
    assert.deepEqual(value, before, 'resolution and serialization must not mutate saved preferences');
    for (const invalid of [{ version: 99 }, { version: 1, files: [] }, { version: 1, files: { 'a.abc': null } }, { version: 1, unexpected: true }]) {
        assert.throws(() => validatePreferences(invalid));
    }
});
