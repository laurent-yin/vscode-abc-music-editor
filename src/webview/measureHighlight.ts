const ns = 'http://www.w3.org/2000/svg';

/** Build backgrounds in SVG coordinates, behind the engraved music. */
export function mountMeasureHighlights(sheet: HTMLElement): void {
    for (const svg of sheet.querySelectorAll<SVGSVGElement>('svg')) {
        const inverse = svg.getScreenCTM()?.inverse();
        if (!inverse) continue;
        const bounds = (element: SVGGraphicsElement) => {
            const box = element.getBoundingClientRect();
            const from = new DOMPoint(box.left, box.top).matrixTransform(inverse);
            const to = new DOMPoint(box.right, box.bottom).matrixTransform(inverse);
            return { left: from.x, right: to.x, top: from.y, bottom: to.y };
        };
        const notes = [...svg.querySelectorAll<SVGRectElement>('[data-playback-measure]')]
            .filter(note => note.ownerSVGElement === svg);
        if (!notes.length) continue;
        const boxes = notes.map(bounds);
        const top = Math.min(...boxes.map(box => box.top));
        const bottom = Math.max(...boxes.map(box => box.bottom));
        const bars = new Map<string, number>();
        for (const bar of svg.querySelectorAll<SVGRectElement>('[data-playback-boundary]')) {
            bars.set(bar.dataset.playbackBoundary!, bounds(bar).left);
        }
        const layer = document.createElementNS(ns, 'g');
        layer.setAttribute('class', 'measure-backgrounds');
        layer.setAttribute('pointer-events', 'none');
        layer.setAttribute('aria-hidden', 'true');
        for (const key of new Set(notes.map(note => note.dataset.playbackMeasure!))) {
            const [tune, start, end] = key.split(':');
            const members = boxes.filter((_box, index) => notes[index].dataset.playbackMeasure === key);
            const left = bars.get(`${tune}:${start}`) ?? Math.min(...members.map(box => box.left)) - 4;
            const right = bars.get(`${tune}:${end}`) ?? Math.max(...members.map(box => box.right)) + 4;
            const rect = document.createElementNS(ns, 'rect');
            for (const [name, value] of Object.entries({
                x: left, y: top, width: Math.max(0, right - left), height: bottom - top,
                'data-measure-highlight': key, class: 'measure-highlight'
            })) rect.setAttribute(name, String(value));
            layer.append(rect);
        }
        svg.insertBefore(layer, svg.firstChild);
    }
}

export function highlightMeasure(sheet: HTMLElement, key?: string, sourceIndex?: number): void {
    for (const marker of sheet.querySelectorAll<SVGElement>('[data-measure-highlight], .chord-grid .abcr')) {
        const active = marker.hasAttribute('data-measure-highlight')
            ? key !== undefined && marker.dataset.measureHighlight === key
            : sourceIndex !== undefined && marker.classList.contains(`_${sourceIndex}_`);
        marker.classList.toggle('measure-playing', active);
    }
}
