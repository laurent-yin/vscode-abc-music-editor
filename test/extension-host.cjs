const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async function () {
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
    try {
        const extension = vscode.extensions.getExtension('laurent-yin.abc-to-svg');
        assert.ok(extension, 'development extension is registered');
        await extension.activate();
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('vscode-abc-music-editor.choosePreferences'));
        assert.ok(commands.includes('vscode-abc-music-editor.reloadPreferences'));
        const filename = path.join(process.env.ABC_EXTENSION_TEST_DIR, 'fixture.abc');
        await fs.writeFile(filename, 'X:1\nT:Host fixture\nM:2/4\nL:1/4\nK:C\nC D|]\n');
        const document = await vscode.workspace.openTextDocument(filename);
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('vscode-abc-music-editor.showMusicsheet');
        await new Promise(resolve => setTimeout(resolve, 3000));
        assert.ok(vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.label.startsWith('ABC Preview'))));
        await vscode.commands.executeCommand('vscode-abc-music-editor.reloadPreferences');
        await new Promise(resolve => setTimeout(resolve, 1000));
        assert.deepEqual(errors, [], 'extension activation, assembly and preference bridge report no errors');
        await fs.writeFile(path.join(process.env.ABC_EXTENSION_TEST_DIR, 'host-test-result.json'), JSON.stringify({ passed: true }));
        console.log('ABC extension-host smoke test passed.');
    } finally { console.error = originalError; }
};
