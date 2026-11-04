import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolvePreferences, resolveVoiceFilter } from 'abctools/preferences';
import { sourceModel, createPlan, originalPlan, inventories, maskAudio, playbackVoices, shiftInterval, compactKeyLabel, renderModel } from '../out/webview/renderer.js';
import { installVoiceMixer, VoiceMixer } from '../out/webview/playback.js';

const context = vm.createContext({ console });
for (const filename of ['abc2svg-1.js', 'snd-1.js', 'fit2box-1.js', 'MIDI-1.js']) {
    vm.runInContext(fs.readFileSync(new URL(`../lib/${filename}`, import.meta.url), 'utf8'), context);
}
globalThis.abc2svg = context.abc2svg;
installVoiceMixer(context.abc2svg);
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
    renderModel(model, 'fixture', plan.content);
    return { svg, models, musicSystems: (svg.match(/<svg\b[\s\S]*?<\/svg>/g) ?? []).filter(block => /class="slW"|href="#stdef/.test(block)).length };
}
function notes(voice) {
    const result = [];
    for (let symbol = voice.sym; symbol; symbol = symbol.next) if (symbol.notes) result.push(...symbol.notes);
    return result;
}
test('original recovery preserves unsupported layouts, authored pitches, chords and all playback voices', () => {
    const source = '%%MIDI gchordon\n' + fixture.replace('K:C', '%%score (lead low)\nK:C');
    const choices = { display: { selectedVoiceIds: ['lead'], chords: false }, playback: { selectedVoiceIds: [], chords: false }, transposition: { semitones: 2 } };
    const before = JSON.stringify(choices);
    assert.throws(() => planFor(choices, source), /layout operators/);
    let svg = '';
    const model = new context.abc2svg.Abc({
        img_out(text) { svg += text; },
        errmsg(message) { throw new Error(message); }
    });
    model.tosvg('original', source);
    model.tunes = Array.from(model.tunes);
    const plan = originalPlan(source, model);
    assert.equal(plan.fallback, true);
    assert.equal(plan.content, source);
    assert.match(svg, />C\/G</);
    assert.deepEqual(plan.selections[0].playback.ids, ['lead', 'low']);
    const tune = plan.audio.tunes[0];
    context.ToAudio().add(tune[0], tune[1], tune[3]);
    const pitches = voice => {
        const result = [];
        for (let symbol = voice.sym; symbol; symbol = symbol.next) {
            if (symbol.type === context.abc2svg.C.NOTE) result.push(...symbol.notes.map(note => note.midi));
        }
        return result;
    };
    assert.deepEqual(pitches(tune[1][0]), [60, 62, 64, 65]);
    assert.deepEqual(pitches(tune[1][1]), [48, 50, 52, 53]);
    assert.ok(tune[1].find(voice => voice.id === '_chord'));
    assert.equal(JSON.stringify(choices), before);
});
test('original recovery bypasses harmony projection failures during engraving', () => {
    const source = fixture.replace('[V:low] C,', '[V:low] "Dm" C,');
    assert.throws(() => render(planFor({}, source)), /Different authored harmonies/);
    let svg = '';
    const model = new context.abc2svg.Abc({ img_out(text) { svg += text; }, errmsg(message) { throw new Error(message); } });
    model.tosvg('original', source);
    model.tunes = Array.from(model.tunes);
    const plan = originalPlan(source, model);
    assert.match(svg, />C\/G</);
    assert.match(svg, />Dm</);
    assert.equal(plan.symbolFor(model.tunes[0][0]), model.tunes[0][0]);
});
test('editing recovery restores fitting after deleting and restoring a note', () => {
    const source = '%%fit2box * *\n%%pagescale 1\n%%gchordfont Helvetica-BoldItalic 10\nX:1\nT:Editing recovery\nM:2/4\nL:1/16\nP:ABC\nV:lead\nV:low\nK:C\nP:A\n[V:lead] "C" C4D4 |]\n[V:low] "C" x8 |]\nP:B\n[V:lead] "F" E7F |]\n[V:low] "F" x8 |]\nP:C\n[V:lead] "G7" G4A4 |]\n[V:low] "G7" x8 |]\n';
    const invalid = source.replace('E7F', 'E7');
    const geometry = svg => ({
        boxes: [...svg.matchAll(/viewBox="([^"]+)"/g)].map(match => match[1]),
        scales: [...svg.matchAll(/transform="scale\(([^)]+)\)"/g)].map(match => match[1])
    });
    for (const id of ['lead', 'low']) {
        const choices = { display: { selectedVoiceIds: [id] } };
        const baseline = render(planFor(choices, source));
        assert.ok(geometry(baseline.svg).scales.length);
        for (let attempt = 0; attempt < 2; attempt++) {
            assert.throws(() => render(planFor(choices, invalid)), /Cannot place a hidden staff's chord/);
            assert.equal(context.abc2svg.fit2box.on, 0, 'failed fitting must not disable later renders');
            assert.ok(!context.abc2svg.fit2box.otosvg, 'no aborted instance may remain saved globally');
            const recovery = render(originalPlan(invalid, sourceModel(invalid)));
            assert.ok(geometry(recovery.svg).scales.length, 'the original-sheet fallback must still fit');
            const restored = planFor(choices, source);
            const result = render(restored);
            assert.deepEqual(restored.selections[0].display.ids, [id]);
            assert.deepEqual(geometry(result.svg), geometry(baseline.svg));
            assert.match(result.svg, /font:700 italic 10\.0px sans-serif/);
        }
    }
});
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
test('hidden melody chords do not consume the visible lower staff chord label', () => {
    const source = fixture.replace('V:lead name=', 'V:lead pos=\"gch hidden\" name=')
        .replace('[V:low] C,', '[V:low] \"C/G\" \"^Rhythm annotation\" C,');
    const both = render(planFor({}, source));
    assert.equal((both.svg.match(/>C\/G</g) ?? []).length, 1);
    assert.equal(both.models[0].find(voice => voice.id === 'low').sym.a_gch.find(chord => chord.type === 'g').pos, context.abc2svg.C.SL_ABOVE);
    for (const id of ['lead', 'low']) {
        const plan = planFor({ display: { selectedVoiceIds: [id] } }, source);
        assert.match(render(plan).svg, />C\/G</);
        let authored = plan.audio.tunes[0][1].find(voice => voice.id === 'lead').sym;
        while (authored && !authored.a_gch?.some(chord => chord.type === 'g')) authored = authored.next;
        assert.equal(authored.a_gch.find(chord => chord.type === 'g').pos, context.abc2svg.C.SL_HIDDEN);
    }
    const mixed = render(planFor({ notation: { instrumentKey: 'C', voices: { lead: { instrumentKey: 'Bb' } } } }, source));
    assert.match(mixed.svg, />D\/A</);
    assert.match(mixed.svg, />C\/G</);
    assert.match(mixed.svg, /Rhythm annotation/);
    const hidden = render(planFor({ display: { chords: false } }, source));
    assert.doesNotMatch(hidden.svg, />C\/G</);
    assert.match(hidden.svg, /Rhythm annotation/);
});
test('chord placement preserves visible below-staff preferences', () => {
    const source = fixture.replace('V:lead name=', 'V:lead pos=\"gch hidden\" name=')
        .replace('V:low name=', 'V:low pos=\"gch below\" name=');
    const rendered = render(planFor({}, source));
    assert.match(rendered.svg, />C\/G</);
    assert.equal(rendered.models[0].find(voice => voice.id === 'low').sym.a_gch.find(chord => chord.type === 'g').pos, context.abc2svg.C.SL_BELOW);
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
test('tempo inventory uses each tune initial Q beat, named tempo or the 120 BPM default', () => {
    for (const [q, expected] of [['', 120], ['Q:1/4=90\n', 90], ['Q:3/8=60\n', 60], ['Q:"Allegro"\n', 130], ['Q:"Play gently"\n', 120]]) {
        const source = fixture.replace('K:C', `${q}K:C`);
        const plan = planFor({}, source);
        assert.equal(plan.inventories[0].tempo, expected);
        const tune = plan.audio.tunes[0];
        context.ToAudio().add(tune[0], tune[1], tune[3]);
        assert.equal(inventories(plan.audio)[0].tempo, expected, 'audio preparation must not change the displayed original tempo');
    }
    const source = fixture.replace('K:C', 'Q:1/4=90\nK:C') + '\n' + fixture.replace('X:1', 'X:2').replace('K:C', 'Q:1/8=72\nK:C');
    assert.deepEqual(planFor({}, source).inventories.map(tune => tune.tempo), [90, 72]);
    assert.equal(planFor({}, fixture.replace('K:C', 'Q:1/4=90\nK:C').replace('C D | E F', 'C D | [Q:1/4=240] E F')).inventories[0].tempo, 90);
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
test('redraws reuse generated audio and stable symbol mappings, including grace timing and count-in beats', () => {
    const source = '%%MIDI gchordon\n%%playbeats 1\n%%fit2box * *\n%%pagescale 1\n'
        + fixture.replace('C D | E F', '{GAB}C D | "F" E F');
    const initial = planFor({}, source);
    const originalTimes = new Map();
    for (const voice of initial.audio.tunes[0][1]) for (let symbol = voice.sym; symbol; symbol = symbol.next) originalTimes.set(symbol, symbol.time);
    const tune = initial.audio.tunes[0];
    context.ToAudio().add(tune[0], tune[1], tune[3]);
    const shifted = [...originalTimes].filter(([symbol, time]) => symbol.time !== time);
    assert.ok(shifted.length, 'the engine mutates engraving-time positions during audio generation');
    for (const selected of [[], ['lead'], ['low'], ['lead', 'low']]) {
        const effective = resolvePreferences({ version: 1, files: { 'fixture.abc': {
            display: { selectedVoiceIds: selected }, playback: { selectedVoiceIds: selected }
        } } }, 'fixture.abc');
        const original = sourceModel(source);
        const selections = inventories(original).map(tune => ({
            display: resolveVoiceFilter(effective.display, tune.voices),
            playback: resolveVoiceFilter(effective.playback, tune.voices)
        }));
        const updated = createPlan(source, effective, original, selections, initial.audio);
        assert.equal(updated.audio, initial.audio);
        assert.deepEqual(updated.inventories[0].voices.map(voice => voice.id), ['lead', 'low']);
        const rendered = render(updated);
        for (const voice of rendered.models[0]) {
            for (let symbol = voice.sym; symbol; symbol = symbol.next) {
                if (symbol.type !== context.abc2svg.C.NOTE) continue;
                const canonical = updated.symbolFor(symbol, 0);
                assert.ok(canonical, `${voice.id} at ${symbol.time} must map to existing audio`);
                assert.equal(originalTimes.get(canonical), symbol.time);
            }
        }
        const enabled = playbackVoices(updated.audio.tunes, selections, false);
        for (const [voice, active] of enabled) {
            assert.equal(active, voice.id === '_beats' || selected.includes(voice.id));
            assert.ok(notes(voice).every(note => !note.noplay), 'live filtering must not mutate authored note flags');
        }
    }
});
test('reject unsupported source transforms and complex layout explicitly', () => {
    assert.throws(() => planFor({ notation: { instrumentKey: 'Bb' } }, fixture.replace('V:lead name=', 'V:lead transpose=-2 name=')), /source pitch basis/);
    for (const layout of ['(lead low)', 'lead | low', '{ [lead low] }']) {
        assert.throws(() => planFor({}, fixture.replace('K:C', `%%score ${layout}\nK:C`)), /not yet supported/);
    }
    assert.throws(() => planFor({}, fixture.replace('K:C', '%%score {lead low]\nK:C')), /Invalid staff grouping/);
    assert.throws(() => planFor({}, fixture.replace('K:C', '%%score lead low\n%%score low\nK:C')), /Changing staff layouts/);
    assert.throws(() => planFor({}, fixture.replace('K:C', 'K:C\n%%score lead low')), /after the initial K:/);
});
test('overlay branches follow parent voice playback and map back to canonical symbols', () => {
    const source = 'X:1\nT:Overlay fixture\nM:2/4\nL:1/4\n%%score {lead low}\nV:lead\nV:low clef=bass\nK:C\n[V:lead] C D | E F |]\n[V:low] C, D, & E, F, & G, A, | G, A, & C E & G B |]\n';
    const baselinePlan = planFor({}, source);
    assert.throws(() => sourceModel('X:1\nT:Invalid overlay\nM:2/4\nL:1/4\nK:C\nC D & E & F G |]\n'), /Wrong duration in voice overlay/);
    assert.deepEqual(baselinePlan.inventories[0].voices.map(voice => voice.id), ['lead', 'low']);
    const baseline = scheduled(baselinePlan);
    assert.ok(baseline.some(event => event.id === 'lowo'));
    assert.ok(baseline.some(event => event.id === 'lowoo'));
    for (const selected of [[], ['lead'], ['low'], ['lead', 'low']]) {
        const plan = planFor({ playback: { selectedVoiceIds: selected } }, source);
        const expected = baseline.filter(event => selected.includes(event.id === 'lead' ? 'lead' : 'low'));
        assert.deepEqual(scheduled(plan), expected);
    }
    for (const display of [['lead'], ['low'], ['lead', 'low']]) {
        const plan = planFor({ display: { selectedVoiceIds: display }, notation: { voices: { low: { instrumentKey: 'Bb' } } }, transposition: { semitones: 2 } }, source);
        const rendered = render(plan);
        assert.ok(rendered.svg.includes('<svg'));
        for (const voice of rendered.models[0]) {
            if (!display.includes(voice.id === 'lead' ? 'lead' : 'low')) continue;
            assert.equal(voice.time, plan.audio.tunes[0][1].find(canonical => canonical.id === voice.id).time);
            for (let symbol = voice.sym; symbol; symbol = symbol.next) {
                if (symbol.type !== context.abc2svg.C.NOTE) continue;
                const canonical = plan.symbolFor(symbol, 0);
                assert.ok(canonical, voice.id);
                assert.equal(canonical.p_v.id, voice.id);
                assert.equal(canonical.time, symbol.time);
            }
        }
        if (display.includes('low')) {
            const low = rendered.models[0].find(voice => voice.id === 'low');
            for (let overlay = low.voice_down; overlay; overlay = overlay.voice_down) assert.equal(overlay.tr_sco, low.tr_sco);
        }
        assert.deepEqual(scheduled(plan), baseline.map(event => ({ ...event, midi: event.midi + 2 })));
    }
});
test('chords authored only in an overlay can be projected and muted with its parent', () => {
    const source = '%%MIDI gchordon\nX:1\nT:Overlay harmony fixture\nM:2/4\nL:1/4\nV:lead\nV:low\nK:C\n[V:lead] C D | E F |]\n[V:low] C, D, & \"C/G\" E, F, | G, A, & \"G7\" B, C |]\n';
    const plan = planFor({ display: { selectedVoiceIds: ['lead'] }, playback: { selectedVoiceIds: ['lead'] } }, source);
    assert.match(render(plan).svg, />C\/G</);
    const events = scheduled(plan, false);
    assert.ok(events.length);
    assert.ok(events.every(event => event.id === 'lead'));
});
test('static braces and brackets preserve grouping and collapse for a single selected staff', () => {
    for (const [command, open, close] of [['score', '{', '}'], ['score', '[', ']'], ['staves', '{', '}'], ['staves', '[', ']']]) {
        const source = fixture.replace('K:C', `%%${command} ${open} low lead ${close}\nK:C`);
        const both = planFor({}, source);
        assert.ok(both.content.includes(`%%${command} ${open} low lead ${close}\n`));
        assert.ok(render(both).svg.includes('<svg'));
        for (const id of ['lead', 'low']) {
            const plan = planFor({ display: { selectedVoiceIds: [id] }, playback: { selectedVoiceIds: [id] } }, source);
            assert.ok(plan.content.includes(`%%${command} ${id}\n`));
            const rendered = render(plan);
            assert.ok(rendered.svg.includes('<svg'));
            assert.equal(rendered.models[0].find(voice => voice.id === id).key.k_sf, 0);
            assert.deepEqual(inventories(plan.audio)[0].voices.map(voice => voice.id), ['lead', 'low']);
        }
        const mixed = planFor({ notation: { instrumentKey: 'C', voices: { lead: { instrumentKey: 'Bb' } } }, transposition: { semitones: 2 } }, source);
        const rendered = render(mixed);
        assert.match(rendered.svg, />E\/B</);
        assert.match(rendered.svg, />D\/A</);
        assert.equal(rendered.models[0].find(voice => voice.id === 'lead').key.k_sf, 4);
        assert.equal(rendered.models[0].find(voice => voice.id === 'low').key.k_sf, 2);
    }
});
test('inherited layout and per-tune layouts are projected independently', () => {
    const source = `%%score {lead low}\n${fixture}\n${fixture.replace('X:1', 'X:2').replace('K:C', '%%score [low lead]\nK:C')}`;
    const plan = planFor({ display: { selectedVoiceIds: ['lead', 'low'] } }, source);
    assert.ok(plan.content.includes('%%score { lead low }\n'));
    assert.ok(plan.content.includes('%%score [ low lead ]\n'));
    assert.equal(render(plan).models.length, 2);
});
test('braced melody/rhythm score retains rests, maps and canonical audio under voice filtering', () => {
    const source = '%%MIDI gchordon\n%%fit2box * *\n%%pagescale 1\nX:1\nT:Grouped rhythm fixture\nM:2/4\nL:1/4\n%%score { melody rhythm } % separate staves\nV:melody clef=treble name=\"Melody\" pos=\"gch hidden\"\nV:rhythm clef=bass name=\"Rhythm\" staffnonote=2\n%%map rhythm D, heads=x\nK:Dm\n[V:melody] \"Dm\" D E | \"A7\" F G | \"Dm\" A B | \"Gm\" c d |]\n[V:rhythm] [I:voicemap rhythm] \"Dm\" D, z | [I:voicemap] \"A7\" x2 | \"Dm\" Z | \"Gm\" Z |]\n';
    const baseline = scheduled(planFor({}, source));
    for (const display of [['melody', 'rhythm'], ['melody'], ['rhythm']]) {
        for (const semitones of [0, 2]) {
            const choices = {
                display: { selectedVoiceIds: display },
                notation: { instrumentKey: 'C', voices: { melody: { instrumentKey: 'Bb' } } },
                transposition: { semitones }
            };
            const plan = planFor(choices, source);
            assert.equal(render(plan).musicSystems, 1);
            assert.deepEqual(scheduled(plan), baseline.map(event => ({ ...event, midi: event.midi + semitones })));
        }
    }
});

function scheduled(plan, chords = true, live = false, speed = 1) {
    const tune = plan.audio.tunes[0];
    context.ToAudio().add(tune[0], tune[1], tune[3]);
    const mixer = live ? new VoiceMixer() : undefined;
    if (mixer) mixer.update(playbackVoices(plan.audio.tunes, plan.selections, chords));
    else maskAudio(plan.audio.tunes, plan.selections, chords);
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
        s_cur: tune[0], s_end: null, conf: { speed: 1, new_speed: speed, voiceMixer: mixer }, tgen: 100000,
        ...(live ? {
            ac: { createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }) },
            gain: {}
        } : {}),
        get_time: () => 0, v_c: [], c_i: [],
        midi_ctrl() {}, midi_prog() {}, onnote, onend,
        note_run(_po, symbol, midi, time, duration) {
            if (live && !_po.gain.gain.value) return;
            events.push({ id: symbol.p_v.id, midi, time, duration });
        }
    };
    context.abc2svg.play_next(po);
    while (timers.length && !ended) timers.shift()();
    assert.equal(ended, true);
    mixer?.clear();
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
test('extension live routing preserves the real scheduler timeline, overlays, grace notes, ties, repeats and chords', () => {
    const source = '%%MIDI gchordon\nX:1\nT:Live navigation\nM:2/4\nL:1/8\nP:AABB\nV:lead\nV:low\nK:C\nP:A\n[V:lead] "C" {G}C2- C2 |]\n[V:low] C,2 E,2 & E,2 G,2 |]\nP:B\n[V:lead] "G7" (3DEF G2 |]\n[V:low] G,2 B,2 |]\n';
    const baseline = scheduled(planFor({}, source));
    for (const selected of [[], ['lead'], ['low'], ['lead', 'low']]) for (const chords of [false, true]) {
        const plan = planFor({ playback: { selectedVoiceIds: selected } }, source);
        const actual = scheduled(plan, chords, true);
        const expected = baseline.filter(event => event.id === '_chord' ? chords : selected.includes(event.id === 'lowo' ? 'low' : event.id));
        assert.deepEqual(actual, expected);
        for (const voice of plan.audio.tunes[0][1]) assert.ok(notes(voice).every(note => !note.noplay));
    }
});
test('live speed API scales all authored tempo changes and never changes pitch', () => {
    const source = fixture.replace('K:C', 'Q:1/4=120\nK:C').replace('C D | E F', 'C D | [Q:1/4=90] E F');
    const baseline = scheduled(planFor({}, source), false, true);
    const conf = {};
    context.navigator = { userAgent: 'test' };
    const player = context.AbcPlay(conf);
    assert.equal(typeof player.set_speed, 'function');
    for (const bpm of [1, 60, 120, 240, 100000]) {
        player.set_speed(bpm / 120);
        const events = scheduled(planFor({}, source), false, true, conf.new_speed);
        assert.equal(events.length, baseline.length);
        events.forEach((event, index) => {
            assert.equal(event.midi, baseline[index].midi);
            assert.equal(event.id, baseline[index].id);
            assert.ok(Math.abs(event.duration - baseline[index].duration * 120 / bpm) < 1e-9);
            assert.ok(Math.abs(event.time - (0.3 + (baseline[index].time - 0.3) * 120 / bpm)) < 1e-9);
        });
    }
    player.set_speed(1);
    assert.equal(conf.new_speed, 1, 'blank/original restores the authored timing');
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
