import type { EffectiveChoices, FileChoices } from 'abctools/preferences' with { "resolution-mode": "import" };

export interface RenderMessage {
    command: 'render';
    documentId: string;
    revision: number;
    resourceKey: string;
    content: string;
    preferences: EffectiveChoices;
    defaultChoices: EffectiveChoices;
    fileChoices: FileChoices;
    origin: 'defaults' | 'file';
    storageLabel: string;
}
export interface PreferenceMessage {
    command: 'preferences';
    documentId: string;
    revision: number;
    action: 'file' | 'defaults' | 'reset';
    choices?: FileChoices;
}
export interface PreferenceError { command: 'preferenceError'; message: string }
