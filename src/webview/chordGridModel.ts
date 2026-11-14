import { prepareGridMeasures } from 'abctools/chord-grid';
import type { GridAnnotation, GridMeasure } from 'abctools/chord-grid';
import type { MusicSymbol, MusicVoice } from './renderer.js';

interface Meter { top: string; bot?: string }
interface GridSymbol extends MusicSymbol {
    bar_type?: string;
    text?: string;
    soln?: boolean;
    part?: { text: string };
    a_dd?: { name: string; str?: string }[];
    a_meter?: Meter[];
    wmeasure?: number;
    fmt?: { breakoneoln?: boolean };
}
interface GridVoice extends MusicVoice {
    meter?: { a_meter: Meter[]; wmeasure: number };
}
interface Event {
    type: number;
    time: number;
    duration: number;
    bar?: string;
    ending?: string;
    line?: boolean;
    chords: string[];
    annotations: GridAnnotation[];
    meter?: { text: string; duration: number };
}
export interface GridVoiceSnapshot { id: string; meter: string; measureDuration: number; events: Event[] }
export interface GridSnapshot {
    title: string;
    composer: string;
    voices: GridVoiceSnapshot[];
}
export interface ChordGrid {
    title: string;
    composer: string;
    sourceId: string;
    meter: string;
    measures: (GridMeasure & { repeat: boolean })[];
    message?: string;
    notices: string[];
}
declare const abc2svg: { C: { BAR: number; METER: number; MREST: number } };

function meterText(meter: Meter[] | undefined): string {
    return meter?.map(item => item.bot ? `${item.top}/${item.bot}` : item.top).join(' + ') ?? '';
}
const navigation: Record<string, string> = {
    segno: '\u{1d10b}', coda: '\u{1d10c}', fine: 'Fine',
    dacapo: 'D.C.', dalsegno: 'D.S.', 'D.C.': 'D.C.', 'D.S.': 'D.S.',
    'D.C.alcoda': 'D.C. al Coda', 'D.S.alcoda': 'D.S. al Coda',
    'D.C.alfine': 'D.C. al Fine', 'D.S.alfine': 'D.S. al Fine'
};

/** Snapshot in get_abcmodel, before engraving and ToAudio mutate the symbols. */
export function captureGridSnapshot(voices: MusicVoice[], info: Record<string, string>): GridSnapshot {
    return {
        title: info.T ?? `Tune ${info.X}`, composer: info.C ?? '',
        voices: voices.filter(voice => !voice.id.startsWith('_')).map(voice => {
            const initial = (voice as GridVoice).meter;
            const events: Event[] = [];
            for (let symbol = voice.sym as GridSymbol | undefined; symbol; symbol = symbol.next as GridSymbol | undefined) {
                const annotations: GridAnnotation[] = [];
                if (symbol.part) annotations.push({ time: 0, text: symbol.part.text, kind: 'part' });
                if (symbol.text && symbol.bar_type) annotations.push({ time: 0, text: `${symbol.text}.`, kind: 'ending' });
                for (const chord of symbol.a_gch ?? []) {
                    if (chord.type !== 'g') annotations.push({ time: 0, text: String(chord.text), kind: 'text' });
                }
                for (const decoration of symbol.a_dd ?? []) {
                    if (decoration.name === 'fermata' || decoration.name === 'invertedfermata') continue;
                    const text = navigation[decoration.name] ?? decoration.str;
                    if (!text) continue;
                    annotations.push({
                        time: 0, text,
                        kind: navigation[decoration.name] ? 'navigation' : 'text'
                    });
                }
                events.push({
                    type: symbol.type, time: symbol.time, duration: symbol.dur ?? 0,
                    bar: symbol.bar_type, ending: symbol.bar_type ? symbol.text : undefined,
                    line: symbol.soln && symbol.fmt?.breakoneoln !== false,
                    chords: (symbol.a_gch ?? []).filter(chord => chord.type === 'g').map(chord => String(chord.text)),
                    annotations,
                    ...(symbol.type === abc2svg.C.METER ? {
                        meter: { text: meterText(symbol.a_meter), duration: symbol.wmeasure ?? initial?.wmeasure ?? 1536 }
                    } : {})
                });
            }
            return { id: voice.id, meter: meterText(initial?.a_meter), measureDuration: initial?.wmeasure ?? 1536, events };
        })
    };
}

