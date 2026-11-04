import { validateTempo } from '../shared/preferences.mjs';

const radius = 50;
const rowHeight = 28;

export function tempoChoices(current: number): number[] {
    validateTempo(current);
    return [...new Set(Array.from({ length: radius * 2 + 1 }, (_, index) => current + (index - radius)))]
        .filter(value => value >= 1 && Number.isFinite(value));
}
export function steppedTempo(current: number | undefined, original: number, direction: 1 | -1): number {
    validateTempo(current);
    validateTempo(original);
    return Math.max(1, (current ?? original) + direction);
}

export class TempoPicker {
    readonly element = document.createElement('span');
    private popup = document.getElementById('tempo-picker')!;
    private list = document.createElement('div');
    private reset = document.createElement('button');
    private controller = new AbortController();
    private values: number[] = [];

    constructor(private input: HTMLInputElement, private original: () => number) {
        const signal = this.controller.signal;
        this.element.className = 'tempo-input';
        const steps = document.createElement('span');
        steps.className = 'tempo-steps';
        for (const direction of [1, -1] as const) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = direction === 1 ? '+' : '-';
            button.setAttribute('aria-label', direction === 1 ? 'Increase tempo' : 'Decrease tempo');
            button.addEventListener('pointerdown', event => event.preventDefault(), { signal });
            button.addEventListener('click', () => this.step(direction), { signal });
            steps.append(button);
        }
        this.element.append(input, steps);
        input.setAttribute('aria-controls', this.popup.id);
        input.setAttribute('aria-haspopup', 'listbox');
        input.setAttribute('aria-expanded', 'false');
        input.addEventListener('click', () => this.show(), { signal });
        input.addEventListener('input', () => {
            if (input.validity.valid && this.popup.matches(':popover-open')) this.render(this.current());
        }, { signal });
        input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' && event.altKey) {
                event.preventDefault();
                this.show();
                this.list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                this.step(event.key === 'ArrowUp' ? 1 : -1);
            } else if (event.key === 'Escape' && this.popup.matches(':popover-open')) {
                this.escape(event);
            }
        }, { signal });
        this.popup.addEventListener('toggle', () => {
            input.setAttribute('aria-expanded', String(this.popup.matches(':popover-open')));
        }, { signal });
        this.popup.addEventListener('keydown', event => {
            if (event.key === 'Escape') { this.escape(event); return; }
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.dataset.tempo) return;
            const offsets: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -9, PageDown: 9 };
            const offset = offsets[event.key];
            let value: number;
            if (event.key === 'Home') value = 1;
            else {
                if (offset === undefined) return;
                value = Math.max(1, Number(target.dataset.tempo) + offset);
            }
            event.preventDefault();
            if (!this.values.includes(value)) this.render(value);
            this.list.querySelector<HTMLElement>(`[data-tempo="${value}"]`)?.focus({ preventScroll: true });
            this.list.querySelector<HTMLElement>(`[data-tempo="${value}"]`)?.scrollIntoView({ block: 'nearest' });
        }, { signal });
        this.list.className = 'tempo-options';
        this.list.setAttribute('role', 'listbox');
        this.list.setAttribute('aria-label', 'Tempo values in BPM');
        this.list.addEventListener('pointerdown', event => {
            if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
        }, { signal });
        this.list.addEventListener('click', event => {
            if (!(event.target instanceof Element)) return;
            const option = event.target.closest<HTMLButtonElement>('button[data-tempo]');
            if (option?.dataset.tempo) this.choose(Number(option.dataset.tempo));
        }, { signal });
        this.list.addEventListener('scroll', () => {
            const index = Math.max(0, Math.min(this.values.length - 1, Math.round(this.list.scrollTop / rowHeight)));
            if ((index < radius / 2 && this.values[0] > 1) || index > this.values.length - 1 - radius / 2) {
                const anchor = this.values[index];
                const remainder = this.list.scrollTop - index * rowHeight;
                this.render(anchor, remainder);
            }
        }, { signal });
        const reset = this.reset;
        reset.type = 'button';
        reset.className = 'tempo-original';
        reset.textContent = `Original (${original()} BPM)`;
        reset.addEventListener('pointerdown', event => event.preventDefault(), { signal });
        reset.addEventListener('click', () => this.choose(undefined), { signal });
        this.popup.replaceChildren(reset, this.list);
    }

    private current(): number {
        return this.input.value === '' || !this.input.validity.valid ? this.original() : this.input.valueAsNumber;
    }
    private step(direction: 1 | -1): void {
        if (this.input.disabled) return;
        if (!this.input.validity.valid) { this.input.reportValidity(); return; }
        this.choose(steppedTempo(this.input.value === '' ? undefined : this.input.valueAsNumber, this.original(), direction));
    }
    private choose(value: number | undefined): void {
        if (this.input.disabled) return;
        if (this.popup.matches(':popover-open')) this.popup.hidePopover();
        this.input.value = value === undefined ? '' : String(value);
        this.input.focus({ preventScroll: true });
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    private show(): void {
        if (this.input.disabled || this.popup.matches(':popover-open')) return;
        this.reset.textContent = `Original (${this.original()} BPM)`;
        this.popup.showPopover();
        this.input.setAttribute('aria-expanded', 'true');
        const bounds = this.input.getBoundingClientRect();
        const popup = this.popup.getBoundingClientRect();
        this.popup.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - popup.width - 8))}px`;
        this.popup.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, innerHeight - popup.height - 8))}px`;
        this.list.style.paddingBlock = `${Math.max(0, (this.list.clientHeight - rowHeight) / 2)}px`;
        this.render(this.current());
    }
    private render(center: number, remainder = 0): void {
        const focused = this.list.contains(document.activeElement) && document.activeElement instanceof HTMLElement
            ? document.activeElement.dataset.tempo : undefined;
        this.values = tempoChoices(center);
        this.list.replaceChildren(...this.values.map(value => {
            const option = document.createElement('button');
            option.type = 'button';
            option.textContent = `${value} BPM`;
            option.dataset.tempo = String(value);
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(value === this.current()));
            option.tabIndex = value === this.current() ? 0 : -1;
            return option;
        }));
        this.list.scrollTop = this.values.indexOf(center) * rowHeight + remainder;
        if (focused) this.list.querySelector<HTMLElement>(`[data-tempo="${focused}"]`)?.focus({ preventScroll: true });
    }
    private escape(event: KeyboardEvent): void {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.popup.hidePopover();
        this.input.focus({ preventScroll: true });
    }
    dispose(): void {
        this.controller.abort();
        if (this.popup.matches(':popover-open')) this.popup.hidePopover();
    }
}
