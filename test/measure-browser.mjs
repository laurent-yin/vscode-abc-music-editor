import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

const server = spawn(process.execPath, ['test/preview-server.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
    const url = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Preview harness did not start.')), 10000);
        server.once('error', reject);
        server.once('exit', code => reject(new Error(`Preview harness exited: ${code}`)));
        server.stdout.on('data', data => {
            const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
            if (match) { clearTimeout(timer); resolve(match[0]); }
        });
        server.stderr.on('data', data => process.stderr.write(data));
    });
    browser = await chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox']
    });
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/snd-1.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + `
            const realAbcPlay = AbcPlay;
            AbcPlay = function(options) {
                window.testPlaybackCallbacks = options;
                return realAbcPlay(options);
            };
        ` });
    });
    await page.goto(url);
    await page.waitForFunction(() => window.testPlaybackCallbacks && document.querySelectorAll('[data-measure-highlight]').length === 2);
    const markers = await page.locator('[data-playback-measure]').evaluateAll(nodes => nodes.map(node => ({
        key: node.dataset.playbackMeasure,
        source: Number(node.getAttribute('class').match(/_(\d+)_/)[1])
    })));
    const first = markers[0];
    const same = markers.find(marker => marker.key === first.key && marker.source !== first.source);
    const next = markers.find(marker => marker.key !== first.key);
    const currentKey = () => page.locator('[data-measure-highlight].measure-playing').getAttribute('data-measure-highlight');
    const event = (source, on = true) => page.evaluate(({ source, on }) => window.testPlaybackCallbacks.onnote(source, on), { source, on });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await event(first.source);
    assert.equal(await currentKey(), first.key);
    await event(same.source);
    assert.equal(await currentKey(), first.key, 'the background does not move within a measure');
    await event(next.source);
    await event(first.source, false);
    assert.equal(await currentKey(), next.key, 'a previous voice/note ending must not move playback backwards');
    await event(first.source);
    assert.equal(await currentKey(), first.key, 'repeats can move playback back to an earlier measure');
    const geometry = await page.locator('.measure-highlight.measure-playing').evaluate(rect => {
        const svg = rect.ownerSVGElement;
        const box = rect.getBoundingClientRect();
        const notes = [...svg.querySelectorAll('[data-playback-measure]')]
            .filter(note => note.dataset.playbackMeasure === rect.dataset.measureHighlight);
        return {
            behind: svg.firstElementChild === rect.parentElement,
            opacity: getComputedStyle(rect).fillOpacity,
            pointerEvents: getComputedStyle(rect).pointerEvents,
            contains: notes.every(note => {
                const noteBox = note.getBoundingClientRect();
                return noteBox.left >= box.left && noteBox.right <= box.right + 1
                    && noteBox.top >= box.top - 1 && noteBox.bottom <= box.bottom + 1;
            })
        };
    });
    assert.equal(geometry.behind, true, 'background is behind all notation rather than tinting notes');
    assert.equal(geometry.pointerEvents, 'none', 'background does not block selection');
    assert.equal(geometry.contains, true, 'background covers the complete measure across both staves');
    assert.equal(geometry.opacity, '0.14', 'highlight stays subtle');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.equal(await page.locator('.measure-playing').count(), 0, 'pause clears the background immediately');
    await page.waitForFunction(() => document.getElementById('play-pause-btn').getAttribute('aria-label') === 'Play');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await event(first.source);
    await page.locator('#preferences-toggle').click();
    assert.equal(await page.locator('#highlight-current-measure').isChecked(), true);
    await page.locator('#highlight-current-measure').uncheck();
    await page.waitForFunction(() => !document.getElementById('highlight-current-measure').disabled);
    assert.equal(await page.locator('.measure-playing').count(), 0);
    assert.equal(await page.locator('#play-pause-btn').getAttribute('aria-label'), 'Pause', 'global setting does not stop playback');
    await event(next.source);
    assert.equal(await page.locator('.measure-playing').count(), 0, 'disabled also suppresses future callbacks');
    await page.getByRole('button', { name: 'Save default instrument key', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('highlight-current-measure').disabled);
    assert.equal(await page.locator('#highlight-current-measure').isChecked(), false, 'other default saves preserve the option');
    await page.keyboard.press('Escape');
    await page.locator('#stop-btn').click();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-measure-highlight]'));
    const saved = await page.evaluate(async () => (await (await fetch('/message')).json()));
    assert.equal(saved.preferences.highlightCurrentMeasure, false, 'option survives disk round trip and reload');
    await page.locator('#preferences-toggle').click();
    assert.equal(await page.locator('#highlight-current-measure').isChecked(), false);
    await page.locator('#highlight-current-measure').check();
    await page.waitForFunction(() => !document.getElementById('highlight-current-measure').disabled);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await event(next.source);
    await page.locator('#display-toggle').click();
    await page.locator('#display-voices input[value=lead]').uncheck();
    await page.waitForFunction(() => document.getElementById('display-toggle').textContent === 'Display: Counterpoint, Chords');
    assert.equal(await currentKey(), next.key, 'live voice redraw restores the current measure');
    await page.keyboard.press('Escape');
    await page.locator('#stop-btn').click();
    assert.equal(await page.locator('.measure-playing').count(), 0);
    await event(first.source);
    assert.equal(await page.locator('.measure-playing').count(), 0, 'late callbacks after stop cannot restore a highlight');
    await page.locator('#display-toggle').click();
    await page.locator('#display-voices input[value=low]').uncheck();
    await page.waitForFunction(() => document.querySelectorAll('.grid-cell').length === 2);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await event(first.source);
    assert.equal(await page.locator('.chord-grid .abcr.measure-playing').count(), 1);
    assert.equal(await page.locator('.grid-cell').first().evaluate(cell => cell.firstElementChild.classList.contains('abcr')), true,
        'grid background is also behind the chord labels');
    await event(next.source);
    await event(first.source, false);
    assert.equal(await page.locator('.grid-cell').nth(1).locator('.measure-playing').count(), 1);
    await page.setViewportSize({ width: 360, height: 600 });
    await page.waitForFunction(() => document.querySelector('.grid-cell:nth-child(2) .measure-playing'));
    assert.equal(await page.locator('.measure-playing').count(), 1, 'responsive grid redraw retains only the current measure');
    await page.evaluate(() => window.testPlaybackCallbacks.onend());
    assert.equal(await page.locator('.measure-playing').count(), 0, 'natural completion clears highlighting');
    await page.evaluate(async () => {
        await fetch('/message', { method: 'POST', body: JSON.stringify({ action: 'reset' }) });
        const content = '%%fit2box * *\nX:1\nT:Multiple systems without chords\nM:2/4\nL:1/4\nK:C\nC D | E F |\nG A | B c |]\n';
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-measure-highlight]').length === 4);
    const systemGeometry = await page.locator('[data-measure-highlight]').evaluateAll(rects => rects.map(rect => ({
        height: rect.getBoundingClientRect().height,
        svgHeight: rect.ownerSVGElement.getBoundingClientRect().height
    })));
    assert.ok(systemGeometry.every(rect => rect.height > 0 && rect.height <= rect.svgHeight),
        'multi-system, chordless scores get measure-sized rather than page-sized backgrounds');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.measure-backgrounds').first().evaluate(layer => getComputedStyle(layer).display), 'none');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(async () => {
        await fetch('/message', { method: 'POST', body: JSON.stringify({ action: 'file', choices: {
            display: { selectedVoiceIds: ['lead'] }, transposition: { semitones: 2 }
        } }) });
        const content = '%%score (lead low)\nX:1\nT:Recovery\nM:2/4\nL:1/4\nV:lead\nV:low\nK:C\n[V:lead] C D | E F |]\n[V:low] C, D, | E, F, |]\n';
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    });
    await page.waitForFunction(() => document.getElementById('display-toggle').textContent === 'Display: Original');
    assert.equal(await page.locator('[data-measure-highlight]').count(), 2, 'recovery mode also retains measure backgrounds');
    const recoverySource = await page.locator('[data-playback-measure]').first().evaluate(rect =>
        Number(rect.getAttribute('class').match(/_(\d+)_/)[1]));
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await event(recoverySource);
    assert.equal(await page.locator('[data-measure-highlight].measure-playing').count(), 1);
    await page.locator('#stop-btn').click();
    assert.deepEqual(errors, []);
    console.log('Measure backgrounds: timing, voices, repeats, pause/stop/end, live redraws, grids and persistent general settings passed.');
} finally {
    await browser?.close();
    server.kill('SIGTERM');
    await once(server, 'exit');
}