export function measureBoundaries(voice: GridVoiceSnapshot): number[] {
    const end = Math.max(0, ...voice.events.map(event => event.time + event.duration));
    const boundaries = new Set([0, end]);
    let measureDuration = voice.measureDuration;
    for (const event of voice.events) {
        if (event.meter) measureDuration = event.meter.duration;
        if (event.bar || event.meter) boundaries.add(event.time);
        if (event.type === abc2svg.C.MREST && measureDuration > 0) {
            for (let time = event.time + measureDuration; time < event.time + event.duration; time += measureDuration) boundaries.add(time);
        }
    }
    return [...boundaries].sort((a, b) => a - b);
}

export function chordGridFromSnapshot(snapshot: GridSnapshot, sourceId: string | undefined, repeatMeasures: boolean, showTextInstructions = false): ChordGrid {
    const id = sourceId ?? snapshot.voices[0]?.id ?? '';
    const voice = snapshot.voices.find(item => item.id === id);
    const base = { title: snapshot.title, composer: snapshot.composer, sourceId: id, meter: voice?.meter ?? '', notices: [] as string[] };
    if (!voice) return { ...base, measures: [], message: `Chord source "${id}" is unavailable in this tune. Choose another source voice.` };
    if (!voice.events.some(event => event.chords.length)) {
        return { ...base, measures: [], message: `Voice "${id}" has no chords. Choose another source voice.` };
    }
    const times = measureBoundaries(voice);
    const end = times.at(-1)!;
    const measures: GridMeasure[] = [];
    let measureDuration = voice.measureDuration;
    for (let index = 0; index < times.length - 1; index++) {
        const start = times[index], finish = times[index + 1];
        const events = voice.events.filter(event => event.time >= start && event.time < finish);
        for (const event of events) if (event.time === start && event.meter) measureDuration = event.meter.duration;
        // Parts and navigation are sometimes attached to another voice by abc2svg.
        const structural = snapshot.voices.flatMap(item => item.events)
            .filter(event => event.time >= start && event.time < finish)
            .flatMap(event => event.annotations.filter(annotation => ['part', 'ending', 'navigation'].includes(annotation.kind))
                .map(annotation => ({ ...annotation, time: event.time - start })));
        const annotations = events.flatMap(event => [
            ...event.annotations.filter(annotation => showTextInstructions || annotation.kind !== 'text')
                .map(annotation => ({ ...annotation, time: event.time - start })),
            ...(event.meter ? [{ time: event.time - start, text: event.meter.text, kind: 'meter' as const }] : [])
        ]);
        if (index === 0 && voice.meter) annotations.unshift({ time: 0, text: voice.meter, kind: 'meter' });
        for (const annotation of structural) {
            if (!annotations.some(item => item.kind === annotation.kind && item.text === annotation.text && item.time === annotation.time)) annotations.push(annotation);
        }
        const boundaryBar = (time: number) => {
            const bars = snapshot.voices.flatMap(item => item.events).filter(event => event.time === time && event.bar).map(event => event.bar!);
            return bars.find(bar => bar.startsWith(':') && bar.endsWith(':'))
                ?? (bars.some(bar => bar.startsWith(':')) && bars.some(bar => bar.endsWith(':')) ? ':|:' : undefined)
                ?? bars.find(bar => bar.includes(':')) ?? bars.find(bar => bar.includes(']') || bar.includes('[')) ?? bars[0] ?? '|';
        };
        const barStart = boundaryBar(start);
        const barEnd = boundaryBar(finish);
        measures.push({
            start, duration: finish - start,
            chords: events.flatMap(event => event.chords.map(text => ({ time: event.time - start, text }))),
            annotations, barStart, barEnd,
            sourceBreak: events.some(event => event.line),
            sectionBreak: index > 0 && (annotations.some(item => ['part', 'ending'].includes(item.kind)) || barStart.includes(':')),
            pickup: measureDuration > 0 && finish - start < measureDuration
                && (index === 0 || annotations.some(item => item.kind === 'part' && item.time === 0))
        });
    }
    for (const event of voice.events.filter(item => item.time === end)) {
        const last = measures.at(-1);
        if (last) last.annotations.push(...event.annotations.filter(item => item.kind !== 'ending' && (showTextInstructions || item.kind !== 'text')).map(item => ({ ...item, time: last.duration })));
    }
    return { ...base, measures: prepareGridMeasures(measures, repeatMeasures) };
}
