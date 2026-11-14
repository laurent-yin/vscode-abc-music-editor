import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolvePreferences, resolveVoiceFilter, refreshFileVoices } from 'abctools/preferences';
import { sourceModel, createPlan, inventories } from '../out/webview/renderer.js';
import { captureGridSnapshot, chordGridFromSnapshot } from '../out/webview/chordGridModel.js';
import { layoutGridRows } from 'abctools/chord-grid';

const context = vm.createContext({ console });
for (const filename of ['abc2svg-1.js', 'snd-1.js', 'MIDI-1.js', 'fit2box-1.js']) {
    vm.runInContext(fs.readFileSync(new URL(`../lib/${filename}`, import.meta.url), 'utf8'), context);
}
globalThis.abc2svg = context.abc2svg;
const fixture = 'X:1\nT:Grid\nC:Composer\nM:2/4\nL:1/4\nV:lead name="Lead"\nV:low name="Bass"\nK:C\n[V:lead] "C/G" C D | "C/G" E F |\n"F" G A | "G7" B c |]\n[V:low] "Dm" C, D, | "Dm" E, F, |\n"Bb" G, A, | "A7" B, C |]\n';

function planFor(file = {}, defaults = {}, source = fixture, retainedAudio) {
    const choices = { display: { selectedVoiceIds: [], chords: true }, ...file };
    const effective = resolvePreferences({ version: 1, defaults, files: { 'fixture.abc': choices } }, 'fixture.abc');
    const original = sourceModel(source);
    const selections = inventories(original).map(tune => ({
        display: resolveVoiceFilter(effective.display, tune.voices),
        playback: resolveVoiceFilter(effective.playback, tune.voices)
    }));
    return createPlan(source, effective, original, selections, retainedAudio);
}
const chords = grid => grid.measures.map(measure => measure.chords.map(chord => chord.text));

test('only Chords activates a grid with first voice, never merges conflicting harmonies', () => {
    const plan = planFor();
    assert.equal(plan.grids[0].sourceId, 'lead');
    assert.deepEqual(chords(plan.grids[0]), [['C/G'], ['C/G'], ['F'], ['G7']]);
    assert.equal(plan.grids[0].measures[1].repeat, true);
    assert.equal(plan.grids[0].composer, 'Composer');
    assert.equal(plan.grids[0].meter, '2/4');
    const bass = planFor({ chordSourceVoiceId: 'low' });
    assert.deepEqual(chords(bass.grids[0]), [['Dm'], ['Dm'], ['Bb'], ['A7']]);
    assert.equal(planFor({ display: { selectedVoiceIds: ['lead'], chords: true } }).grids[0], undefined);
    assert.equal(planFor({ display: { selectedVoiceIds: [], chords: false } }).grids[0], undefined);
});

test('missing source and source without chords are explicit and never silently substituted', () => {
    const noChords = fixture.replaceAll(/"(?:Dm|Bb|A7)"/g, '');
    assert.match(planFor({ chordSourceVoiceId: 'low' }, {}, noChords).grids[0].message, /has no chords.*another source/);
    assert.match(planFor({ chordSourceVoiceId: 'missing' }).grids[0].message, /unavailable.*another source/);
    const updated = refreshFileVoices({ chordSourceVoiceId: 'removed' }, resolvePreferences({ version: 1 }, 'fixture.abc'), [{ id: 'lead' }]);
    assert.equal(updated.chordSourceVoiceId, undefined);
});

test('source instrument inherits file, voice override wins, song shift applied once, octave ignored harmonically', () => {
    const inherited = planFor({ notation: { instrumentKey: 'Bb' } });
    assert.equal(chords(inherited.grids[0])[0][0], 'D/A');
    const overridden = planFor({
        chordSourceVoiceId: 'low',
        notation: { instrumentKey: 'Bb', voices: { low: { instrumentKey: 'C', octaveShift: 1 } } },
        transposition: { semitones: 2 }
    });
    assert.equal(chords(overridden.grids[0])[0][0], 'Em');
    const audio = overridden.audio.tunes[0][1].find(voice => voice.id === 'low');
    assert.equal(audio.key.k_sf, 2, 'audio gets song shift, not the notation instrument');
});

