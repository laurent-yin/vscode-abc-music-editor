import { formatGridChord } from 'abctools/chord-grid';
import type { Model, MusicFont } from './renderer.js';

export const chordFont = 'ABCGridChord';
export const chordFontWeight = 700;
export const chordFontStyle = 'normal';

export function chordRuns(value: string, size = 32, repeat = false): { value: string; size: number; offset: number; role: string }[] {
    const parts = repeat ? undefined : formatGridChord(value);
    if (!parts) return [{ value, size: repeat ? size * 1.25 : size, offset: 0, role: 'literal' }];
    return [
        { value: parts.root, size, offset: 0, role: 'root' },
        ...(parts.suffix ? [{ value: parts.suffix, size: size * .75, offset: -size * 10 / 32, role: 'suffix' }] : []),
        ...(parts.bass ? [
            { value: '/', size: size * 26 / 32, offset: size * 3 / 32, role: 'slash' },
            { value: parts.bass, size: size * 26 / 32, offset: size * 7 / 32, role: 'bass' }
        ] : [])
    ];
}

export function chordGlyphs(run: { value: string; size: number; role: string }): { value: string; size: number; dx: number; spacing: number }[] {
    if (run.role === 'literal') return [{ value: run.value, size: run.size, dx: 0, spacing: 0 }];
    return run.value.split(/([\u266d-\u266f])/u).filter(Boolean).map(value => {
        const accidental = (run.role === 'root' || run.role === 'bass') && /^[\u266d-\u266f]$/u.test(value);
        return {
            value, size: run.size * (accidental ? .8 : 1), dx: accidental ? -run.size * .05 : 0,
            spacing: value === '\u266d' ? -run.size * .06 : 0
        };
    });
}

const styledFonts = new WeakMap<Model, WeakSet<MusicFont>>();

/** Use the engraving hook so the layout reserves the formatted label's actual bounds. */
export function useScoreChordFont(model: Model, font: MusicFont): void {
    font.name = chordFont;
    font.weight = chordFontWeight;
    font.style = chordFontStyle;
    let fonts = styledFonts.get(model);
    if (!fonts) {
        fonts = new WeakSet();
        const scoreFonts = fonts;
        styledFonts.set(model, fonts);
        const build = model.gch_build;
        const context = typeof document === 'undefined' ? undefined : document.createElement('canvas').getContext('2d');
        if (context === null) throw new Error('Cannot measure score chords: canvas context is unavailable.');
        model.gch_build = symbol => {
            const labels = (symbol.a_gch ?? []).filter(chord => chord.type === 'g' && scoreFonts.has(chord.font))
                .map(chord => ({ chord, value: String(chord.text) }));
            build.call(model, symbol);
            for (const { chord, value } of labels) {
                if (String(chord.text).includes('<tspan')) continue;
                const runs = chordRuns(value, chord.font.size);
                if (runs[0].role === 'literal') continue;
                let width = 0, ascent = 0, descent = 0, previous = 0;
                const spans = runs.map(run => {
                    const text = chordGlyphs(run).map(glyph => {
                        if (context) {
                            context.font = `${chordFontStyle} ${chordFontWeight} ${glyph.size}px ${chordFont}`;
                            const metrics = context.measureText(glyph.value);
                            width += metrics.width + glyph.dx + glyph.spacing;
                            ascent = Math.max(ascent, metrics.actualBoundingBoxAscent - run.offset);
                            descent = Math.max(descent, metrics.actualBoundingBoxDescent + run.offset);
                        } else {
                            model.set_font(chord.font);
                            width += model.strwh(glyph.value)[0] * glyph.size / chord.font.size + glyph.dx + glyph.spacing;
                            ascent = Math.max(ascent, glyph.size * .78 - run.offset);
                            descent = Math.max(descent, glyph.size * .22 + run.offset);
                        }
                        const value = glyph.value.replace(/[&<>"]/g, character => ({
                            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
                        })[character]!);
                        return glyph.dx || glyph.spacing
                            ? `<tspan class="${glyph.dx ? 'chord-accidental' : 'chord-alteration'}" font-size="${glyph.size}" dx="${glyph.dx}" letter-spacing="${glyph.spacing}">${value}</tspan>`
                            : value;
                    }).join('');
                    const dy = run.offset - previous;
                    previous = run.offset;
                    return `<tspan class="score-chord-${run.role}" font-size="${run.size}" dy="${dy.toFixed(3)}">${text}</tspan>`;
                }).join('');
                const height = ascent + descent;
                // abc2svg places the baseline at 22% of its reserved height.
                const text = new String(`<tspan class="score-chord" dy="${(height * .22 - descent).toFixed(3)}">${spans}</tspan>`);
                const wh: [number, number] = [width, height];
                chord.text = Object.assign(text, { wh });
                chord.x = -Math.min(width * .4, 8);
            }
        };
    }
    fonts.add(font);
}

export interface EngravedChordText {
    wh: [number, number];
    toString(): string;
}
