import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePreferences } from 'abctools/preferences';
import { canRetainPlayback, installVoiceMixer, VoiceMixer } from '../out/webview/playback.js';

function audioPlayback(mixer, noteRun = () => {}) {
    const gates = [];
    const ac = {
        currentTime: 10,
        createGain() {
            const gate = {
                context: ac, connected: true,
                gain: { value: 1, setTargetAtTime(value, time, smoothing) {
                    this.value = value;
                    this.lastUpdate = { time, smoothing };
                } },
                connect(destination) { this.destination = destination; },
                disconnect() { this.connected = false; }
            };
            gates.push(gate);
            return gate;
        }
    };
    const playback = { conf: { voiceMixer: mixer }, ac, gain: {}, v_c: [], c_i: [], onend() {}, note_run: noteRun };
    return { playback, gates };
}
test('only compatible preferences retain the current canonical playback', () => {
    const message = {
        documentId: 'fixture.abc', resourceKey: 'fixture.abc', content: 'X:1\nK:C\nC D |',
        preferences: resolvePreferences({ version: 1 }, 'fixture.abc')
    };
    const next = structuredClone(message);
    next.preferences.display.selectedVoiceIds = [];
    next.preferences.playback.selectedVoiceIds = [];
    next.preferences.playback.chords = false;
    next.preferences.tempo = 60;
    next.preferences.notation.instrumentKey = 'Bb';
    assert.equal(canRetainPlayback(message, next, {}), true);
    for (const change of [
        { content: message.content + 'E F |' }, { documentId: 'other.abc' }, { resourceKey: 'other.abc' },
        { preferences: { ...next.preferences, transposition: { semitones: 2 } } }
    ]) assert.equal(canRetainPlayback(message, { ...next, ...change }, {}), false);
    assert.equal(canRetainPlayback(undefined, next, {}), false);
    assert.equal(canRetainPlayback(message, next, undefined), false);
    assert.equal(canRetainPlayback(message, next, { fallback: true }), false);
});
test('live WebAudio gates mute/unmute sustained and already scheduled notes without touching note data or the clock', () => {
    const lead = { id: 'lead' }, low = { id: 'low' };
    const mixer = new VoiceMixer();
    mixer.update(new Map([[lead, true], [low, false]]));
    const events = [];
    const { playback, gates } = audioPlayback(mixer, (po, symbol, key, time, duration) => {
        events.push({ gate: po.gain, symbol, key, time, duration });
    });
    const master = playback.gain;
    const engine = { play_next(po) {
        for (const [voice, time, duration] of [[lead, 10, 4], [low, 10, 4], [low, 12, 1]]) {
            po.note_run(po, { p_v: voice, notes: [{ noplay: true }] }, 60, time, duration);
        }
    } };
    installVoiceMixer(engine);
    engine.play_next(playback);
    assert.equal(gates.length, 2);
    assert.equal(events.length, 3, 'muted notes must still be synthesized for seamless re-entry');
    assert.equal(events[1].gate, events[2].gate);
    assert.equal(events[0].gate.destination, master);
    assert.equal(playback.gain, master);
    assert.deepEqual(gates.map(gate => gate.gain.value), [1, 0]);
    mixer.update(new Map([[lead, false], [low, true]]));
    assert.deepEqual(gates.map(gate => gate.gain.value), [0, 1]);
    assert.equal(events[1].gate.gain.value, 1, 'both sustained and future notes use the live gate');
    assert.deepEqual(events.map(event => [event.time, event.duration]), [[10, 4], [10, 4], [12, 1]]);
    assert.ok(events.every(event => event.symbol.notes[0].noplay), 'authored note flags are untouched');
    assert.deepEqual(gates[0].gain.lastUpdate, { time: 10, smoothing: 0.005 });
    const wrapped = playback.note_run;
    engine.play_next(playback);
    assert.equal(playback.note_run, wrapped, 'the scheduler is adapted only once per play session');
    assert.equal(gates.length, 2);
    mixer.clear();
    assert.ok(gates.every(gate => !gate.connected));
});
test('scheduler adapter leaves other consumers unchanged and restores routing after errors', () => {
    const engine = { play_next(po) { po.note_run(po, { p_v: { id: 'lead' } }, 60, 10, 1); } };
    installVoiceMixer(engine);
    let calls = 0;
    const untouched = { conf: {}, note_run() { calls++; } };
    engine.play_next(untouched);
    assert.equal(calls, 1);
    const { playback } = audioPlayback(new VoiceMixer(), () => { throw new Error('synthesis failure'); });
    const master = playback.gain;
    assert.throws(() => engine.play_next(playback), /synthesis failure/);
    assert.equal(playback.gain, master);
});
test('playback end callbacks are isolated from stale timers, and stop disconnects live gates', () => {
    const mixer = new VoiceMixer();
    const { playback, gates } = audioPlayback(mixer);
    let ended = 0;
    playback.onend = () => ended++;
    mixer.attach(playback);
    playback.note_run(playback, { p_v: { id: 'lead' } }, 60, 10, 1);
    playback.stop = true;
    playback.onend(2);
    playback.onend(2);
    assert.equal(ended, 1);
    assert.equal(gates[0].connected, false);
});
test('MIDI gates cancel pending onsets, silence sustained notes and rejoin at the current position', t => {
    let now = 0;
    let id = 0;
    const timers = new Map();
    t.mock.method(performance, 'now', () => now * 1000);
    t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
        timers.set(++id, { callback, at: now + delay / 1000 });
        return id;
    });
    t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
    const advance = time => {
        now = time;
        for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    };
    const voice = { id: 'lead' };
    const mixer = new VoiceMixer();
    const events = [], stops = [];
    const playback = {
        conf: { voiceMixer: mixer }, v_c: [2], c_i: [0, 0, 10],
        op: { send(bytes) { stops.push(bytes); } }, onend() {},
        note_run(po, _symbol, _key, time, duration) { events.push({ channel: po.v_c[0], time, duration }); }
    };
    mixer.attach(playback);
    mixer.update(new Map([[voice, true]]));
    playback.note_run(playback, { p_v: voice, v: 0 }, 60, 1, 4);
    playback.note_run(playback, { p_v: voice, v: 0 }, 62, 3, 4);
    playback.v_c[0] = 4;
    assert.equal(events.length, 0);
    advance(1);
    assert.deepEqual(events, [{ channel: 2, time: 1, duration: 4 }]);
    advance(2);
    mixer.update(new Map([[voice, false]]));
    assert.deepEqual(stops, [[0x82, 60, 0]]);
    advance(3);
    assert.equal(events.length, 1, 'the queued note stays muted at its onset');
    advance(4);
    mixer.update(new Map([[voice, true]]));
    assert.deepEqual(events.slice(1), [{ channel: 2, time: 4, duration: 1 }, { channel: 2, time: 4, duration: 3 }]);
    mixer.clear();
    assert.equal(timers.size, 0);
    assert.deepEqual(stops.slice(1), [[0x82, 60, 0], [0x82, 62, 0]]);
});