test('grid snapshots retain source row breaks before engraving and support compact packing', () => {
    const measures = planFor().grids[0].measures;
    assert.deepEqual(layoutGridRows(measures, [100, 100, 100, 100], 600, 'source'), [[0, 1], [2, 3]]);
    assert.deepEqual(layoutGridRows(measures, [100, 100, 100, 100], 600, 'compact'), [[0, 1, 2, 3]]);
    assert.deepEqual(layoutGridRows(measures, [100, 100, 100, 100], 150, 'compact'), [[0], [1], [2], [3]]);
    assert.deepEqual(layoutGridRows(measures, [100, 100, 100, 100], 150, 'source'), [[0, 1], [2, 3]]);
});

test('continuations and breakoneoln affect parsed musical row boundaries', () => {
    const source = 'X:1\nM:2/4\nL:1/4\nK:C\n"C"CD|\\\n"F"EF|\n"G"GA|"C"Bc|]\n';
    const grid = planFor({}, {}, source).grids[0];
    assert.deepEqual(layoutGridRows(grid.measures, [100, 100, 100, 100], 600, 'source'), [[0, 1], [2, 3]]);
    const continuous = planFor({}, {}, '%%breakoneoln 0\n' + source).grids[0];
    assert.deepEqual(layoutGridRows(continuous.measures, [100, 100, 100, 100], 600, 'source'), [[0, 1, 2, 3]]);
});

test('parts, first/second endings, repeat bars, navigation and text survive extraction', () => {
    const source = 'X:1\nT:Structure\nM:2/4\nL:1/4\nK:C\nP:A\n!segno!"C"CD | "C"EF |\n"G7"GA |[1 "C"Bc :|[2 !fermata!"^Breque""C"c2 |]\nP:B\n!coda!"F"F2 |]\n';
    const grid = planFor({}, { chordGrid: { showTextInstructions: true } }, source).grids[0];
    const labels = grid.measures.flatMap(measure => measure.annotations.map(annotation => [annotation.kind, annotation.text]));
    assert.ok(labels.some(([kind, text]) => kind === 'part' && text === 'A'));
    assert.ok(labels.some(([kind, text]) => kind === 'part' && text === 'B'));
    assert.ok(labels.some(([kind, text]) => kind === 'ending' && text === '1.'));
    assert.ok(labels.some(([kind, text]) => kind === 'ending' && text === '2.'));
    assert.equal(labels.filter(([kind]) => kind === 'navigation').length, 2);
    assert.ok(labels.some(([, text]) => text === 'Breque'));
    assert.equal(grid.measures[3].barEnd, ':|');
    assert.equal(grid.measures[4].repeat, false, 'new ending must restate its harmony');
    assert.equal(grid.measures[4].sectionBreak, true);
});

test('anacrusis is omitted without truncating meter changes, multirests or dense harmony', () => {
    const source = 'X:1\nM:3/4\nL:1/8\nK:C\n"C"C | "Dm"D"E"E"F"F"G"G"A"A"B"B |\n[M:6/8]"C"Z2 | "N.C."z6 |]\n';
    const grid = planFor({}, { chordGrid: { repeatMeasures: false } }, source).grids[0];
    assert.equal(grid.measures.length, 4);
    assert.equal(grid.measures[0].start, 192);
    assert.equal(grid.measures[0].chords.length, 6);
    assert.equal(grid.measures[1].duration, 1152);
    assert.equal(grid.measures[2].duration, 1152);
    assert.equal(grid.measures[2].chords[0].text, 'C');
    assert.equal(grid.measures[3].chords[0].text, 'N.C.');
    assert.ok(grid.measures[1].annotations.some(annotation => annotation.kind === 'meter' && annotation.text === '6/8'));
    assert.ok(grid.notices.some(notice => notice.includes('multi-measure rest')));
});

