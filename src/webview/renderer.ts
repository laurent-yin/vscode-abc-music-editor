import { voiceNotation, resolveVoiceFilter } from 'abctools/preferences';
import type { EffectiveChoices, FilterResult, VoiceDescriptor } from 'abctools/preferences';

export interface MusicNote { midi?: number; noplay?: boolean | number; pit: number; acc?: number }
export interface Chord { type: string; text: string; otext?: string; [key: string]: unknown }
export interface MusicSymbol {
    type: number; time: number; dur?: number; istart?: number; iend?: number;
    next?: MusicSymbol; ts_next?: MusicSymbol; extra?: MusicSymbol;
    p_v: MusicVoice; notes?: MusicNote[]; a_gch?: Chord[];
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
declare const abc2svg: { Abc: new (user: ModelUser) => Model; C: { NOTE: number; GRACE: number } };

export interface Inventory { title: string; voices: VoiceDescriptor[]; key: string }
export interface Selections { display: FilterResult; playback: FilterResult }
export interface PreviewPlan {
    content: string;
    audio: Model;
    inventories: Inventory[];
    selections: Selections[];
    notices: string[];
    symbolFor(displaySymbol: MusicSymbol, tuneIndex: number): MusicSymbol | undefined;
    prepareDisplay(model: Model, voices: MusicVoice[], tuneIndex: number): void;
}
function parse(content: string): Model {
    const model = new abc2svg.Abc({ errmsg(message) { throw new Error(message); } });
    model.tosvg('abc', content);
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
    const overlays = new Set(tune[1].map(voice => voice.voice_down).filter(Boolean));
    return tune[1].filter(voice => !overlays.has(voice) && voice.id !== '_chord' && voice.id !== '_drum');
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
    return Array.from(model.tunes, tune => ({ title: tune[2].T ?? `Tune ${tune[2].X}`, voices: Array.from(sourceVoices(tune), descriptor), key: keyLabel(tune) }));
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
function projected(content: string, model: Model, selections: Selections[], choices: EffectiveChoices, display: boolean): string {
    const parts = stripLayouts(content).split(/(?=^X:)/m);
    let tuneIndex = 0;
    return parts.map(part => {
        if (!part.startsWith('X:')) return part;
        const tune = model.tunes[tuneIndex];
        const selection = selections[tuneIndex++];
        if (!tune || !selection) throw new Error('Cannot associate source tune headers with the renderer model.');
        const voices = sourceVoices(tune);
        const headerEnd = part.search(/^K:/m);
        if (headerEnd < 0) throw new Error('A tune is missing its initial K: field.');
        // Imported tunebooks may repeat X:/T:. Preview-local reference numbers
        // identify tunes unambiguously, including after fit2box reparses input.
        const header = part.slice(0, headerEnd).replace(/^X:[^\r\n]*/, `X:${tuneIndex}`);
        const current = [...header.matchAll(/^V:([^\s]+)/gm)].pop()?.[1] ?? voices[0]?.id;
        const options = voices.map(voice => {
            if (!/^[^\s[\]{}()|%"\\]+$/u.test(voice.id)) throw new Error(`Voice ID "${voice.id}" is not supported by the preview projection.`);
            const score = display ? instrumentInterval(choices, voice.id) : undefined;
            const shift = choices.transposition.semitones;
            return `V:${voice.id}${shift ? ` shift=${shiftInterval(shift)}` : ''}${score ? ` score=${score}` : ''}`;
        });
        const selected = display && selection.display.ids.length ? selection.display.ids : voices.map(voice => voice.id);
        if (!selected.length) throw new Error('This tune has no source voices.');
        return `${header}${options.join('\n')}\nV:${current}\n%%score ${selected.join(' ')}\n${part.slice(headerEnd)}`;
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
export function createPlan(content: string, choices: EffectiveChoices, original: Model, selections: Selections[]): PreviewPlan {
    if (original.tunes.some(tune => tune[1].some(voice => voice.voice_down))) {
        throw new Error('Voice overlays are not yet supported by personal voice projection.');
    }
    const notationRequested = choices.notation.instrumentKey !== undefined || choices.notation.octaveShift !== undefined || Object.keys(choices.notation.voices ?? {}).length > 0;
    if ((notationRequested || choices.transposition.semitones) && /(?:\b(?:score|sound|shift|transpose|octave)\s*=|^[ \t]*(?:%%|I:)transpose\b)/m.test(content.replace(/^[ \t]*%(?!%)[^\n]*$/gm, ''))) {
        throw new Error('This source already declares pitch/register transforms. Personal transposition requires a confirmed source pitch basis; remove personal notation/transposition settings or use a concert-pitch source.');
    }
    const layouts = content.match(/^[ \t]*(?:%%|I:)(?:score|staves)\b[^\r\n]*/gm) ?? [];
    if (layouts.some(line => /[()[\]{}|]/.test(line)) || layouts.length > original.tunes.length) {
        throw new Error('Grouped or changing staff layouts are not yet supported by personal voice projection. The source has not been changed.');
    }
    const audio = sourceModel(projected(content, original, selections, choices, false));
    const inventory = inventories(audio);
    const lookup = audio.tunes.map(tune => {
        const map = new Map<string, MusicSymbol[]>();
        for (const voice of sourceVoices(tune)) for (const symbol of symbols(voice)) {
            const key = symbolKey(symbol);
            const bucket = map.get(key) ?? [];
            bucket.push(symbol);
            map.set(key, bucket);
        }
        return map;
    });
    const notices = selections.flatMap((selection, i) => [...selection.display.notices, ...selection.playback.notices].map(notice => `${inventory[i].title}: ${notice}`));
    const displaySymbols = new WeakMap<MusicSymbol, MusicSymbol>();
    notices.push('Source navigation and source-position diagnostics are disabled: configuration, personal projections and fit2box do not yet provide a composed source map.');
    return {
        content: projected(content, original, selections, choices, true), audio, inventories: inventory, selections, notices,
        symbolFor(symbol) { return displaySymbols.get(symbol); },
        prepareDisplay(model, voices, index) {
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
            for (const voice of sourceVoices(audio.tunes[index])) for (const symbol of symbols(voice)) {
                const chords = symbol.a_gch?.filter(chord => chord.type === 'g');
                if (!chords?.length) continue;
                const existing = harmony.get(symbol.time);
                if (existing && JSON.stringify(existing.chords.map(chord => chord.text)) !== JSON.stringify(chords.map(chord => chord.text))) {
                    throw new Error(`Different authored harmonies occur at tick ${symbol.time}. Personal chord projection cannot safely merge them.`);
                }
                if (!existing) harmony.set(symbol.time, { voice, chords });
            }
            const shown = new Set<string>();
            for (const voice of voices) {
                if (!selections[index].display.ids.includes(voice.id)) continue;
                for (const symbol of symbols(voice)) {
                    const source = harmony.get(symbol.time);
                    if (!source || (symbol.type !== abc2svg.C.NOTE && !symbol.dur)) continue;
                    const context = `${symbol.time}:${voice.tr_sco ?? 0}`;
                    const other = symbol.a_gch?.filter(chord => chord.type !== 'g') ?? [];
                    symbol.a_gch = shown.has(context) ? other : [...other, ...source.chords.map(chord => ({
                        ...chord, text: model.gch_tr1(chord.text, (voice.tr_sco ?? 0) - (source.voice.tr_sco ?? 0))
                    }))];
                    shown.add(context);
                }
            }
            const contexts = new Set(voices.filter(voice => selections[index].display.ids.includes(voice.id)).map(voice => voice.tr_sco ?? 0));
            for (const time of harmony.keys()) for (const context of contexts) {
                if (!shown.has(`${time}:${context}`)) {
                    throw new Error(`Cannot place a hidden staff's chord at tick ${time} in the selected notation context. Choose a display that includes its authored staff.`);
                }
            }
        }
    };
}
/** Call after ToAudio.add, which may append generated accompaniment voices. */
export function maskAudio(tunes: Tune[], selections: Selections[], chords?: boolean): void {
    tunes.forEach((tune, index) => {
        for (const voice of tune[1]) {
            const enabled = voice.id === '_chord' ? chords !== false
                : voice.id === '_drum' || selections[index].playback.ids.includes(voice.id);
            if (enabled) continue;
            // Keep every timing/control/bar symbol. Both MIDI and WebAudio
            // schedulers honor note.noplay, including grace-note events.
            for (const symbol of symbols(voice)) for (const note of symbol.notes ?? []) note.noplay = true;
        }
    });
}
