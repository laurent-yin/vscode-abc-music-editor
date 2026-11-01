import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolvePreferences, resolveVoiceFilter } from 'abctools/preferences';
import { sourceModel, createPlan, inventories, maskAudio, shiftInterval, compactKeyLabel } from '../out/webview/renderer.js';

const context = vm.createContext({ console });
for (const filename of ['abc2svg-1.js', 'snd-1.js', 'fit2box-1.js', 'MIDI-1.js']) {
    vm.runInContext(fs.readFileSync(new URL(`../lib/${filename}`, import.meta.url), 'utf8'), context);
}
globalThis.abc2svg = context.abc2svg;
const fixture = 'X:1\nT:Fixture\nM:2/4\nL:1/4\nV:lead name="Melodia"\nV:low name="Baixaria"\nK:C\n[V:lead] "C/G" C D | E F |]\n[V:low] C, D, | E, F, |]\n';
function planFor(choices = {}, source = fixture) {
    const effective = resolvePreferences({ version: 1, files: { 'fixture.abc': choices } }, 'fixture.abc');
    const original = sourceModel(source);
    const selections = inventories(original).map(tune => ({
        display: resolveVoiceFilter(effective.display, tune.voices),
        playback: resolveVoiceFilter(effective.playback, tune.voices)
    }));
    return createPlan(source, effective, original, selections);
}
function render(plan) {
    let svg = '';
    const models = [];
    const model = new context.abc2svg.Abc({
        img_out(text) { svg += text; },
        errmsg(message) { throw new Error(message); },
        get_abcmodel(first, voices, _names, info) {
            const index = plan.audio.tunes.findIndex(tune => tune[2].X === info.X);
            plan.prepareDisplay(model, voices, index);
            models[index] = voices;
        },
        anno_stop(type) {
            if (type === 'note') model.out_svg('<g data-music="true"></g>');
        }
    });
    model.tosvg('fixture', plan.content);
    return { svg, models, musicSystems: (svg.match(/<svg\b[\s\S]*?<\/svg>/g) ?? []).filter(block => /class="slW"|href="#stdef/.test(block)).length };
}
function notes(voice) {
    const result = [];
    for (let symbol = voice.sym; symbol; symbol = symbol.next) if (symbol.notes) result.push(...symbol.notes);
    return result;
}
test('source discovery precedes authored score selectors; names and all voices survive', () => {
    const source = fixture.replace('K:C', '%%score lead\nK:C');
    const plan = planFor({ display: { voiceIdFilter: ['low'] }, playback: { voiceIdFilter: ['lead'] } }, source);
    assert.deepEqual(inventories(plan.audio)[0].voices.map(voice => voice.id), ['lead', 'low']);
    assert.equal(plan.inventories[0].voices[0].name, 'Melodia');
    const rendered = render(plan);
    assert.ok(rendered.svg.includes('<svg'));
    assert.ok(rendered.models[0].find(voice => voice.id === 'low').sym);
});
test('all 16 two-voice display/play combinations preserve canonical music and mask notes only', () => {
    const filters = [[], ['lead'], ['low'], ['lead', 'low']];
    for (const display of filters) for (const playback of filters) {
        const plan = planFor({ display: { voiceIdFilter: display }, playback: { voiceIdFilter: playback } });
        render(plan);
        const tune = plan.audio.tunes[0];
        context.ToAudio().add(tune[0], tune[1], tune[3]);
        const before = Array.from(tune[1]).filter(voice => !voice.id.startsWith('_')).map(voice => notes(voice).map(note => note.midi));
        maskAudio(plan.audio.tunes, plan.selections, false);
        assert.deepEqual(before, [[60, 62, 64, 65], [48, 50, 52, 53]]);
        for (const voice of tune[1].filter(voice => !voice.id.startsWith('_'))) {
            assert.equal(notes(voice).every(note => Boolean(note.noplay)), playback.length > 0 && !playback.includes(voice.id));
        }
    }
});
test('mixed Bb/C notation preserves audio, keys and per-context slash chords', () => {
    const plan = planFor({ notation: { instrumentKey: 'C', voices: { lead: { instrumentKey: 'Bb' } } } });
    const rendered = render(plan);
    const voices = rendered.models[0];
    assert.equal(voices.find(voice => voice.id === 'lead').key.k_sf, 2);
    assert.equal(voices.find(voice => voice.id === 'low').key.k_sf, 0);
    assert.match(rendered.svg, />D\/A</);
    assert.match(rendered.svg, />C\/G</);
    const tune = plan.audio.tunes[0];
    context.ToAudio().add(tune[0], tune[1], tune[3]);
    assert.deepEqual(notes(tune[1][0]).map(note => note.midi), [60, 62, 64, 65]);
});
test('positive/negative song shifts affect every voice independently of written views', () => {
    for (const shift of [-2, 0, 2, 10]) {
        const plan = planFor({ notation: { instrumentKey: 'Bb' }, transposition: { semitones: shift } });
        render(plan);
        const tune = plan.audio.tunes[0];
        context.ToAudio().add(tune[0], tune[1], tune[3]);
        assert.deepEqual(notes(tune[1][0]).map(note => note.midi), [60, 62, 64, 65].map(note => note + shift));
        assert.deepEqual(notes(tune[1][1]).map(note => note.midi), [48, 50, 52, 53].map(note => note + shift));
    }
    assert.equal(shiftInterval(-2), 'c_B');
    assert.equal(shiftInterval(10), 'c_b');
});
test('single-voice view inherits hidden harmony; combined equal views deduplicate', () => {
    const solo = render(planFor({ display: { voiceIdFilter: ['low'] } }));
    assert.match(solo.svg, />C\/G</);
    const combined = render(planFor());
    assert.equal((combined.svg.match(/>C\/G</g) ?? []).length, 1);
    const conflicting = planFor({}, fixture.replace('[V:low] C,', '[V:low] "Dm" C,'));
    assert.throws(() => render(conflicting), /Different authored harmonies/);
});
test('display chord checkbox hides chord labels without changing canonical harmony or audio', () => {
    const plan = planFor({ display: { selectedVoiceIds: ['low'], chords: false } }, '%%MIDI gchordon\n' + fixture);
    const rendered = render(plan);
    assert.doesNotMatch(rendered.svg, />C\/G</);
    const tune = plan.audio.tunes[0];
    context.ToAudio().add(tune[0], tune[1], tune[3]);
    assert.ok(tune[1].find(voice => voice.id === '_chord'));
    maskAudio(plan.audio.tunes, plan.selections, true);
    assert.ok(notes(tune[1].find(voice => voice.id === '_chord')).every(note => !note.noplay));
});
test('explicit empty playback selection mutes all authored voices independently of chords', () => {
    const plan = planFor({ playback: { selectedVoiceIds: [], chords: false } }, '%%MIDI gchordon\n' + fixture);
    const tune = plan.audio.tunes[0];
    context.ToAudio().add(tune[0], tune[1], tune[3]);
    maskAudio(plan.audio.tunes, plan.selections, false);
    for (const voice of tune[1]) assert.ok(notes(voice).every(note => Boolean(note.noplay)));
});
test('implicit single voice and multi-tune inventories work', () => {
    const source = 'X:1\nT:One\nM:2/4\nL:1/4\nK:C\nC D|]\n\nX:2\nT:Two\nM:2/4\nL:1/4\nK:Am\nA B|]\n';
    const plan = planFor({}, source);
    assert.equal(plan.inventories.length, 2);
    assert.equal(plan.inventories[0].voices.length, 1);
    assert.equal(plan.inventories[1].key, 'A minor');
    assert.equal(render(plan).models.length, 2);
    const repeatedHeaders = planFor({}, source.replace('X:2\nT:Two', 'X:1\nT:One'));
    assert.equal(render(repeatedHeaders).models.length, 2);
    assert.deepEqual(repeatedHeaders.audio.tunes.map(tune => tune[2].X), ['1', '2']);
});
test('first initial sounding key follows song shift, not notation or later key changes', () => {
    const source = 'X:1\nT:First\nM:2/4\nL:1/4\nK:Gm\nG A |\nK:D\nD E |]\n\nX:2\nT:Second\nM:2/4\nL:1/4\nK:C\nC D |]\n';
    for (const [shift, expected] of [[-2, 'Fm'], [0, 'Gm'], [2, 'Am']]) {
        const plan = planFor({ notation: { instrumentKey: 'Bb' }, transposition: { semitones: shift } }, source);
        assert.equal(compactKeyLabel(plan.inventories[0].key), expected);
        assert.notEqual(plan.inventories[0].key, plan.inventories[1].key);
    }
    assert.equal(compactKeyLabel(planFor({ transposition: { semitones: -2 } }, fixture).inventories[0].key), 'Bb');
    assert.equal(compactKeyLabel('D dorian'), 'D dorian');
    assert.equal(compactKeyLabel(planFor({}, source.replace('K:Gm', 'K:none')).inventories[0].key), 'No key');
});
test('fit2box keeps inventory unique and maps display symbols to canonical audio', () => {
    const plan = planFor({}, `%%fit2box * *\n%%pagescale 1\n${fixture}`);
    const rendered = render(plan);
    assert.equal(plan.inventories[0].voices.length, 2);
    assert.ok(rendered.svg.includes('<svg'));
    const voice = rendered.models[0].find(item => item.id === 'lead');
    const note = [...function* () { for (let s = voice.sym; s; s = s.next) if (s.notes) yield s; }()][0];
    assert.equal(plan.symbolFor(note, 0).time, note.time);
});
test('grace-note mapping preserves distinct same-time occurrences after fitting and voice filtering', () => {
    const source = fixture.replace('C D | E F', '{GAB}C D | E F');
    const plan = planFor({ display: { voiceIdFilter: ['lead'] }, playback: { voiceIdFilter: ['low'] } }, `%%fit2box * *\n%%pagescale 1\n${source}`);
    const rendered = render(plan);
    const voice = rendered.models[0].find(item => item.id === 'lead');
    const mapped = [];
    for (let symbol = voice.sym; symbol; symbol = symbol.next) {
        for (let grace = symbol.extra; grace; grace = grace.next) {
            const canonical = plan.symbolFor(grace, 0);
            assert.ok(canonical, 'every rendered grace has a canonical audio symbol');
            assert.equal(canonical.notes[0].pit, grace.notes[0].pit);
            mapped.push(canonical);
        }
    }
    assert.equal(mapped.length, 3);
    assert.equal(new Set(mapped).size, 3);
    assert.equal(new Set(mapped.map(symbol => symbol.istart)).size, 3);
});
test('reject unsupported source transforms and complex layout explicitly', () => {
    assert.throws(() => planFor({ notation: { instrumentKey: 'Bb' } }, fixture.replace('V:lead name=', 'V:lead transpose=-2 name=')), /source pitch basis/);
    assert.throws(() => planFor({}, fixture.replace('K:C', '%%score [lead low]\nK:C')), /Grouped or changing/);
    assert.throws(() => planFor({}, 'X:1\nT:Overlay\nM:2/4\nL:1/4\nK:C\nC D & E F |]\n'), /Voice overlays/);
});

function scheduled(plan, chords = true) {
    const tune = plan.audio.tunes[0];
    context.ToAudio().add(tune[0], tune[1], tune[3]);
    maskAudio(plan.audio.tunes, plan.selections, chords);
    const events = [];
    const timers = [];
    let ended = false;
    let calls = 0;
    const onnote = () => {};
    const onend = () => { ended = true; };
    context.setTimeout = (fn, _delay, ...args) => {
        if (++calls > 100000) throw new Error('Scheduler exceeded timer budget');
        if (fn === onend) ended = true;
        else if (fn !== onnote) timers.push(() => fn(...args));
        return calls;
    };
    context.clearTimeout = () => {};
    const po = {
        s_cur: tune[0], s_end: null, conf: { speed: 1 }, tgen: 100000,
        get_time: () => 0, v_c: [], c_i: [],
        midi_ctrl() {}, midi_prog() {}, onnote, onend,
        note_run(_po, symbol, midi, time, duration) {
            events.push({ id: symbol.p_v.id, midi, time, duration });
        }
    };
    context.abc2svg.play_next(po);
    while (timers.length && !ended) timers.shift()();
    assert.equal(ended, true);
    return events;
}
test('shared MIDI/WebAudio scheduler preserves repeats/ties/tuplets/graces and chord timing under masks', () => {
    const source = '%%MIDI gchordon\nX:1\nT:Navigation\nM:2/4\nL:1/8\nP:AABB\nV:lead\nV:low\nK:C\nP:A\n[V:lead] "C" {G}C2- C2 |]\n[V:low] C,2 E,2 |]\nP:B\n[V:lead] "G7" (3DEF G2 |]\n[V:low] G,2 B,2 |]\n';
    const baseline = scheduled(planFor({}, source));
    assert.ok(baseline.some(event => event.id === '_chord'));
    const shifted = scheduled(planFor({ notation: { instrumentKey: 'Bb' }, transposition: { semitones: 2 } }, source));
    assert.deepEqual(shifted, baseline.map(event => ({ ...event, midi: event.midi + 2 })));
    for (const selected of [[], ['lead'], ['low'], ['lead', 'low']]) {
        for (const chords of [true, false]) {
            const actual = scheduled(planFor({ playback: { voiceIdFilter: selected } }, source), chords);
            const expected = baseline.filter(event => event.id === '_chord' ? chords : !selected.length || selected.includes(event.id));
            assert.deepEqual(actual, expected);
        }
    }
});
test('source IDs may be arbitrary Unicode names, independent of duplicate labels', () => {
    const source = fixture.replaceAll('lead', 'alto.1').replaceAll('low', 'baixo-ç').replace('Baixaria', 'Melodia');
    const plan = planFor({ display: { voiceIdRegexFilter: ['Ç$'] } }, source);
    assert.deepEqual(plan.selections[0].display.ids, ['baixo-ç']);
    assert.ok(render(plan).svg.includes('<svg'));
});
test('song transposition and mixed notation retain keys through fit2box', () => {
    const plan = planFor({ notation: { instrumentKey: 'C', voices: { lead: { instrumentKey: 'Bb' } } }, transposition: { semitones: 2 } }, `%%fit2box * *\n%%pagescale 1\n${fixture}`);
    const rendered = render(plan);
    assert.equal(rendered.models[0].find(voice => voice.id === 'lead').key.k_sf, 4);
    assert.equal(rendered.models[0].find(voice => voice.id === 'low').key.k_sf, 2);
    assert.deepEqual(scheduled(plan).filter(event => event.id === 'lead').map(event => event.midi), [62, 64, 66, 67]);
});
test('Eb notation and its independent octave shift leave concert audio unchanged', () => {
    for (const octaveShift of [0, -1]) {
        const plan = planFor({ notation: { instrumentKey: 'Eb', octaveShift } });
        const rendered = render(plan);
        assert.equal(rendered.models[0].find(voice => voice.id === 'lead').key.k_sf, 3);
        assert.match(rendered.svg, />A\/E</);
        assert.deepEqual(scheduled(plan).filter(event => event.id === 'lead').map(event => event.midi), [60, 62, 64, 65]);
    }
});
test('intro plus two 32-bar parts retains exactly nine music systems in each display mode', () => {
    const section = label => {
        const lead = Array(4).fill(Array(8).fill('C2 D2').join(' | ') + ' |').join('\n');
        const low = lead.replaceAll('C2 D2', 'x4');
        return `P:${label}\n[V:lead] ${lead}]\n[V:low] ${low}]\n`;
    };
    const source = '%%fit2box * *\n%%pagescale 1\nX:1\nT:Layout fixture\nM:2/4\nL:1/8\nP:IABA\nV:lead\nV:low staffnonote=2\nK:C\nP:I\n[V:lead] C2 D2 |]\n[V:low] C,2 D,2 |]\n' + section('A') + section('B');
    for (const ids of [[], ['lead'], ['low']]) {
        const rendered = render(planFor({ display: { voiceIdFilter: ids } }, source));
        assert.equal(rendered.musicSystems, 9);
    }
});
