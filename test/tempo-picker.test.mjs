import test from 'node:test';
import assert from 'node:assert/strict';
import { tempoChoices, steppedTempo } from '../out/webview/tempoPicker.js';

test('tempo choices are centered on the current value without limiting the allowed BPM', () => {
    for (const current of [51, 120, 100000]) {
        const choices = tempoChoices(current);
        assert.equal(choices.length, 101);
        assert.equal(choices[50], current);
        assert.equal(choices[0], current - 50);
        assert.equal(choices.at(-1), current + 50);
    }
    assert.deepEqual(tempoChoices(1), Array.from({ length: 51 }, (_, index) => index + 1));
    assert.ok(tempoChoices(Number.MAX_VALUE).every(value => Number.isFinite(value) && value >= 1));
    assert.throws(() => tempoChoices(0), /whole number/);
});
test('stepping from original uses its BPM rather than zero, and respects the minimum', () => {
    assert.equal(steppedTempo(undefined, 120, 1), 121);
    assert.equal(steppedTempo(undefined, 120, -1), 119);
    assert.equal(steppedTempo(90, 120, 1), 91);
    assert.equal(steppedTempo(90, 120, -1), 89);
    assert.equal(steppedTempo(undefined, 1, -1), 1);
    assert.equal(steppedTempo(1, 120, -1), 1);
    assert.equal(steppedTempo(100000, 120, 1), 100001);
    assert.throws(() => steppedTempo(0, 120, 1), /whole number/);
});
