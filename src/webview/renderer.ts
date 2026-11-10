import { voiceNotation, resolveVoiceFilter } from 'abctools/preferences';
import type { EffectiveChoices, FilterResult, VoiceDescriptor } from 'abctools/preferences';

export interface MusicNote { midi?: number; noplay?: boolean | number; pit: number; acc?: number }
export interface Chord { type: string; text: string; otext?: string; [key: string]: unknown }
export interface MusicSymbol {
    type: number; v: number; time: number; dur?: number; istart?: number; iend?: number;
    tempo?: number; tempo_str1?: string; tempo_str2?: string;
    next?: MusicSymbol; ts_next?: MusicSymbol; extra?: MusicSymbol;
    p_v: MusicVoice; notes?: MusicNote[]; a_gch?: Chord[]; pos?: { gch?: number };
}
export interface MusicVoice {
    id: string; nm?: string; snm?: string; sym?: MusicSymbol;
    key: { k_sf: number; k_mode?: number; k_none?: boolean; k_drum?: boolean; k_bagpipe?: string }; tr_sco?: number;
    voice_down?: MusicVoice;
}
export type Tune = [MusicSymbol, MusicVoice[], Record<string, string>, unknown];
export interface ModelUser {
    img_out?: (svg: string) => void;
    errmsg: (message: string) => void;
    get_abcmodel?: (first: MusicSymbol, voices: MusicVoice[], names: unknown, info: Record<string, string>) => void;
}
export interface Model {
    tosvg(id: string, content: string): void;
    tunes: Tune[];
    gch_tr1(text: string, interval: number): string;
}
declare const abc2svg: {
    Abc: new (user: ModelUser) => Model;
    C: { NOTE: number; GRACE: number; TEMPO: number; SL_ABOVE: number; SL_HIDDEN: number };
    tmp_tb: Record<string, number>;
    fit2box?: { on: number; otosvg?: Model['tosvg'] | null };
};

