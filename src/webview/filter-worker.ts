import type { EffectiveChoices, VoiceDescriptor } from 'abctools/preferences';

// The shared core is prepended to this worker's blob by the webview.
declare const resolveVoiceFilter: typeof import('abctools/preferences').resolveVoiceFilter;

self.onmessage = (event: MessageEvent<{ choices: EffectiveChoices; voices: VoiceDescriptor[][] }>) => {
    try {
        const results = event.data.voices.map(voices => ({
            display: resolveVoiceFilter(event.data.choices.display, voices),
            playback: resolveVoiceFilter(event.data.choices.playback, voices)
        }));
        self.postMessage({ results });
    } catch (error) { self.postMessage({ error: String(error) }); }
};