test('empty opening measures have no invented chord; inherited harmonies can repeat', () => {
    const source = 'X:1\nM:2/4\nL:1/4\nK:C\nz2 | "C"CD | EF | "C"GA |]\n';
    const measures = planFor().grids[0].measures;
    const inherited = planFor({}, {}, source).grids[0].measures;
    assert.deepEqual(inherited[0].chords, []);
    assert.equal(inherited[0].repeat, false);
    assert.equal(inherited[2].chords[0].text, 'C');
    assert.equal(inherited[2].repeat, true);
    assert.equal(inherited[3].repeat, true);
    assert.equal(measures[0].repeat, false);
});

test('repetition compares rhythmic positions and retains annotations', () => {
    const source = 'X:1\nM:2/4\nL:1/8\nK:C\n"C"C2"G"G2 | "C"C"G"G3 | "^same""C"C"G"G3 |]\n';
    const measures = planFor({}, { chordGrid: { showTextInstructions: true } }, source).grids[0].measures;
    assert.equal(measures[1].repeat, false);
    assert.equal(measures[2].repeat, true);
    assert.ok(measures[2].annotations.some(annotation => annotation.text === 'same'));
    assert.ok(planFor({}, { chordGrid: { repeatMeasures: false } }, source).grids[0].measures.every(measure => !measure.repeat));
});

test('grid changes retain canonical audio and selections cover complete measures across sources', () => {
    const original = planFor();
    const retained = original.audio;
    const grid = original.grids[0];
    const firstIds = grid.measures[0].sourceIds;
    const secondIds = grid.measures[1].sourceIds;
    assert.ok(firstIds.length >= 4);
    const range = original.gridSelection(firstIds[0], secondIds[0]);
    assert.ok(range);
    const symbolAt = id => retained.tunes[0][1].flatMap(voice => {
        const result = [];
        for (let symbol = voice.sym; symbol; symbol = symbol.next) result.push(symbol);
        return result;
    }).find(symbol => symbol.istart === id);
    assert.equal(symbolAt(range.start).time, 0);
    assert.equal(symbolAt(range.end).time, 1152);
    const next = planFor({ chordSourceVoiceId: 'low' }, { chordGrid: { layout: 'compact' } }, fixture, retained);
    assert.equal(next.audio, retained);
    assert.deepEqual(next.grids[0].measures[0].sourceIds, firstIds);
    assert.equal(next.grids[0].measures[0].chords[0].text, 'Dm');
});

test('multi-tune grids are independent and missing saved IDs do not change source', () => {
    const source = fixture + '\nX:2\nT:Other\nM:3/4\nL:1/4\nV:other\nK:F\n"F"F3 |]\n';
    const defaultPlan = planFor({}, {}, source);
    assert.equal(defaultPlan.grids[0].sourceId, 'lead');
    assert.equal(defaultPlan.grids[1].sourceId, 'other');
    const explicit = planFor({ chordSourceVoiceId: 'low' }, {}, source);
    assert.equal(explicit.grids[0].sourceId, 'low');
    assert.match(explicit.grids[1].message, /unavailable/);
});

test('fit2box is excluded from grid geometry; internal ornament names never become annotations', () => {
    const fitted = planFor({}, {}, '%%fit2box * *\n' + fixture);
    assert.deepEqual(chords(fitted.grids[0]), chords(planFor().grids[0]));
    const snapshot = captureGridSnapshot([{
        id: 'lead', key: { k_sf: 0 }, meter: { a_meter: [{ top: '2', bot: '4' }], wmeasure: 768 },
        sym: { type: 8, time: 0, dur: 768, a_gch: [{ type: 'g', text: 'C' }], a_dd: [{ name: 'custom-mark' }] }
    }], { T: 'Unknown' });
    const grid = chordGridFromSnapshot(snapshot, undefined, true);
    assert.deepEqual(grid.notices, []);
    assert.ok(!grid.measures[0].annotations.some(annotation => annotation.text.includes('custom-mark')));
});

