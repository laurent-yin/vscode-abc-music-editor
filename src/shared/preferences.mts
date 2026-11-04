import * as tools from 'abctools/preferences';

export * from 'abctools/preferences';
export interface FileChoices extends tools.FileChoices { tempo?: number }
export interface Preferences extends tools.Preferences { files?: Record<string, FileChoices> }
export interface EffectiveChoices extends tools.EffectiveChoices { tempo?: number }

export function validateTempo(value: unknown): asserts value is number | undefined {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 1)) {
        throw new Error('Tempo must be a whole number of at least 1 BPM, or blank for the original tempo.');
    }
}
function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stripTempo(choices: FileChoices): tools.FileChoices {
    const result = { ...choices };
    delete result.tempo;
    return result;
}
export function validateChoices(value: unknown, perFile = true, location = 'choices'): FileChoices {
    if (!record(value) || !('tempo' in value)) return tools.validateChoices(value, perFile, location);
    if (!perFile) throw new Error(`Unknown preference: ${location}.tempo (tempo is file-only)`);
    const { tempo, ...choices } = value;
    validateTempo(tempo);
    return { ...tools.validateChoices(choices, perFile, location), ...(tempo === undefined ? {} : { tempo }) };
}
function withoutTempo(value: Preferences): tools.Preferences {
    return {
        ...value,
        ...(value.files === undefined ? {} : {
            files: Object.fromEntries(Object.entries(value.files).map(([key, choices]) => [key, stripTempo(choices)]))
        })
    };
}
export function validatePreferences(value: unknown): Preferences {
    if (!record(value) || !record(value.files)) return tools.validatePreferences(value);
    const files = Object.fromEntries(Object.entries(value.files).map(([key, choices]) => [key, validateChoices(choices, true, `files.${key}`)]));
    const plainFiles = Object.fromEntries(Object.entries(files).map(([key, choices]) => [key, stripTempo(choices)]));
    const validated = tools.validatePreferences({ ...value, files: plainFiles });
    return { ...validated, files };
}
export function parsePreferences(text: string): Preferences {
    return validatePreferences(JSON.parse(text));
}
export function serializePreferences(value: Preferences): string {
    return `${JSON.stringify(validatePreferences(value), null, 2)}\n`;
}
export function resolvePreferences(value: Preferences, resourceKey: string): EffectiveChoices {
    const validated = validatePreferences(value);
    const effective = tools.resolvePreferences(withoutTempo(validated), resourceKey);
    const tempo = validated.files?.[resourceKey]?.tempo;
    return { ...effective, ...(tempo === undefined ? {} : { tempo }) };
}
