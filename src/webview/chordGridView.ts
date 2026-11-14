import { formatGridChord, layoutGridRows } from 'abctools/chord-grid';
import type { ChordGridSettings } from 'abctools/preferences';
import type { ChordGrid } from './chordGridModel.js';

const ns = 'http://www.w3.org/2000/svg';
const chordFont = 'ABCGridChord';

export async function loadChordGridFont(): Promise<void> {
    const faces = await document.fonts.load(`32px ${chordFont}`, 'Bm7(\u266d5)/F\u266f');
    if (!faces.length) throw new Error('The bundled chord grid font is unavailable.');
}

/** Fit the complete grid page, not just individual rows, into the score area. */
export function fitChordGridPage(sheet: HTMLElement, onResize: () => void): () => void {
    const page = document.createElement('div');
    page.className = 'grid-page';
    page.append(...sheet.childNodes);
    sheet.append(page);
    let frame = 0;
    const fit = () => {
        frame = 0;
        page.style.width = `${sheet.clientWidth}px`;
        page.style.zoom = '1';
        const height = page.offsetHeight;
        const width = Math.max(page.scrollWidth, sheet.clientWidth);
        page.style.zoom = String(Math.min(1,
            Math.max(0, sheet.clientWidth - 1) / Math.max(1, width),
            Math.max(0, sheet.clientHeight - 1) / Math.max(1, height)));
        onResize();
    };
    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(fit);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(sheet);
    observer.observe(page);
    fit();
    return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
    };
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
}
function text(value: string, x: number, y: number, size: number): SVGTextElement {
    const node = svg('text', { x, y, 'font-size': size });
    const marks: Record<string, [string, string]> = {
        '\u{1d10b}': ['\ue047', 'Segno'], '\u{1d10c}': ['\ue048', 'Coda']
    };
    const mark = marks[value];
    node.textContent = mark?.[0] ?? value;
    if (mark) {
        node.setAttribute('font-family', 'ABCGridMusic');
        node.setAttribute('font-size', '26');
        node.setAttribute('aria-label', mark[1]);
    }
    return node;
}
function bar(x: number, y: number, height: number, type: string, side: 'start' | 'end'): SVGGElement {
    const group = svg('g', { stroke: 'currentColor', fill: 'currentColor' });
    const line = (position: number, width = 1.5) => group.append(svg('path', { d: `M${position} ${y}v${height}`, 'stroke-width': width }));
    line(x);
    if (type.includes(']') || type.includes('[') || type.includes('||')) line(x + (side === 'start' ? 4 : -4), 3);
    if (type.includes(':')) {
        const dots = (position: number) => {
            for (const offset of [-5, 5]) group.append(svg('circle', { cx: position, cy: y + height / 2 + offset, r: 2 }));
        };
        if (type.startsWith(':')) dots(x - 7);
        if (type.endsWith(':')) dots(x + 7);
    }
    return group;
}

