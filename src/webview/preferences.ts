import { instrumentKeys, validateChoices, validateTempo, voiceNotation } from '../shared/preferences.mjs';
import type { FileChoices, VoiceNotation } from '../shared/preferences.mjs';
import type { RenderMessage } from '../shared/protocol.js';
import type { PreviewPlan } from './renderer.js';
import { compactKeyLabel } from './renderer.js';
import { TempoPicker } from './tempoPicker.js';

const controlSelector = '#personal-controls input, #personal-controls button, #personal-controls select, #personal-controls textarea, .voice-panel input, .voice-panel button, .voice-panel select, #file-controls input, #file-controls select, #file-controls button';
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
}
export class PersonalControls {
    private message?: RenderMessage;
    private pending = false;
    private focusIndex = -1;
    private tempoPicker?: TempoPicker;
    constructor(private send: (message: unknown) => void, private setTempo: (tempo: number | undefined, original: number) => void) {
        document.addEventListener('keydown', event => {
            const panel = document.querySelector<HTMLElement>('#preferences-panel:popover-open, .voice-panel:popover-open, #tempo-picker:popover-open');
            if (event.key !== 'Escape' || !panel) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            panel.hidePopover();
            const toggle = panel.id === 'preferences-panel' ? 'preferences-toggle'
                : panel.id === 'tempo-picker' ? 'playback-tempo' : panel.id.replace('-voices', '-toggle');
            document.getElementById(toggle)?.focus();
        });
    }