export interface Inventory { title: string; voices: VoiceDescriptor[]; key: string; tempo: number }
export interface Selections { display: FilterResult; playback: FilterResult }
export interface PreviewPlan {
    fallback?: boolean;
    content: string;
    audio: Model;
    playbackTransposition?: number;
    inventories: Inventory[];
    selections: Selections[];
    notices: string[];
    symbolFor(displaySymbol: MusicSymbol, tuneIndex: number): MusicSymbol | undefined;
    prepareDisplay(model: Model, voices: MusicVoice[], tuneIndex: number): void;
}
export function originalPlan(content: string, audio: Model): PreviewPlan {
    const inventory = inventories(audio);
    return {
        fallback: true, content, audio, inventories: inventory,
        selections: inventory.map(tune => ({
            display: { ids: tune.voices.map(voice => voice.id), notices: [] },
            playback: { ids: tune.voices.map(voice => voice.id), notices: [] }
        })),
        notices: ['Recovery mode: original authored layout and playback; personal display, playback, notation and transposition preferences are not applied. Saved preferences are unchanged.'],
        symbolFor(symbol) { return symbol; },
        prepareDisplay() {}
    };
}
export function renderModel(model: Pick<Model, 'tosvg'>, id: string, content: string): void {
    try {
        model.tosvg(id, content);
    } finally {
        // fit2box leaves global state active if a rendering callback throws.
        const fitting = abc2svg.fit2box;
        if (fitting) {
            if (fitting.otosvg) model.tosvg = fitting.otosvg;
            fitting.otosvg = null;
            fitting.on = 0;
        }
    }
}
function parse(content: string): Model {
    const model = new abc2svg.Abc({ errmsg(message) { throw new Error(message); } });
    renderModel(model, 'abc', content);
    // abc2svg exposes tunes on a prototype replaced by each constructor.
    // Own the array before constructing the independent display instance.
    model.tunes = Array.from(model.tunes);
    return model;
}
function stripLayouts(content: string): string {
    return content.replace(/^[ \t]*(?:%%|I:)(?:score|staves)\b[^\r\n]*/gm, line => '%' + ' '.repeat(line.length - 1));
}
export function sourceModel(content: string): Model {
    if (/\[I:(?:score|staves)\b/.test(content)) throw new Error('Inline staff-layout changes are not supported by personal voice projection.');
    // Fitting rewrites the parser input for engraving, not musical performance.
    return parse(stripLayouts(content).replace(/^[ \t]*%%fit2box\b[^\r\n]*/gm, '%'));
}
function descriptor(voice: MusicVoice): VoiceDescriptor {
    return { id: voice.id, name: voice.nm?.replace(/\\n/g, ' '), shortName: voice.snm };
}
function sourceVoices(tune: Tune): MusicVoice[] {
    const owners = voiceOwners(tune[1]);
    return tune[1].filter(voice => owners.get(voice) === voice && !['_chord', '_drum', '_beats'].includes(voice.id));
}
function voiceOwners(voices: MusicVoice[]): Map<MusicVoice, MusicVoice> {
    const overlays = new Set(voices.map(voice => voice.voice_down).filter(Boolean));
    const owners = new Map<MusicVoice, MusicVoice>();
    for (const root of voices) {
        if (overlays.has(root)) continue;
        for (let voice: MusicVoice | undefined = root; voice; voice = voice.voice_down) owners.set(voice, root);
    }
    return owners;
}
const keys = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
function keyLabel(tune: Tune): string {
    const key = tune[1][0]?.key;
    if (key?.k_none) return 'No key';
    if (key?.k_drum) return 'Percussion';
    if (key?.k_bagpipe) return 'Bagpipe';
    const mode = key?.k_mode ?? 0;
    const root = key && keys[key.k_sf + [0, 2, 4, -1, 1, 3, -2][mode] + 7];
    return root ? `${root} ${['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'][mode]}` : 'Custom key';
}
export function compactKeyLabel(key: string): string {
    return key.replace(/ major$/, '').replace(/ minor$/, 'm');
}
export function inventories(model: Model): Inventory[] {
    return Array.from(model.tunes, tune => ({ title: tune[2].T ?? `Tune ${tune[2].X}`, voices: Array.from(sourceVoices(tune), descriptor), key: keyLabel(tune), tempo: originalTempo(tune) }));
}
export function originalTempo(tune: Tune): number {
    let tempo = 120;
    for (let symbol: MusicSymbol | undefined = tune[0]; symbol && !symbol.dur; symbol = symbol.ts_next) {
        if (symbol.type !== abc2svg.C.TEMPO) continue;
        const value = symbol.tempo ?? abc2svg.tmp_tb[(symbol.tempo_str1 || symbol.tempo_str2 || '').toLowerCase()];
        if (value !== undefined) tempo = value;
    }
    return tempo;
}
function octave(note: string, amount: number): string {
    if (amount < 0) return note.replace(/[a-g]/, letter => letter.toUpperCase()) + ','.repeat(-amount - 1);
    return note + "'".repeat(amount);
}
export function shiftInterval(semitones: number): string {
    const pitches = ['c', '_d', 'd', '_e', 'e', 'f', '_g', 'g', '_a', 'a', '_b', 'b'];
    return 'c' + octave(pitches[((semitones % 12) + 12) % 12], Math.floor(semitones / 12));
}
function instrumentInterval(choices: EffectiveChoices, id: string): string | undefined {
    const notation = voiceNotation(choices.notation, id);
    if (notation.instrumentKey === undefined && notation.octaveShift === undefined) return undefined;
    const targets = { C: 'c', Db: 'b', D: '_b', Eb: 'a', E: '_a', F: 'g', Gb: '^f', G: 'f', Ab: 'e', A: '_e', Bb: 'd', B: '_d' };
    return 'c' + octave(targets[notation.instrumentKey ?? 'C'], notation.octaveShift ?? 0);
}
function staffLayout(directive: string | undefined, selected: string[], available: string[]): string {
    if (!directive) return `%%score ${selected.join(' ')}`;
    const match = directive.match(/(?:%%|I:)(score|staves)\s+(.*)/);
    if (!match) throw new Error('A staff layout is missing its voice list.');
    const [, command, parameter] = match;
    const layout = parameter.split('%')[0].trim();
    if (/[()|*+]/.test(layout)) throw new Error('Shared-staff, floating-voice and barline layout operators are not yet supported by personal voice projection.');
    const result: string[] = [];
    const seen = new Set<string>();
    let group: { open: string; voices: string[] } | undefined;
    for (const token of layout.match(/[{}[\]]|[^\s{}[\]]+/g) ?? []) {
        if (token === '{' || token === '[') {
            if (group) throw new Error('Nested staff groups are not yet supported by personal voice projection.');
            group = { open: token, voices: [] };
        } else if (token === '}' || token === ']') {
            if (!group || token !== (group.open === '{' ? '}' : ']') || !group.voices.length) throw new Error('Invalid staff grouping in the source layout.');
            // Legacy %%staves may turn three/four braced voices into shared staves.
            if (command === 'staves' && group.open === '{' && group.voices.length > 2) throw new Error('Legacy multi-voice braced %%staves layouts are not yet supported by personal voice projection.');
            const kept = group.voices.filter(id => selected.includes(id));
            if (kept.length > 1) result.push(`${group.open} ${kept.join(' ')} ${token}`);
            else result.push(...kept);
            group = undefined;
        } else {
            if (!available.includes(token) || seen.has(token)) throw new Error(`Unknown or repeated voice "${token}" in the source staff layout.`);
            seen.add(token);
            if (group) group.voices.push(token);
            else if (selected.includes(token)) result.push(token);
        }
    }
    if (group || !seen.size) throw new Error('Invalid staff grouping in the source layout.');
    // Personal selections can reveal voices omitted by the authored selector.
    result.push(...selected.filter(id => !seen.has(id)));
    return `%%${command} ${result.join(' ')}`;
}
function projected(content: string, model: Model, selections: Selections[], choices: EffectiveChoices, display: boolean): string {
    const parts = content.split(/(?=^X:)/m);
    let inheritedLayout: string | undefined;
    let tuneIndex = 0;
    return parts.map(part => {
        const layouts = [...part.matchAll(/^[ \t]*(?:%%|I:)(?:score|staves)\b[^\r\n]*/gm)];
        if (layouts.length > 1) throw new Error('Changing staff layouts are not yet supported by personal voice projection.');
        if (!part.startsWith('X:')) {
            inheritedLayout = layouts[0]?.[0];
            return stripLayouts(part);
        }
        const tune = model.tunes[tuneIndex];
        const selection = selections[tuneIndex++];
        if (!tune || !selection) throw new Error('Cannot associate source tune headers with the renderer model.');
        const voices = sourceVoices(tune);
        const headerEnd = part.search(/^K:/m);
        if (headerEnd < 0) throw new Error('A tune is missing its initial K: field.');
        if (layouts.some(layout => layout.index > headerEnd)) throw new Error('Staff-layout directives after the initial K: are not yet supported by personal voice projection.');
        const stripped = stripLayouts(part);
        // Imported tunebooks may repeat X:/T:. Preview-local reference numbers
        // identify tunes unambiguously, including after fit2box reparses input.
        const header = stripped.slice(0, headerEnd).replace(/^X:[^\r\n]*/, `X:${tuneIndex}`);
        const current = [...header.matchAll(/^V:([^\s]+)/gm)].pop()?.[1] ?? voices[0]?.id;
        const options = voices.map(voice => {
            if (!/^[^\s[\]{}()|%"\\]+$/u.test(voice.id)) throw new Error(`Voice ID "${voice.id}" is not supported by the preview projection.`);
            const score = display ? instrumentInterval(choices, voice.id) : undefined;
            const shift = choices.transposition.semitones;
            return `V:${voice.id}${shift ? ` shift=${shiftInterval(shift)}` : ''}${score ? ` score=${score}` : ''}`;
        });
        const selected = display && selection.display.ids.length ? selection.display.ids : voices.map(voice => voice.id);
        if (!selected.length) throw new Error('This tune has no source voices.');
        const layout = staffLayout(layouts[0]?.[0] ?? inheritedLayout, selected, voices.map(voice => voice.id));
        return `${header}${options.join('\n')}\nV:${current}\n${display ? layout : `%%score ${selected.join(' ')}`}\n${stripped.slice(headerEnd)}`;
    }).join('');
}
function symbols(voice: MusicVoice): MusicSymbol[] {
    const result: MusicSymbol[] = [];
    for (let symbol = voice.sym; symbol; symbol = symbol.next) {
        result.push(symbol);
        for (let grace = symbol.extra; grace; grace = grace.next) result.push(grace);
    }
    return result;
}
function symbolKey(symbol: MusicSymbol): string {
    return `${symbol.p_v.id}:${symbol.time}:${symbol.type}`;
}
export async function filterSelections(choices: EffectiveChoices, voiceLists: VoiceDescriptor[][]): Promise<Selections[]> {
    if ([choices.display, choices.playback].every(filter =>
        filter.selectedVoiceIds !== undefined || filter.hideVoicesMatching !== undefined || !filter.voiceIdRegexFilter?.length)) {
        return voiceLists.map(voices => ({
            display: resolveVoiceFilter(choices.display, voices),
            playback: resolveVoiceFilter(choices.playback, voices)
        }));
    }
    // No regex executes in the webview's event loop. Termination also covers
    // catastrophic backtracking; malformed/unsupported patterns are errors.
    // VS Code webview workers cannot import scripts. Fetch both modules in the
    // webview and launch a self-contained blob instead of importing in the worker.
    const sources = await Promise.all(['../lib/preferences.js', './filter-worker.js'].map(async filename => {
        const response = await fetch(new URL(filename, import.meta.url));
        if (!response.ok) throw new Error(`Cannot load voice-filter script ${filename}: ${response.status}`);
        return response.text();
    }));
    const workerUrl = URL.createObjectURL(new Blob([sources.join('\n')], { type: 'text/javascript' }));
    let worker: Worker | undefined;
    try {
        const activeWorker = new Worker(workerUrl, { type: 'module' });
        worker = activeWorker;
        return await new Promise<Selections[]>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Voice-filter worker did not respond within 2 seconds. Regex evaluation may have exceeded the time limit.')), 2000);
            activeWorker.onmessage = (event: MessageEvent<{ results?: Selections[]; error?: string }>) => {
                clearTimeout(timer);
                if (event.data.error) reject(new Error(event.data.error));
                else if (event.data.results) resolve(event.data.results);
                else reject(new Error('Invalid voice-filter worker response.'));
            };
            activeWorker.onerror = event => { clearTimeout(timer); reject(new Error(`Voice-filter worker: ${event.message}`)); };
            activeWorker.postMessage({ choices, voices: voiceLists });
        });
    } finally { worker?.terminate(); URL.revokeObjectURL(workerUrl); }
}
const canonicalLookups = new WeakMap<Model, { lookup: Map<string, MusicSymbol[]>[]; times: WeakMap<MusicSymbol, number>; transposition: number }>();
export function createPlan(content: string, choices: EffectiveChoices, original: Model, selections: Selections[], retainedAudio?: Model): PreviewPlan {
    const notationRequested = choices.notation.instrumentKey !== undefined || choices.notation.octaveShift !== undefined || Object.keys(choices.notation.voices ?? {}).length > 0;
    if ((notationRequested || choices.transposition.semitones) && /(?:\b(?:score|sound|shift|transpose|octave)\s*=|^[ \t]*(?:%%|I:)transpose\b)/m.test(content.replace(/^[ \t]*%(?!%)[^\n]*$/gm, ''))) {
        throw new Error('This source already declares pitch/register transforms. Personal transposition requires a confirmed source pitch basis; remove personal notation/transposition settings or use a concert-pitch source.');
    }
    const audio = retainedAudio ?? sourceModel(projected(content, original, selections, choices, false));
    // ToAudio moves grace/beat symbols in place. Keep their engraving-time keys
    // so redraws still map to the very same running playback objects.
    const cached = canonicalLookups.get(audio);
    const transposition = cached?.transposition ?? choices.transposition.semitones;
    const playbackTransposition = choices.transposition.semitones - transposition;
    const concert = playbackTransposition ? sourceModel(projected(content, original, selections, choices, false)) : audio;
    const inventory = inventories(concert);
    const times = cached?.times ?? new WeakMap<MusicSymbol, number>();
    const lookup = cached?.lookup ?? audio.tunes.map(tune => {
        const map = new Map<string, MusicSymbol[]>();
        for (const voice of tune[1]) for (const symbol of symbols(voice)) {
            const key = symbolKey(symbol);
            const bucket = map.get(key) ?? [];
            bucket.push(symbol);
            map.set(key, bucket);
            times.set(symbol, symbol.time);
        }
        return map;
    });
    canonicalLookups.set(audio, { lookup, times, transposition });
    const notices = selections.flatMap((selection, i) => [...selection.display.notices, ...selection.playback.notices].map(notice => `${inventory[i].title}: ${notice}`));
    const displaySymbols = new WeakMap<MusicSymbol, MusicSymbol>();
    notices.push('Source navigation and source-position diagnostics are disabled: configuration, personal projections and fit2box do not yet provide a composed source map.');
    return {
        content: projected(content, original, selections, choices, true), audio, playbackTransposition, inventories: inventory, selections, notices,
        symbolFor(symbol) { return displaySymbols.get(symbol); },
        prepareDisplay(model, voices, index) {
            const owners = voiceOwners(voices);
            const selectedVoices = voices.filter(voice => selections[index].display.ids.includes(owners.get(voice)?.id ?? voice.id));
            const occurrences = new Map<string, number>();
            for (const voice of voices) for (const symbol of symbols(voice)) {
                const key = symbolKey(symbol);
                const ordinal = occurrences.get(key) ?? 0;
                occurrences.set(key, ordinal + 1);
                const canonical = lookup[index]?.get(key)?.[ordinal];
                if (canonical) displaySymbols.set(symbol, canonical);
            }
            // Bring the concert harmony into each selected notation context,
            // even when its authored labels were on a now-hidden staff.
            if (choices.display.chords === false || !selections[index].display.ids.length) {
                for (const voice of voices) for (const symbol of symbols(voice)) {
                    symbol.a_gch = symbol.a_gch?.filter(chord => chord.type !== 'g');
                }
                return;
            }
            const harmony = new Map<number, { voice: MusicVoice; chords: Chord[] }>();
            for (const voice of concert.tunes[index][1]) for (const symbol of symbols(voice)) {
                const time = concert === audio ? times.get(symbol) : symbol.time;
                if (time === undefined) continue;
                const chords = symbol.a_gch?.filter(chord => chord.type === 'g');
                if (!chords?.length) continue;
                const existing = harmony.get(time);
                if (existing && JSON.stringify(existing.chords.map(chord => chord.text)) !== JSON.stringify(chords.map(chord => chord.text))) {
                    throw new Error(`Different authored harmonies occur at tick ${time}. Personal chord projection cannot safely merge them.`);
                }
                if (!existing) harmony.set(time, { voice, chords });
            }
            const targets = new Map<string, { voice: MusicVoice; symbol: MusicSymbol; position: number }>();
            for (const voice of selectedVoices) {
                for (const symbol of symbols(voice)) {
                    symbol.a_gch = symbol.a_gch?.filter(chord => chord.type !== 'g');
                    if (!harmony.has(symbol.time) || (symbol.type !== abc2svg.C.NOTE && !symbol.dur)) continue;
                    const context = `${symbol.time}:${voice.tr_sco ?? 0}`;
                    const position = symbol.pos?.gch || abc2svg.C.SL_ABOVE;
                    const existing = targets.get(context);
                    if (!existing || (existing.position === abc2svg.C.SL_HIDDEN && position !== abc2svg.C.SL_HIDDEN)) {
                        targets.set(context, { voice, symbol, position });
                    }
                }
            }
            const contexts = new Set(selectedVoices.map(voice => voice.tr_sco ?? 0));
            for (const [time, source] of harmony) for (const context of contexts) {
                const target = targets.get(`${time}:${context}`);
                if (!target) {
                    throw new Error(`Cannot place a hidden staff's chord at tick ${time} in the selected notation context. Choose a display that includes its authored staff.`);
                }
                target.symbol.a_gch = [...target.symbol.a_gch ?? [], ...source.chords.map(chord => ({
                    ...chord,
                    pos: target.position === abc2svg.C.SL_HIDDEN ? abc2svg.C.SL_ABOVE : target.position,
                    text: model.gch_tr1(chord.text, (target.voice.tr_sco ?? 0) - (source.voice.tr_sco ?? 0))
                }))];
            }
        }
    };
}
/** Call after ToAudio.add, which may append generated accompaniment voices. */
export function playbackVoices(tunes: Tune[], selections: Selections[], chords?: boolean): Map<MusicVoice, boolean> {
    const enabled = new Map<MusicVoice, boolean>();
    tunes.forEach((tune, index) => {
        const owners = voiceOwners(tune[1]);
        for (const voice of tune[1]) {
            enabled.set(voice, voice.id === '_chord' ? chords !== false
                : voice.id === '_drum' || voice.id === '_beats' || selections[index].playback.ids.includes(owners.get(voice)?.id ?? voice.id));
        }
    });
    return enabled;
}
export function maskAudio(tunes: Tune[], selections: Selections[], chords?: boolean): void {
    for (const [voice, enabled] of playbackVoices(tunes, selections, chords)) {
        if (enabled) continue;
        // Keep every timing/control/bar symbol. Both MIDI and WebAudio
        // schedulers honor note.noplay, including grace-note events.
        for (const symbol of symbols(voice)) for (const note of symbol.notes ?? []) note.noplay = true;
    }
}