test('text instructions are hidden by default; enabling them never restores fermatas or ornaments', () => {
    const source = 'X:1\nT:Ornaments\nM:2/4\nL:1/4\nK:C\n!fermata!"G"C D | !uppermordent!"D7"E F |\n!trill!"G""^a tempo"G A | !segno!"C"B c |]\n';
    const hidden = planFor({}, {}, source).grids[0];
    assert.ok(!hidden.measures.flatMap(measure => measure.annotations).some(annotation => annotation.kind === 'text'));
    const grid = planFor({}, { chordGrid: { showTextInstructions: true } }, source).grids[0];
    const annotations = grid.measures.flatMap(measure => measure.annotations);
    assert.ok(annotations.some(annotation => annotation.text === 'a tempo'));
    assert.equal(annotations.filter(annotation => annotation.kind === 'navigation').length, 1);
    assert.ok(!annotations.some(annotation => /mordent|trill|\[|\]|\u{1d110}/u.test(annotation.text)));
});

test('every part pickup is omitted, preserving part labels, incomplete endings and canonical playback', () => {
    const source = 'X:1\nT:Pickups\nM:2/4\nL:1/8\nK:C\nP:A\n"G"G | "C"C4 | "D7"D3 |]\nP:B\n"G"G | "Em"E4 | "B7"B3 |]\nP:C\nz | "Am"A4 |]\nP:D\n"F"F4 |]\n';
    const plan = planFor({}, {}, source);
    const measures = plan.grids[0].measures;
    assert.equal(measures.length, 6);
    assert.ok(measures.every(measure => !measure.pickup && measure.sourceIds.length));
    assert.deepEqual(measures.map(measure => measure.chords[0].text), ['C', 'D7', 'Em', 'B7', 'Am', 'F']);
    assert.deepEqual(measures.map(measure => measure.start), [192, 960, 1728, 2496, 3264, 4032]);
    assert.deepEqual(measures.flatMap(measure => measure.annotations.filter(annotation => annotation.kind === 'part').map(annotation => annotation.text)), ['A', 'B', 'C', 'D']);
    assert.deepEqual(measures[1].chords.map(chord => chord.text), ['D7'], 'incomplete ending is not a pickup');
    assert.deepEqual(measures[3].chords.map(chord => chord.text), ['B7']);
    assert.deepEqual(measures[5].chords.map(chord => chord.text), ['F'], 'full part start is unchanged');
    const audioChords = [];
    for (let symbol = plan.audio.tunes[0][1][0].sym; symbol; symbol = symbol.next) {
        if (symbol.a_gch?.some(chord => chord.type === 'g')) audioChords.push(String(symbol.a_gch.find(chord => chord.type === 'g').text));
    }
    assert.equal(audioChords.filter(chord => chord === 'G').length, 2, 'authored pickup harmony stays in the audio model');
    const range = plan.gridSelection(measures[0].sourceIds[0], measures[0].sourceIds.at(-1));
    assert.ok(range);
    const timed = [];
    for (let symbol = plan.audio.tunes[0][1][0].sym; symbol; symbol = symbol.next) {
        if (symbol.dur && [range.start, range.end].includes(symbol.istart)) timed.push(symbol.time);
    }
    assert.ok(timed.length && timed.every(time => time >= measures[0].start), 'grid playback selection does not start on the omitted pickup');
});

test('pickup detection uses the current meter and parts declared on another voice', () => {
    const source = 'X:1\nM:2/4\nL:1/8\nV:lead\nV:low\nK:C\nP:A\n[V:lead] "C"C4 | "G"G4 |]\n[V:low] "C"C,4 | "G"G,4 |]\nP:B\n[V:lead] [M:3/4]"D"D2 | "Em"E6 |]\n[V:low] [M:3/4]"D"D,2 | "Em"E,6 |]\n';
    const grid = planFor({ chordSourceVoiceId: 'low' }, {}, source).grids[0];
    assert.equal(grid.measures[0].pickup, false);
    assert.equal(grid.measures.length, 3);
    assert.ok(grid.measures.every(measure => !measure.pickup));
    assert.equal(grid.measures[2].duration, 1152);
    assert.ok(grid.measures[2].annotations.some(annotation => annotation.kind === 'part' && annotation.text === 'B'));
    assert.deepEqual(grid.measures[2].chords.map(chord => chord.text), ['Em']);
    assert.ok(grid.measures[2].annotations.some(annotation => annotation.kind === 'meter' && annotation.text === '3/4'));
});