    error(message: string): void {
        this.pending = false;
        document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>(controlSelector).forEach(control => control.disabled = false);
        const status = document.getElementById('preference-status')!;
        status.textContent = `Unsaved / unavailable: ${message}`;
        status.className = 'error';
        document.getElementById('preferences-panel')?.showPopover();
    }
    private save(action: 'file' | 'reset' | 'defaults', choices?: FileChoices): void {
        if (!this.message || this.pending) return;
        try {
            if (choices) validateChoices(choices);
            this.focusIndex = Array.from(document.querySelectorAll(controlSelector)).indexOf(document.activeElement!);
            this.pending = true;
            document.getElementById('preference-status')!.textContent = 'Saving personal preferences...';
            document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>(controlSelector).forEach(control => control.disabled = true);
            this.send({ command: 'preferences', documentId: this.message.documentId, revision: this.message.revision, action, choices });
        } catch (error) { this.error(String(error)); }
    }
    private edit(change: (choices: FileChoices) => void): void {
        if (!this.message) return;
        const choices = structuredClone(this.message.fileChoices);
        change(choices);
        this.save('file', choices);
    }
    refresh(choices: FileChoices): void {
        this.save('file', choices);
    }
    private editNotation(id: string | undefined, change: (settings: VoiceNotation) => void): void {
        this.edit(choices => {
            const notation = choices.notation ??= {};
            if (id === undefined) change(notation);
            else {
                const settings = { ...notation.voices?.[id] };
                change(settings);
                notation.voices = { ...notation.voices, [id]: settings };
                if (!Object.keys(settings).length) delete notation.voices[id];
            }
            if (notation.voices && !Object.keys(notation.voices).length) delete notation.voices;
            if (!Object.keys(notation).length) delete choices.notation;
        });
    }
    private button(text: string, action: () => void): HTMLButtonElement {
        const button = element('button', text);
        button.type = 'button';
        button.onclick = action;
        return button;
    }
    private label(text: string, control: HTMLElement): HTMLLabelElement {
        const label = element('label');
        label.append(document.createTextNode(text), control);
        return label;
    }
    render(message: RenderMessage, plan: Pick<PreviewPlan, 'inventories' | 'selections' | 'notices'>, firstSoundingKey?: string): void {
        this.tempoPicker?.dispose();
        this.message = message;
        this.pending = false;
        if (this.focusIndex < 0) this.focusIndex = Array.from(document.querySelectorAll(controlSelector)).indexOf(document.activeElement!);
        const root = document.getElementById('personal-controls')!;
        const open = Array.from(root.querySelectorAll('details'), details => details.open);
        const previousTune = (document.getElementById('playback-tune') as HTMLSelectElement | null)?.value;
        root.replaceChildren();
        const status = element('p', `${message.origin === 'file' ? 'File overrides' : 'Personal defaults'} — ${message.storageLabel}`);
        status.id = 'preference-status';
        status.setAttribute('role', 'status');
        root.append(status);
        const toolbar = element('div');
        toolbar.className = 'preferences-toolbar';
        const tuneSelect = element('select');
        tuneSelect.id = 'playback-tune';
        plan.inventories.forEach((tune, index) => tuneSelect.append(new Option(tune.title, String(index))));
        if (previousTune && Number(previousTune) < plan.inventories.length) tuneSelect.value = previousTune;
        tuneSelect.onchange = () => {
            document.getElementById('stop-btn')?.click();
            updateTempo();
        };
        toolbar.append(this.label('Play tune ', tuneSelect));
        const selector = (value: string | undefined, inherited: string, change?: (value: string) => void): HTMLSelectElement => {
            const select = element('select');
            select.append(new Option(inherited, ''));
            for (const key of instrumentKeys) select.append(new Option(key, key));
            select.value = value ?? '';
            if (change) select.onchange = () => change(select.value);
            return select;
        };
        const defaultsNotation = {
            ...(message.defaultChoices.notation.instrumentKey ? { instrumentKey: message.defaultChoices.notation.instrumentKey } : {}),
            ...(message.defaultChoices.notation.octaveShift === undefined ? {} : { octaveShift: message.defaultChoices.notation.octaveShift })
        };
        const fileControls = document.getElementById('file-controls')!;
        fileControls.replaceChildren();
        const fileKey = selector(message.fileChoices.notation?.instrumentKey,
            message.defaultChoices.notation.instrumentKey ?? '--', value => this.editNotation(undefined, notation => {
                if (value) notation.instrumentKey = instrumentKeys.find(key => key === value);
                else delete notation.instrumentKey;
            }));
        const selectedKey = fileKey.value;
        const inherited = element('optgroup');
        inherited.label = 'Default instrument';
        inherited.append(fileKey.options[0]);
        const overrides = element('optgroup');
        overrides.label = 'File override';
        overrides.append(...Array.from(fileKey.options));
        fileKey.replaceChildren(inherited, overrides);
        fileKey.value = selectedKey;
        fileKey.id = 'file-instrument-key';
        fileKey.setAttribute('aria-label', 'Instrument key for this file');
        fileKey.title = `Instrument key for this file: ${message.preferences.notation.instrumentKey ?? 'Source'} (${selectedKey ? 'file override' : 'inherited default'}; notation only)`;
        const keyLabel = element('label');
        keyLabel.className = 'file-control';
        const keyText = element('span', 'Instrument');
        keyText.className = 'header-label';
        keyLabel.append(keyText, fileKey);
        const song = element('input');
        song.id = 'song-transposition';
        song.type = 'number'; song.min = '-24'; song.max = '24'; song.step = '1';
        song.value = String(message.preferences.transposition.semitones);
        song.setAttribute('aria-label', 'Transpose this file (semitones; changes sound)');
        const soundingKey = firstSoundingKey ?? (message.preferences.transposition.semitones === 0 ? plan.inventories[0]?.key : undefined);
        song.title = `Transpose this file in semitones (notation and sound). ${soundingKey ? `First tune's initial sounding key: ${soundingKey}` : 'Updating sounding key...'}`;
        song.setAttribute('aria-describedby', 'song-key');
        song.onchange = () => this.edit(choices => { choices.transposition = { semitones: Number(song.value) }; });
        const keyOutput = element('output', `(${soundingKey ? compactKeyLabel(soundingKey) : '...'})`);
        keyOutput.id = 'song-key';
        keyOutput.setAttribute('for', song.id);
        keyOutput.title = soundingKey ?? 'Updating sounding key...';
        const songBox = element('span');
        songBox.className = 'transposition-box';
        songBox.append(song, keyOutput);
        const songLabel = element('label');
        songLabel.className = 'file-control';
        const songText = element('span', 'Transpose');
        songText.className = 'header-label';
        songLabel.append(songText, songBox);
        const tempo = element('input');
        tempo.id = 'playback-tempo';
        tempo.type = 'number'; tempo.min = '1'; tempo.step = '1';
        tempo.placeholder = '--';
        tempo.value = message.preferences.tempo === undefined ? '' : String(message.preferences.tempo);
        tempo.setAttribute('aria-label', 'Playback tempo (BPM; blank uses original)');
        tempo.setAttribute('aria-describedby', 'original-tempo tempo-error');
        const originalTempo = element('output');
        originalTempo.id = 'original-tempo';
        originalTempo.setAttribute('for', tempo.id);
        const tempoError = element('span');
        tempoError.id = 'tempo-error'; tempoError.className = 'error';
        tempoError.setAttribute('role', 'alert');
        tempoError.hidden = true;
        const updateTempo = (): boolean => {
            const original = plan.inventories[Number(tuneSelect.value)]?.tempo ?? 120;
            originalTempo.textContent = `Original: ${original} BPM`;
            let value: number | undefined;
            try {
                if (tempo.validity.badInput) throw new Error('Enter a whole-number tempo of at least 1 BPM.');
                value = tempo.value === '' ? undefined : tempo.valueAsNumber;
                validateTempo(value);
                tempo.setCustomValidity('');
                tempo.removeAttribute('aria-invalid');
                tempoError.hidden = true;
                this.setTempo(value, original);
                return true;
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                tempo.setCustomValidity(reason);
                tempo.setAttribute('aria-invalid', 'true');
                tempoError.textContent = reason;
                tempoError.hidden = false;
                return false;
            }
        };
        tempo.oninput = () => { updateTempo(); };
        tempo.onchange = () => {
            if (!updateTempo()) { tempo.reportValidity(); return; }
            this.edit(choices => {
                if (tempo.value === '') delete choices.tempo;
                else choices.tempo = tempo.valueAsNumber;
            });
        };
        tempo.title = 'Playback BPM in the initial Q: beat unit (quarter note if omitted). Blank restores the original tempo. Later tempo changes scale proportionally.';
        const tempoLabel = element('span');
        tempoLabel.className = 'file-control tempo-control';
        const tempoText = element('label', 'Tempo');
        tempoText.htmlFor = tempo.id;
        tempoText.className = 'header-label';
        this.tempoPicker = new TempoPicker(tempo, () => plan.inventories[Number(tuneSelect.value)]?.tempo ?? 120);
        tempoLabel.append(tempoText, this.tempoPicker.element, originalTempo, tempoError);
        fileControls.append(keyLabel, songLabel, tempoLabel);
        updateTempo();
        for (const operation of ['display', 'playback'] as const) {
            const panel = document.getElementById(`${operation}-voices`)!;
            panel.replaceChildren(element('strong', operation === 'display' ? 'Display voices' : 'Playback voices'));
            const ids = [...new Set(plan.inventories.flatMap(tune => tune.voices.map(voice => voice.id)))];
            panel.append(this.button('All', () => this.edit(choices => {
                choices[operation] = { selectedVoiceIds: ids, knownVoiceIds: ids, chords: true };
            })));
            const checkboxes: HTMLInputElement[] = [];
            const selectedNames = new Set<string>();
            plan.inventories.forEach((tune, index) => {
                const group = element('fieldset');
                if (plan.inventories.length > 1) group.append(element('legend', tune.title));
                const labels = tune.voices.map(voice => voice.name || voice.shortName || voice.id);
                tune.voices.forEach((voice, voiceIndex) => {
                    const checkbox = element('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = voice.id;
                    checkbox.checked = plan.selections[index][operation].ids.includes(voice.id);
                    if (checkbox.checked) selectedNames.add(labels[voiceIndex]);
                    checkboxes.push(checkbox);
                    checkbox.onchange = () => {
                        for (const other of checkboxes) if (other.value === checkbox.value) other.checked = checkbox.checked;
                        const selected = [...new Set(checkboxes.filter(input => input.checked).map(input => input.value))];
                        this.edit(choices => { choices[operation] = {
                            selectedVoiceIds: selected, knownVoiceIds: ids,
                            chords: message.preferences[operation].chords ?? true
                        }; });
                    };
                    const name = labels[voiceIndex];
                    const row = element('div');
                    row.className = 'voice-row';
                    row.append(this.label(`${name}${name !== voice.id || labels.filter(label => label === name).length > 1 ? ` (${voice.id})` : ''} `, checkbox));
                    if (operation === 'display') {
                        const voiceKey = selector(message.preferences.notation.voices?.[voice.id]?.instrumentKey,
                            `${message.preferences.notation.instrumentKey ?? 'Source'} (file key)`, value => this.editNotation(voice.id, settings => {
                                if (value) settings.instrumentKey = instrumentKeys.find(key => key === value);
                                else delete settings.instrumentKey;
                            }));
                        voiceKey.setAttribute('aria-label', `${name} (${voice.id}): instrument key`);
                        const keyLabel = this.label('Instrument ', voiceKey);
                        keyLabel.className = 'voice-notation';
                        const octaves = element('input');
                        octaves.type = 'number'; octaves.min = '-2'; octaves.max = '2'; octaves.step = '1';
                        octaves.value = String(voiceNotation(message.preferences.notation, voice.id).octaveShift ?? 0);
                        octaves.setAttribute('aria-label', `${name} (${voice.id}): written octave shift`);
                        octaves.onchange = () => this.editNotation(voice.id, settings => {
                            settings.octaveShift = Number(octaves.value);
                        });
                        const octaveLabel = this.label('Octave ', octaves);
                        octaveLabel.className = 'voice-notation';
                        row.append(keyLabel, octaveLabel);
                    }
                    group.append(row);
                });
                panel.append(group);
            });
            const chords = element('input');
            chords.type = 'checkbox';
            chords.checked = message.preferences[operation].chords ?? true;
            if (chords.checked) selectedNames.add('Chords');
            chords.onchange = () => this.edit(choices => {
                choices[operation] = {
                    selectedVoiceIds: [...new Set(plan.selections.flatMap(selection => selection[operation].ids))],
                    knownVoiceIds: ids, chords: chords.checked
                };
            });
            panel.append(this.label('Chords ', chords));
            const toggle = document.getElementById(`${operation}-toggle`)!;
            const summary = [...selectedNames].join(', ') || 'None';
            toggle.textContent = `${operation === 'display' ? 'Display' : 'Playback'}: ${summary}`;
            toggle.title = toggle.textContent;
            const defaults = element('details');
            defaults.append(element('summary', `${operation === 'display' ? 'Display' : 'Playback'} defaults`));
            const pattern = element('input');
            pattern.type = 'text';
            pattern.placeholder = '*bass*; *counterpoint*';
            pattern.value = message.defaultChoices[operation].hideVoicesMatching ?? '';
            const defaultChords = element('input');
            defaultChords.type = 'checkbox';
            defaultChords.checked = message.defaultChoices[operation].chords ?? true;
            defaults.append(this.label(operation === 'display' ? 'By default, hide voices matching ' : 'By default, mute voices matching ', pattern));
            defaults.append(element('small', `Separate patterns with ;. Matches voice IDs and names, ignoring case. * matches any text; ? matches one character. Leave blank to ${operation === 'display' ? 'display' : 'play'} all voices.`));
            defaults.append(this.label(operation === 'display' ? 'Display chords by default ' : 'Play chords by default ', defaultChords));
            defaults.append(this.button('Save defaults', () => this.save('defaults', {
                display: message.defaultChoices.display,
                playback: message.defaultChoices.playback,
                notation: defaultsNotation,
                [operation]: { hideVoicesMatching: pattern.value.trim(), chords: defaultChords.checked }
            })));
            toolbar.append(defaults);
        }
        const defaultKey = selector(message.defaultChoices.notation.instrumentKey, 'Source');
        toolbar.append(this.label('Default instrument key ', defaultKey));
        toolbar.append(this.button('Save default instrument key', () => {
            const notation = { ...defaultsNotation };
            if (defaultKey.value) notation.instrumentKey = instrumentKeys.find(key => key === defaultKey.value);
            else delete notation.instrumentKey;
            this.save('defaults', {
                display: message.defaultChoices.display,
                playback: message.defaultChoices.playback,
                notation
            });
        }));
        toolbar.append(element('small', 'Instrument keys change notation only. Set file and per-voice keys in the header and Display menu. Transposition changes notation and sound; set it to 0 to reset.'));
        root.append(toolbar);
        root.append(element('p', `Sounding keys: ${plan.inventories.map(tune => `${tune.title}: ${tune.key}`).join('; ')}`));
        root.append(this.button('Reset this file to defaults', () => this.save('reset')));
        root.append(this.button('Choose preferences folder', () => this.send({ command: 'choosePreferences' })));
        root.append(this.button('Reload preferences', () => this.send({ command: 'reloadPreferences' })));
        const notices = element('ul');
        notices.setAttribute('aria-label', 'Preview notices');
        for (const notice of [...new Set(plan.notices)]) notices.append(element('li', notice));
        if (Object.keys(message.defaultChoices.notation.voices ?? {}).length) {
            notices.append(element('li', 'Saving defaults replaces legacy voice-specific default notation. Set those instrument keys per file in Display instead.'));
        }
        root.append(notices);
        root.querySelectorAll('details').forEach((details, index) => { details.open = open[index] ?? false; });
        const focus = document.querySelectorAll<HTMLElement>(controlSelector)[this.focusIndex];
        focus?.focus();
        this.focusIndex = -1;
    }
}
