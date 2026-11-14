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
    let chordFontRequests = 0;
    await page.route('**/FreeSerif-chords.woff2', async route => {
        chordFontRequests++;
        await new Promise(resolve => setTimeout(resolve, 150));
        await route.continue();
    });
    const openDisplay = async () => {
        if (!await page.locator('#display-voices').evaluate(panel => panel.matches(':popover-open'))) {
            await page.locator('#display-toggle').click();
        }
    };
    const chooseSource = async value => {
        await openDisplay();
        await page.locator('#display-voices #chord-source').selectOption(value);
        await page.keyboard.press('Escape');
    };
    const assertScoreFits = async () => {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.waitForFunction(() => {
            const sheet = document.getElementById('sheet');
            const page = sheet?.querySelector('.grid-page');
            const bounds = sheet?.getBoundingClientRect();
            return page && page.style.width === `${sheet.clientWidth}px` && Number(page.style.zoom) > 0
                && sheet.scrollHeight <= sheet.clientHeight && sheet.scrollWidth <= sheet.clientWidth
                && [...sheet.querySelectorAll('.chord-grid svg')].every(row => {
                    const box = row.getBoundingClientRect();
                    return box.bottom <= bounds.bottom + 1 && box.right <= bounds.right + 1;
                });
        });
        const overflow = await page.evaluate(() => {
            const result = [];
            for (const element of [document.documentElement, document.body, document.getElementById('sheet'), ...document.querySelectorAll('.grid-viewport')]) {
                if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) result.push({
                    element: element.id || element.className || element.tagName,
                    width: [element.clientWidth, element.scrollWidth], height: [element.clientHeight, element.scrollHeight],
                    viewport: [innerWidth, innerHeight], zoom: document.querySelector('.grid-page')?.style.zoom
                });
            }
            const sheet = document.getElementById('sheet').getBoundingClientRect();
            for (const element of document.querySelectorAll('.chord-grid svg, .chord-grid h2, .grid-composer, .chord-grid [role=status]')) {
                const bounds = element.getBoundingClientRect();
                if (bounds.left < sheet.left - 1 || bounds.right > sheet.right + 1 || bounds.top < sheet.top - 1 || bounds.bottom > sheet.bottom + 1) result.push({
                    element: element.tagName, bounds: [bounds.left, bounds.top, bounds.right, bounds.bottom],
                    sheet: [sheet.left, sheet.top, sheet.right, sheet.bottom]
                });
            }
            return result;
        });
        assert.deepEqual(overflow, [], 'complete score fits without nested or document scrollbars');
    };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('display-toggle')?.textContent.includes('Melody'));
    assert.equal(await page.locator('#chord-source').count(), 0, 'source hidden when voices are displayed');
    const fixture = '%%pagewidth 740\n%%pageheight 900\n%%fit2box * *\nX:1\nT:Browser grid\nC:Composer\nM:2/4\nL:1/4\nV:lead name="Melody"\nV:low name="Counterpoint"\nK:C\n[V:lead] "C/G" C D | "C/G" E F |\n"F" G A | "G7" B c |]\n[V:low] C, D, | E, F, |\nG, A, | B, C |]\n';
    await page.evaluate(async content => {
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    }, fixture);
    await page.getByRole('button', { name: 'Display:', exact: false }).click();
    await page.locator('#display-voices input[value=lead]').uncheck();
    await page.waitForFunction(() => document.getElementById('display-toggle').textContent === 'Display: Counterpoint, Chords');
    assert.equal(await page.locator('#chord-source').count(), 0, 'source hidden while one voice remains selected');
    await page.locator('#display-voices input[value=low]').uncheck();
    await page.waitForFunction(() => document.querySelectorAll('.chord-grid .grid-cell').length === 4);
    assert.equal(await page.locator('#display-toggle').textContent(), 'Display: Chords');
    assert.ok(chordFontRequests > 0, 'chord font is bundled rather than relying on an installed font');
    assert.ok(await page.evaluate(() => document.fonts.check('32px ABCGridChord', 'Bm7(\u266d5)/F\u266f')), 'font loads before initial chord layout, even on a delayed request');
    assert.equal(await page.locator('.chord-grid svg').count(), 2, 'ABC source rows');
    assert.equal(await page.locator('.chord-grid .grid-chord').allTextContents().then(labels => labels.filter(text => text === '%').length), 1);
    assert.equal(await page.locator('#sheet svg .slW').count(), 0, 'no empty staves');
    assert.equal(await page.locator('#sheet').evaluate(node => node.style.width), '', 'grid is not constrained by authored page width');
    assert.equal(await page.locator('#chord-source').count(), 1);
    assert.equal(await page.locator('#preview-toolbar #chord-source').count(), 0, 'source is never in the header');
    assert.equal(await page.locator('#display-voices #chord-source').count(), 1);
    await page.keyboard.press('Escape');
    await assertScoreFits();
    await chooseSource('low');
    await page.waitForFunction(() => document.querySelector('.chord-grid [role=status]')?.textContent.includes('has no chords'));
    await page.reload();
    await page.waitForFunction(() => document.getElementById('chord-source')?.value === 'low');
    assert.match(await page.locator('.chord-grid').textContent(), /has no chords/);
    await assertScoreFits();
    await chooseSource('lead');
    await page.waitForFunction(() => document.querySelectorAll('.grid-cell').length === 4);
    await page.locator('#preferences-toggle').click();
    await page.locator('#personal-controls summary').filter({ hasText: 'Chord grid defaults' }).click();
    assert.equal(await page.locator('#chord-grid-instructions').isChecked(), false, 'text instructions are hidden by default');
    await page.locator('#chord-grid-layout').selectOption('compact');
    await page.locator('#chord-grid-repeats').uncheck();
    await page.getByRole('button', { name: 'Save grid defaults', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.chord-grid svg').length === 1 && !Array.from(document.querySelectorAll('.grid-chord')).some(node => node.textContent === '%'));
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.querySelectorAll('.chord-grid svg').length > 1);
    const narrowRows = await page.locator('.chord-grid svg').count();
    await assertScoreFits();
    const geometry = await page.locator('.chord-grid').evaluate(root => {
        const collisions = [];
        for (const cell of root.querySelectorAll('.grid-cell')) {
            const box = cell.querySelector('.abcr').getBBox();
            const chords = [...cell.querySelectorAll('.grid-chord')].map(node => node.getBBox());
            for (const [index, chord] of chords.entries()) {
                if (chord.x < box.x || chord.x + chord.width > box.x + box.width) collisions.push('overflow');
                if (index && chords[index - 1].x + chords[index - 1].width > chord.x) collisions.push('overlap');
            }
        }
        return collisions;
    });
    assert.deepEqual(geometry, []);
    await page.locator('.chord-grid .abcr').first().click();
    assert.ok(await page.locator('.chord-grid .abcr.selected').count(), 'cell selection');
    const stored = await page.evaluate(async () => (await (await fetch('/message')).json()));
    assert.equal(stored.preferences.chordGrid.layout, 'compact');
    assert.equal(stored.preferences.chordGrid.repeatMeasures, false);
    assert.equal(stored.preferences.chordGrid.showTextInstructions, false);
    assert.equal(stored.fileChoices.chordSourceVoiceId, 'lead');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.grid-cell').length === 4);
    assert.equal(await page.locator('.chord-grid svg').count(), narrowRows, 'global layout survives reload');
    await assertScoreFits();
    await page.locator('#preferences-toggle').click();
    await page.getByRole('button', { name: 'Save default instrument key', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('preference-status').textContent.includes('Personal defaults') || document.getElementById('preference-status').textContent.includes('File overrides'));
    const preserved = await page.evaluate(async () => (await (await fetch('/message')).json()));
    assert.equal(preserved.preferences.chordGrid.layout, 'compact', 'other default saves retain grid settings');
    assert.equal(preserved.preferences.chordGrid.repeatMeasures, false);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1000, height: 900 });
    const longFixture = 'X:1\nT:Live grid\nM:2/4\nL:1/4\nV:lead name="Melody"\nV:low name="Counterpoint"\nK:C\n[V:lead] ' + '"C" C D | '.repeat(24) + ']\n[V:low] ' + '"Dm" C, D, | '.repeat(24) + ']\n';
    await page.evaluate(async content => {
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    }, longFixture);
    await page.waitForFunction(() => document.querySelectorAll('.grid-cell').length === 24);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('play-pause-btn').getAttribute('aria-label') === 'Pause');
    await chooseSource('low');
    await page.waitForFunction(() => document.querySelector('.grid-chord')?.textContent === 'Dm');
    assert.equal(await page.locator('#play-pause-btn').getAttribute('aria-label'), 'Pause', 'source changes keep playback running');
    await page.waitForFunction(() => !!document.querySelector('.grid-playing'), undefined, { timeout: 10000 });
    await page.locator('#stop-btn').click();
    assert.equal(await page.locator('.grid-playing').count(), 0, 'stop clears playback highlighting');
    await page.locator('#preferences-toggle').click();
    // The grid section stays expanded after earlier preference saves.
    if (!await page.locator('#chord-grid-repeats').isVisible()) await page.locator('#personal-controls summary').filter({ hasText: 'Chord grid defaults' }).click();
    await page.locator('#chord-grid-repeats').check();
    await page.getByRole('button', { name: 'Save grid defaults', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.grid-chord')].some(node => node.textContent === '%'));
    await page.keyboard.press('Escape');
    await page.locator('.chord-grid .abcr').nth(1).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('play-pause-btn').getAttribute('aria-label') === 'Pause');
    await page.waitForFunction(() => document.getElementById('play-pause-btn').getAttribute('aria-label') === 'Play', undefined, { timeout: 5000 });
    assert.ok(await page.locator('.chord-grid .abcr.selected').count(), 'selection restored after playing a repeated measure');
    await assertScoreFits();
    for (const viewport of [{ width: 700, height: 500 }, { width: 360, height: 400 }, { width: 1000, height: 240 }, { width: 360, height: 240 }]) {
        await page.setViewportSize(viewport);
        await assertScoreFits();
        assert.ok(await page.locator('.chord-grid .abcr.selected').count(), 'selection survives responsive rescaling');
    }
    await page.locator('#preferences-toggle').click();
    if (!await page.locator('#chord-grid-layout').isVisible()) await page.locator('#personal-controls summary').filter({ hasText: 'Chord grid defaults' }).click();
    await page.locator('#chord-grid-layout').selectOption('source');
    await page.getByRole('button', { name: 'Save grid defaults', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.chord-grid svg').length === 1);
    await page.keyboard.press('Escape');
    await assertScoreFits();
    const tunebook = 'X:1\nT:First grid\nM:2/4\nL:1/4\nV:low\nK:C\n' + ('"C"C D| "F"E F|\n').repeat(16)
        + '\nX:2\nT:Second grid\nM:3/4\nL:1/4\nV:low\nK:C\n' + ('"G"G A B| "C"C D E|\n').repeat(16);
    await page.evaluate(async content => {
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    }, tunebook);
    await page.waitForFunction(() => document.querySelectorAll('.grid-cell').length === 64);
    await assertScoreFits();
    assert.equal(await page.locator('.grid-page .chord-grid').count(), 2, 'all tunes fit together without a nested scrollbar');
    await page.setViewportSize({ width: 360, height: 400 });
    await assertScoreFits();
    const structure = 'X:1\nT:Structure\nC:Composer\nM:2/4\nL:1/4\nV:low\nK:C\nP:A\n!segno!"C"CD | "C"EF |\n"G7"GA |[1 "C"Bc :|[2 !fermata!"^Breque""C"c2 |]\nP:B\n!coda!"F"F2 |]\n';
    await page.evaluate(async content => {
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    }, structure);
    await page.waitForFunction(() => !!document.querySelector('.chord-grid text[aria-label=Coda]'));
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.locator('.chord-grid text[aria-label=Segno]').count());
    assert.equal(await page.locator('.chord-grid text[aria-label=Fermata]').count(), 0, 'fermatas are never shown');
    assert.ok(await page.locator('.chord-grid').textContent().then(content => content.includes('1.') && content.includes('2.') && !content.includes('Breque')));
    const annotationOverflow = await page.locator('.chord-grid').evaluate(root => {
        const outside = [];
        for (const cell of root.querySelectorAll('.grid-cell')) {
            const box = cell.querySelector('.abcr').getBBox();
            for (const label of cell.querySelectorAll('text')) {
                const bounds = label.getBBox();
                if (bounds.x < box.x - 1 || bounds.x + bounds.width > box.x + box.width + 1) outside.push(label.textContent);
            }
        }
        return outside;
    });
    assert.deepEqual(annotationOverflow, [], 'annotations and musical glyphs stay inside their cells');
    await assertScoreFits();
    const dense = 'X:1\nT:Dense chords\nM:3/4\nL:1/8\nV:low\nK:C\n"Cmaj7"C"Dm7b5"D"Eb7/G"E"F#dim7"F"G7b9"G"Abm6/Bb"A |]\n';
    await page.evaluate(async content => {
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    }, dense);
    await page.waitForFunction(() => document.querySelectorAll('.grid-chord').length === 6);
    await page.setViewportSize({ width: 360, height: 900 });
    await assertScoreFits();
    const denseGeometry = await page.locator('.grid-cell').evaluate(cell => {
        const box = cell.querySelector('.abcr').getBBox();
        return [...cell.querySelectorAll('.grid-chord')].map(node => {
            const rect = node.getBBox();
            return { left: rect.x, right: rect.x + rect.width, limit: box.x + box.width };
        });
    });
    assert.ok(denseGeometry.every((rect, index) => rect.right <= rect.limit && (!index || denseGeometry[index - 1].right < rect.left)), 'six complex chords neither overlap nor overflow');
    const variedRows = '%%gchordfont Helvetica-BoldItalic 10\nX:1\nT:Compact serif chords\nM:2/4\nL:1/8\nV:low\nK:C\n!fermata!"D/F#"C4 | !uppermordent!"Bm7b5"D4 |\n"C#m7b5"C"D7b9"E"Abm6/Bb"G"B7#5"B |\n"G""^a tempo"G4 | "Em"E4 |]\n';
    await page.evaluate(async content => {
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    }, variedRows);
    await page.waitForFunction(() => document.querySelectorAll('.grid-cell').length === 5);
    await assertScoreFits();
    const typography = await page.locator('.chord-grid').evaluate(root => {
        const labels = [...root.querySelectorAll('.grid-chord')].filter(label => label.textContent !== '%');
        return {
            fonts: labels.map(label => {
                const style = getComputedStyle(label);
                return [style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle].join('|');
            }),
            scales: labels.map(label => label.getScreenCTM().a),
            roots: [...root.querySelectorAll('.grid-chord-root')].map(node => getComputedStyle(node).fontSize),
            suffixes: [...root.querySelectorAll('.grid-chord-suffix')].map(node => getComputedStyle(node).fontSize),
            components: labels.map(label => ({
                source: label.getAttribute('aria-label'),
                root: label.querySelector('.grid-chord-root')?.textContent,
                suffix: label.querySelector('.grid-chord-suffix')?.textContent,
                bass: label.querySelector('.grid-chord-bass')?.textContent,
                positions: [...label.querySelectorAll('tspan')].map(node => ({
                    role: node.getAttribute('class'), y: Number(node.getAttribute('y'))
                }))
            })),
            text: root.textContent
        };
    });
    assert.equal(new Set(typography.fonts).size, 1, 'every chord uses the same serif family, normal weight and style');
    assert.ok(typography.fonts.every(font => font === 'ABCGridChord|32px|400|normal'));
    assert.deepEqual([...new Set(typography.roots)], ['32px'], 'all roots retain a consistent size');
    assert.deepEqual([...new Set(typography.suffixes)], ['24px'], 'extensions stay readable at 75% of root size');
    const halfDiminished = typography.components.find(chord => chord.source === 'Bm7b5');
    assert.equal(halfDiminished.root, 'B');
    assert.equal(halfDiminished.suffix, 'm7(\u266d5)');
    const slashChord = typography.components.find(chord => chord.source === 'D/F#');
    assert.equal(slashChord.root, 'D');
    assert.equal(slashChord.bass, 'F\u266f');
    assert.ok(slashChord.positions[0].y < slashChord.positions[1].y && slashChord.positions[1].y < slashChord.positions[2].y, 'slash and bass descend progressively');
    assert.ok(halfDiminished.positions[1].y < halfDiminished.positions[0].y, 'extension is raised');
    assert.ok(Math.max(...typography.scales) - Math.min(...typography.scales) < .001, 'dense and sparse rows share the same actual screen scale');
    assert.ok(!typography.text.includes('a tempo'));
    assert.ok(!typography.text.includes('uppermordent') && !typography.text.includes('['), 'internal ornament names do not appear in the grid');
    for (const width of [320, 390, 1000]) {
        await page.setViewportSize({ width, height: 900 });
        await assertScoreFits();
        const collisions = await page.locator('.chord-grid').evaluate(root => {
            const failures = [];
            for (const cell of root.querySelectorAll('.grid-cell')) {
                const box = cell.querySelector('.abcr').getBBox();
                const labels = [...cell.querySelectorAll('.grid-chord')];
                for (const [index, label] of labels.entries()) {
                    const bounds = label.getBBox();
                    if (bounds.x < box.x || bounds.x + bounds.width > box.x + box.width
                        || bounds.y < box.y || bounds.y + bounds.height > box.y + box.height) failures.push(label.textContent);
                    if (index && labels[index - 1].getBBox().x + labels[index - 1].getBBox().width >= bounds.x) failures.push('overlap');
                }
            }
            return failures;
        });
        assert.deepEqual(collisions, [], `composed chords fit their cells without collisions at ${width}px`);
    }
    const resizedScales = await page.locator('.grid-chord').evaluateAll(labels => labels.map(label => label.getScreenCTM().a));
    assert.ok(Math.max(...resizedScales) - Math.min(...resizedScales) < .001, 'uniform text size survives resizing');
    await page.locator('#preferences-toggle').click();
    if (!await page.locator('#chord-grid-instructions').isVisible()) await page.locator('#personal-controls summary').filter({ hasText: 'Chord grid defaults' }).click();
    await page.locator('#chord-grid-instructions').check();
    await page.getByRole('button', { name: 'Save grid defaults', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.chord-grid')?.textContent.includes('a tempo'));
    await page.keyboard.press('Escape');
    await assertScoreFits();
    assert.equal(await page.locator('.chord-grid text[aria-label=Fermata]').count(), 0, 'text setting does not enable musical decorations');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.chord-grid')?.textContent.includes('a tempo'));
    await page.locator('#preferences-toggle').click();
    await page.getByRole('button', { name: 'Save default instrument key', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('preference-status').textContent.includes('File overrides'));
    const textSettings = await page.evaluate(async () => (await (await fetch('/message')).json()));
    assert.equal(textSettings.preferences.chordGrid.showTextInstructions, true, 'other general saves preserve the text setting');
    assert.equal(textSettings.fileChoices.chordGrid, undefined, 'text setting is not a file override');
    if (!await page.locator('#chord-grid-instructions').isVisible()) await page.locator('#personal-controls summary').filter({ hasText: 'Chord grid defaults' }).click();
    await page.locator('#chord-grid-instructions').uncheck();
    await page.getByRole('button', { name: 'Save grid defaults', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.chord-grid')?.textContent.includes('a tempo'));
    await page.keyboard.press('Escape');
    const pickups = 'X:1\nT:Part pickups\nM:2/4\nL:1/8\nV:low\nK:C\nP:A\n!fermata!"G"G | "C"C4 | "D7"D3 |]\nP:B\n"G"G | "Em"E4 | "B7"B3 |]\nP:C\nz | "Am"A4 |]\n';
    await page.evaluate(async content => {
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    }, pickups);
    await page.waitForFunction(() => document.querySelectorAll('.grid-cell').length === 5);
    assert.equal(await page.locator('.grid-cell[data-pickup=true]').count(), 0, 'pickups have no grid cells');
    assert.equal(await page.locator('.grid-cell[data-pickup=false] .grid-chord').count(), 5);
    assert.deepEqual(await page.locator('.grid-chord').allTextContents(), ['C', 'D7', 'Em', 'B7', 'Am']);
    assert.ok(await page.locator('.chord-grid').textContent().then(text => ['A', 'B', 'C'].every(part => text.includes(part))), 'part labels survive pickup removal');
    assert.equal(await page.locator('.chord-grid text[aria-label=Fermata]').count(), 0);
    await assertScoreFits();
    await openDisplay();
    await page.locator('#display-voices input[type=checkbox]').last().uncheck();
    await page.waitForFunction(() => document.getElementById('display-toggle').textContent === 'Display: None');
    assert.equal(await page.locator('#chord-source').count(), 0, 'source hidden when Chords is disabled');
    await page.locator('#display-voices input[type=checkbox]').last().check();
    await page.waitForFunction(() => !!document.getElementById('chord-source'));
    await page.keyboard.press('Escape');
    await assertScoreFits();
    const mobile = 'X:1\nT:Compact serif mobile grid\nM:4/4\nL:1/4\nV:low\nK:C\nP:A\n"Bm7b5"B4 | "E7b9"E4 | "Am7"A4 | "D7/F#"D4 |\n"Gmaj7"G4 | "C7(9)"C4 | "Cm6/Eb"C4 | "D/F#"D4 |]\nP:B\n"Bbmaj7"B4 | "Eb7/G"E4 | "Abm6/Bb"A4 | "G7#5"G4 |\n"C6/9"C4 | "N.C."z4 | "F#m7b5"F4 | "B7b9"B4 |]\n';
    await page.evaluate(async content => {
        await fetch('/message', { method: 'POST', body: JSON.stringify({ action: 'defaults', choices: { chordGrid: { layout: 'compact', repeatMeasures: false } } }) });
        const response = await fetch('/fixture', { method: 'POST', body: JSON.stringify({ content }) });
        window.postMessage(await response.json(), location.origin);
    }, mobile);
    await page.waitForFunction(() => document.querySelectorAll('.grid-cell').length === 16);
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await assertScoreFits();
        const rootSizes = await page.locator('.grid-chord-root').evaluateAll(nodes =>
            nodes.map(node => parseFloat(getComputedStyle(node).fontSize) * node.getScreenCTM().a));
        assert.equal(rootSizes.length, 15, 'all conventional labels have a root; N.C. remains literal');
        assert.ok(Math.min(...rootSizes) >= 24, `16-measure mobile example keeps roots at least 24 screen pixels at ${viewport.width}px`);
    }
    await page.evaluate(async () => {
        const { mountChordGrid } = await import('/out/webview/chordGridView.js');
        const host = document.createElement('section');
        document.body.append(host);
        const payload = '<img src=x onerror="window.gridInjection=true">';
        const dispose = mountChordGrid(host, { title: payload, composer: payload, sourceId: 'test', notices: [], measures: [{ start: 0, duration: 1, chords: [{ time: 0, text: payload }], annotations: [], barStart: '|', barEnd: '|', repeat: false }] }, { layout: 'source', repeatMeasures: false }, () => {});
        if (host.querySelector('img') || window.gridInjection) throw new Error('Unescaped grid content');
        dispose();
        host.remove();
    });
    assert.deepEqual(errors, [], 'no browser exceptions');
    await page.route('**/FreeSerif-chords.woff2', route => route.abort('failed'));
    await page.reload();
    await page.waitForFunction(() => document.getElementById('display-toggle')?.textContent === 'Display: Original');
    assert.match(await page.locator('#preview-status').textContent(), /Reason:/, 'font failure is surfaced through the standard explicit original-sheet recovery');
    assert.deepEqual(errors, [], 'font loading failures are handled without an unhandled rejection');
    console.log('Chord grid browser validation passed: compact serif components, delayed/failed font loading, readable 16-measure mobile example, source/compact fitting, tunebooks, persistence, fit2box, selection, playback and highlighting.');
} finally {
    await browser?.close();
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
}
