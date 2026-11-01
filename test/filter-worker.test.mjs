import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker as NodeWorker } from 'node:worker_threads';
import { resolvePreferences, resolveVoiceFilter } from 'abctools/preferences';
import { filterSelections } from '../out/webview/renderer.js';

function workerEnvironment(t) {
    const blobs = new Map();
    const workers = [];
    t.mock.method(globalThis, 'fetch', async url => new Response(await readFile(url)));
    t.mock.method(URL, 'createObjectURL', blob => {
        const url = `blob:test-${blobs.size}`;
        blobs.set(url, blob);
        return url;
    });
    t.mock.method(URL, 'revokeObjectURL', url => blobs.delete(url));
    class WebviewWorker {
        constructor(url, options) {
            assert.equal(options.type, 'module');
            this.ready = blobs.get(url).text().then(source => {
                // Match the webview restriction that the browser harness missed.
                assert.doesNotMatch(source, /\bimport\s*(?:\(|["'{*])/);
                assert.doesNotMatch(source, /\bimportScripts\s*\(/);
                this.node = new NodeWorker(`
                    const { parentPort, workerData } = require('node:worker_threads');
                    globalThis.self = globalThis;
                    self.postMessage = message => parentPort.postMessage(message);
                    import(workerData).then(() => {
                        parentPort.on('message', data => self.onmessage({ data }));
                    });
                `, { eval: true, workerData: `data:text/javascript;base64,${Buffer.from(source).toString('base64')}` });
                this.node.on('message', data => this.onmessage?.({ data }));
                this.node.on('error', error => this.onerror?.({ message: error.message }));
            });
            workers.push(this);
        }
        postMessage(message) { this.ready.then(() => this.node.postMessage(message)); }
        terminate() { this.terminated = true; return this.node?.terminate(); }
    }
    const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: WebviewWorker });
    t.after(async () => {
        for (const worker of workers) await worker.node?.terminate();
        if (original) Object.defineProperty(globalThis, 'Worker', original);
        else delete globalThis.Worker;
    });
    return { blobs, workers };
}

const voices = [{ id: 'melody', name: 'Melodia' }, { id: 'bass', name: 'Baixarias' }];

test('webview worker filters with no runtime imports and releases its resources', async t => {
    const { blobs, workers } = workerEnvironment(t);
    for (const choices of [{}, {
        display: { voiceIdRegexFilter: ['^MELODY$'] },
        playback: { voiceIdFilter: ['bass'] }
    }]) {
        const effective = resolvePreferences({ version: 1, defaults: choices }, 'fixture.abc');
        assert.deepEqual(await filterSelections(effective, [voices]), [{
            display: resolveVoiceFilter(effective.display, voices),
            playback: resolveVoiceFilter(effective.playback, voices)
        }]);
        assert.equal(blobs.size, 0);
        assert.ok(workers.every(worker => worker.terminated));
    }
});

test('worker dependency load failures are explicit', async t => {
    workerEnvironment(t);
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
    await assert.rejects(filterSelections(resolvePreferences({ version: 1, defaults: { display: { voiceIdRegexFilter: ['bass'] } } }, 'fixture.abc'), [voices]),
        /Cannot load voice-filter script .*: 404/);
});
test('wildcards and explicit empty selections need no worker or fetched dependencies', async t => {
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Should not fetch for simple filters'); });
    const choices = resolvePreferences({ version: 1, defaults: {
        display: { hideVoicesMatching: '*BASS*; missing' }, playback: { selectedVoiceIds: [] }
    } }, 'fixture.abc');
    assert.deepEqual(await filterSelections(choices, [voices]), [{
        display: { ids: ['melody'], notices: [] }, playback: { ids: [], notices: [] }
    }]);
});

test('worker reports invalid regexes instead of timing out', async t => {
    const { blobs, workers } = workerEnvironment(t);
    const choices = resolvePreferences({ version: 1 }, 'fixture.abc');
    choices.display.voiceIdRegexFilter = ['['];
    await assert.rejects(filterSelections(choices, [voices]), /regular expression/i);
    assert.equal(blobs.size, 0);
    assert.ok(workers[0].terminated);
});

test('nonterminating regexes are stopped within the worker budget', async t => {
    const { blobs, workers } = workerEnvironment(t);
    const choices = resolvePreferences({ version: 1 }, 'fixture.abc');
    choices.display.voiceIdRegexFilter = ['^(a+)+$'];
    await assert.rejects(filterSelections(choices, [[{ id: 'a'.repeat(100) + '!' }]]),
        /did not respond within 2 seconds/);
    assert.equal(blobs.size, 0);
    assert.ok(workers[0].terminated);
});
