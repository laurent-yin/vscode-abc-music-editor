import { promises as fs } from 'node:fs';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Preferences } from 'abctools/preferences' with { "resolution-mode": "import" };

export interface PreferenceSnapshot { value: Preferences; revision: string }
function missing(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
export class PreferenceStore {
    constructor(readonly filename: string) {}

    async read(): Promise<PreferenceSnapshot> {
        let text: string;
        try { text = await fs.readFile(this.filename, 'utf8'); }
        catch (error) {
            if (missing(error)) return { value: { version: 1 }, revision: 'missing' };
            throw error;
        }
        const { parsePreferences } = await import('abctools/preferences');
        return { value: parsePreferences(text), revision: createHash('sha256').update(text).digest('hex') };
    }

    async write(value: Preferences, revision: string): Promise<void> {
        const { serializePreferences } = await import('abctools/preferences');
        const text = serializePreferences(value);
        await fs.mkdir(path.dirname(this.filename), { recursive: true });
        const lock = `${this.filename}.lock`;
        // Exclusive ownership plus a revision check prevents cooperating clients
        // from overwriting one another. A stale lock is reported, never stolen.
        const handle = await fs.open(lock, 'wx');
        const temporary = `${this.filename}.${randomUUID()}.tmp`;
        try {
            if ((await this.read()).revision !== revision) throw new Error('Preferences changed in another window. Reload preferences before saving.');
            try {
                const info = await fs.lstat(this.filename);
                if (info.isSymbolicLink()) throw new Error('Preferences file is a symlink. Select its real directory before saving.');
                if (!(info.mode & 0o222)) throw new Error('Preferences file is read-only.');
                await fs.access(this.filename, constants.W_OK);
            } catch (error) { if (!missing(error)) throw error; }
            await fs.writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
            await fs.rename(temporary, this.filename);
        } finally {
            await handle.close();
            await fs.unlink(lock);
            try { await fs.unlink(temporary); }
            catch (error) { if (!missing(error)) throw error; }
        }
    }
}