export function mountChordGrid(host: HTMLElement, grid: ChordGrid, settings: ChordGridSettings, onResize: () => void): () => void {
    host.className = 'chord-grid';
    const title = document.createElement('h2');
    title.textContent = grid.title;
    host.append(title);
    if (grid.composer) {
        const composer = document.createElement('p');
        composer.className = 'grid-composer';
        composer.textContent = grid.composer;
        host.append(composer);
    }
    if (grid.message) {
        const message = document.createElement('p');
        message.setAttribute('role', 'status');
        message.textContent = grid.message;
        host.append(message);
        return () => {};
    }
    const viewport = document.createElement('div');
    viewport.className = 'grid-viewport';
    host.append(viewport);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cannot measure chord grid text: canvas context is unavailable.');
    const measureText = (value: string, size: number, family = 'sans-serif') => {
        context.font = `${size}px ${family}`;
        return context.measureText(value).width;
    };
    const chordRuns = (value: string, repeat: boolean) => {
        const parts = repeat ? undefined : formatGridChord(value);
        if (!parts) return [{ value, size: repeat ? 40 : 32, offset: 0, role: 'literal' }];
        return [
            { value: parts.root, size: 32, offset: 0, role: 'root' },
            ...(parts.suffix ? [{ value: parts.suffix, size: 24, offset: -10, role: 'suffix' }] : []),
            ...(parts.bass ? [
                { value: '/', size: 26, offset: 3, role: 'slash' },
                { value: parts.bass, size: 26, offset: 7, role: 'bass' }
            ] : [])
        ];
    };
    const chordWidth = (value: string, repeat: boolean) => chordRuns(value, repeat)
        .reduce((width, run) => width + measureText(run.value, run.size, chordFont), 0);
    const widths = grid.measures.map(measure => {
        let width = 100;
        const chords = measure.repeat ? [{ time: 0, text: '%' }] : measure.chords;
        for (const [index, chord] of chords.entries()) {
            const next = chords.slice(index + 1).find(item => item.time > chord.time)?.time ?? measure.duration;
            const fraction = Math.max((next - chord.time) / measure.duration, 0.02);
            width = Math.max(width, (chordWidth(chord.text, measure.repeat) + 16) / fraction + 24);
        }
        for (const annotation of measure.annotations) {
            const fraction = annotation.time >= measure.duration ? 1 : Math.max(1 - annotation.time / measure.duration, .15);
            width = Math.max(width, (measureText(annotation.text, 17) + 12) / fraction + 24);
        }
        return Math.ceil(width);
    });
    let previousWidth = -1;
    const draw = () => {
        const available = Math.max(100, Math.floor(Math.min(host.clientWidth, document.documentElement.clientWidth)) - 16);
        if (available === previousWidth) return;
        previousWidth = available;
        viewport.replaceChildren();
        const rows = layoutGridRows(grid.measures, widths, available, settings.layout);
        const minimums = rows.map(indices => indices.reduce((sum, index) => sum + widths[index], 0));
        const rowWidth = Math.max(available, ...minimums);
        for (const [rowIndex, indices] of rows.entries()) {
            const extra = (rowWidth - minimums[rowIndex]) / indices.length;
            const lanes = Math.max(0, ...indices.map(index => grid.measures[index].annotations.length));
            const stacks = Math.max(1, ...indices.flatMap(index => {
                const counts = new Map<number, number>();
                for (const chord of grid.measures[index].repeat ? [] : grid.measures[index].chords) counts.set(chord.time, (counts.get(chord.time) ?? 0) + 1);
                return [...counts.values()];
            }));
            const top = 12 + lanes * 24;
            const barHeight = 48 + (stacks - 1) * 44;
            const height = top + barHeight + 16;
            const row = svg('svg', { width: rowWidth + 16, height, viewBox: `0 0 ${rowWidth + 16} ${height}`, role: 'group', 'aria-label': 'Chord grid row' });
            let x = 8;
            for (const index of indices) {
                const measure = grid.measures[index];
                const width = widths[index] + extra;
                const cell = svg('g', { class: 'grid-cell', 'data-measure': index, 'data-pickup': String(!!measure.pickup), 'aria-label': `Measure ${index + 1}: ${measure.pickup ? 'pickup' : measure.chords.map(chord => chord.text).join(', ') || 'no harmony'}` });
                if (index === indices[0]) cell.append(bar(x, top, barHeight, measure.barStart, 'start'));
                cell.append(bar(x + width, top, barHeight, measure.barEnd, 'end'));
                // At a row boundary, the next row draws the opening repeat.
                if (measure.barStart.endsWith(':') && index !== indices[0]) cell.append(bar(x, top, barHeight, '|:', 'start'));
                measure.annotations.forEach((annotation, lane) => {
                    const ax = annotation.time >= measure.duration
                        ? x + width - 12 - measureText(annotation.text, 17)
                        : x + 12 + Math.min(annotation.time / measure.duration, .85) * (width - 24);
                    const ay = 20 + lane * 24;
                    if (annotation.kind === 'part') {
                        cell.append(svg('rect', { x: ax - 3, y: ay - 17, width: measureText(annotation.text, 17) + 6, height: 22, fill: 'none', stroke: 'currentColor' }));
                    }
                    if (annotation.kind === 'ending') cell.append(svg('path', { d: `M${ax - 3} ${ay + 3}v-21h${width - 24}`, fill: 'none', stroke: 'currentColor' }));
                    cell.append(text(annotation.text, ax, ay, 17));
                });
                const chords = measure.repeat ? [{ time: 0, text: '%' }] : measure.chords;
                const stack = new Map<number, number>();
                for (const chord of chords) {
                    const cx = x + 12 + chord.time / measure.duration * (width - 24);
                    const level = stack.get(chord.time) ?? 0;
                    stack.set(chord.time, level + 1);
                    const baseline = top + 32 + level * 44;
                    const label = svg('text', { class: 'grid-chord', 'font-family': chordFont,
                        'font-size': 32, 'aria-label': chord.text, 'data-chord': chord.text });
                    let position = cx;
                    for (const run of chordRuns(chord.text, measure.repeat)) {
                        const span = svg('tspan', { class: `grid-chord-${run.role}`, x: position,
                            y: baseline + run.offset, 'font-size': run.size });
                        span.textContent = run.value;
                        label.append(span);
                        position += measureText(run.value, run.size, chordFont);
                    }
                    cell.append(label);
                }
                const ids = measure.sourceIds ?? [];
                const marker = svg('rect', {
                    class: `abcr ${ids.map(id => `_${id}_`).join(' ')}`,
                    x, y: 1, width, height: height - 2,
                    fill: 'transparent', 'data-grid-ids': ids.join(','),
                    'data-grid-source': grid.sourceId
                });
                const description = svg('title');
                description.textContent = ids.length ? cell.getAttribute('aria-label') : `${cell.getAttribute('aria-label')}. No separate playback event; use full-tune playback for this passage.`;
                marker.append(description);
                cell.prepend(marker);
                row.append(cell);
                x += width;
            }
            viewport.append(row);
        }
        onResize();
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
}
