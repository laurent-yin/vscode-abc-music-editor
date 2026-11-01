import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(path.join(os.tmpdir(), 'abc-extension-host-'));
try {
    const fixture = path.join(directory, 'fixture');
    await mkdir(fixture);
    const child = spawn('code', [
        '--extensionDevelopmentPath', root,
        '--extensionTestsPath', path.join(root, 'test/extension-host.cjs'),
        '--user-data-dir', path.join(directory, 'profile'),
        '--extensions-dir', path.join(directory, 'extensions'),
        '--wait', '--disable-extensions', '--disable-gpu', '--skip-welcome',
        '--skip-release-notes', '--disable-workspace-trust',
        fixture
    ], { stdio: 'inherit', env: { ...process.env, ABC_EXTENSION_TEST_DIR: fixture } });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    if (code !== 0) throw new Error(`Extension-host test exited with status ${code}`);
    const result = JSON.parse(await readFile(path.join(fixture, 'host-test-result.json'), 'utf8'));
    if (result.passed !== true) throw new Error('Extension-host test did not confirm success');
    console.log('ABC extension-host smoke test passed (confirmed by test result).');
} finally { await rm(directory, { recursive: true, force: true }); }
