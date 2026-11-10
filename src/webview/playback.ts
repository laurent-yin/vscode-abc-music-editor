import type { RenderMessage } from '../shared/protocol.js';
import type { MusicSymbol, MusicVoice, PreviewPlan } from './renderer.js';

interface Playback {
    conf: { voiceMixer?: VoiceMixer };
    ac?: AudioContext;
    gain?: AudioNode;
    op?: Pick<MIDIOutput, 'send'>;
    v_c: number[];
    c_i: number[];
    stop?: boolean;
    onend(repv?: number): void;
    note_run(playback: Playback, symbol: MusicSymbol, key: number, time: number, duration: number): void;
}
interface Scheduler { play_next(playback: Playback): void }
interface MidiNote {
    voice: MusicVoice;
    start: number;
    end: number;
    key: number;
    pitch(): number;
    sounding: boolean;
    play(time: number, duration: number): boolean;
    stop(): void;
}
interface AudioNote {
    source: AudioBufferSourceNode;
    detune: number;
}
interface Session {
    ended: boolean;
    gates: Map<MusicVoice, GainNode>;
    notes: Set<MidiNote>;
    sources: Set<AudioNote>;
    timers: Set<ReturnType<typeof setTimeout>>;
}

export function canRetainPlayback(previous: RenderMessage | undefined, next: RenderMessage, plan: PreviewPlan | undefined): boolean {
    return !!previous && !!plan && !plan.fallback
        && previous.documentId === next.documentId && previous.resourceKey === next.resourceKey
        && previous.content === next.content;
}

// Adapt the exposed scheduler entry point, without changing the bundled engine.
// Only players explicitly configured with our mixer use this routing.
export function installVoiceMixer(engine: Scheduler): void {
    const schedule = engine.play_next;
    engine.play_next = function(playback) {
        playback.conf.voiceMixer?.attach(playback);
        schedule.call(this, playback);
    };
}

export class VoiceMixer {
    private enabled = new Map<MusicVoice, boolean>();
    private sessions = new Set<Session>();
    private attached = new WeakSet<Playback>();
    private semitones = 0;

    update(enabled: Map<MusicVoice, boolean>, semitones = this.semitones): void {
        this.enabled = enabled;
        this.semitones = semitones;
        for (const session of this.sessions) {
            for (const [voice, gate] of session.gates) {
                gate.gain.setTargetAtTime(this.isEnabled(voice) ? 1 : 0, gate.context.currentTime, 0.005);
            }
            for (const note of session.sources) {
                note.source.detune.setValueAtTime(note.detune + semitones * 100, note.source.context.currentTime);
            }
            const now = performance.now() / 1000;
            for (const note of session.notes) {
                if (note.sounding && (!this.isEnabled(note.voice) || note.key !== note.pitch())) {
                    note.stop();
                    note.sounding = false;
                }
                if (this.isEnabled(note.voice) && !note.sounding && now >= note.start && now < note.end) {
                    note.sounding = note.play(now, note.end - now);
                }
            }
        }
    }

    private isEnabled(voice: MusicVoice): boolean {
        return this.enabled.get(voice) !== false;
    }

    private close(session: Session): void {
        for (const timer of session.timers) clearTimeout(timer);
        for (const note of session.notes) if (note.sounding) note.stop();
        for (const gate of session.gates.values()) gate.disconnect();
        session.notes.clear();
        session.sources.clear();
        session.timers.clear();
        this.sessions.delete(session);
    }

    clear(): void {
        for (const session of this.sessions) this.close(session);
    }

    attach(playback: Playback): void {
        if (this.attached.has(playback)) return;
        if (!playback.ac && !playback.op) throw new Error('Live voice mixing requires a WebAudio or MIDI output.');
        for (const previous of this.sessions) if (previous.ended) this.close(previous);
        this.attached.add(playback);
        const session: Session = { ended: false, gates: new Map(), notes: new Set(), sources: new Set(), timers: new Set() };
        this.sessions.add(session);
        const noteRun = playback.note_run;
        const onend = playback.onend;
        playback.onend = repv => {
            if (session.ended) return;
            session.ended = true;
            if (playback.stop) this.close(session);
            // Keep WebAudio release tails connected until the next play/stop.
            onend(repv);
        };
        playback.note_run = (output, symbol, key, time, duration) => {
            const destination = output.gain;
            const pitched = output.v_c[symbol.v] !== 9
                && !symbol.p_v.key?.k_drum && !['_drum', '_beats'].includes(symbol.p_v.id);
            if (output.ac && destination) {
                const ac = output.ac;
                let gate = session.gates.get(symbol.p_v);
                if (!gate) {
                    gate = output.ac.createGain();
                    gate.gain.value = this.isEnabled(symbol.p_v) ? 1 : 0;
                    gate.connect(destination);
                    session.gates.set(symbol.p_v, gate);
                }
                output.gain = gate;
                // Capture only sources created by this synchronous note call.
                // Retuning detune preserves its sample, envelope and timing.
                const createSource = ac.createBufferSource;
                const sources: AudioBufferSourceNode[] = [];
                ac.createBufferSource = () => {
                    const source = createSource.call(ac);
                    sources.push(source);
                    return source;
                };
                try {
                    noteRun(output, symbol, key, time, duration);
                    if (pitched) for (const source of sources) {
                        if (!source.buffer) continue;
                        const note = { source, detune: source.detune.value };
                        session.sources.add(note);
                        source.addEventListener('ended', () => session.sources.delete(note), { once: true });
                        source.detune.setValueAtTime(note.detune + this.semitones * 100, ac.currentTime);
                    }
                } finally {
                    ac.createBufferSource = createSource;
                    output.gain = destination;
                }
            } else if (output.op) {
                // MIDI has no per-voice audio bus. Delay note-on until its onset
                // so a queued note cannot sound after its voice has been muted.
                const port = output.op;
                const channel = output.v_c[symbol.v];
                const snapshot = { ...output, v_c: [...output.v_c], c_i: [...output.c_i] };
                const note: MidiNote = {
                    voice: symbol.p_v, start: time, end: time + duration, sounding: false,
                    key,
                    pitch: () => key + (pitched ? this.semitones : 0),
                    play: (start, length) => {
                        note.key = note.pitch();
                        if (note.key < 0 || note.key >= 128) {
                            console.warn(`MIDI pitch ${note.key} is outside the playable range (0-127).`);
                            return false;
                        }
                        noteRun(snapshot, symbol, note.key, start, length);
                        return true;
                    },
                    stop: () => port.send([0x80 + channel, note.key | 0, 0])
                };
                session.notes.add(note);
                const later = (callback: () => void, at: number) => {
                    const timer = setTimeout(() => {
                        session.timers.delete(timer);
                        callback();
                    }, Math.max(0, at * 1000 - performance.now()));
                    session.timers.add(timer);
                };
                later(() => {
                    if (!note.sounding && this.isEnabled(note.voice)) {
                        const now = Math.max(time, performance.now() / 1000);
                        if (now < note.end) {
                            note.sounding = note.play(now, note.end - now);
                        }
                    }
                }, time);
                later(() => { session.notes.delete(note); }, note.end);
            } else {
                throw new Error('Live voice mixing requires a WebAudio gain node.');
            }
        };
    }
}
