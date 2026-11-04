import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'node:crypto';
import { PreferenceStore, PreferenceSnapshot } from './preferenceStore.js';
import type { RenderMessage, PreferenceMessage } from '../shared/protocol.js';

let diagnosticCollection: vscode.DiagnosticCollection;
let panel: vscode.WebviewPanel | undefined;
let extensionContext: vscode.ExtensionContext;
let previewDocument: vscode.TextDocument | undefined;
let ready = false;
let revision = 0;
let snapshot: PreferenceSnapshot | undefined;
let store: PreferenceStore | undefined;
let saving = false;

function libraryRoot(document: vscode.TextDocument): string {
    return vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? path.dirname(document.fileName);
}
function preferenceStore(document: vscode.TextDocument): PreferenceStore {
    const root = libraryRoot(document);
    const selected = extensionContext.workspaceState.get<string>(`preferences:${root}`);
    const hash = createHash('sha256').update(root).digest('hex');
    return new PreferenceStore(selected ?? path.join(extensionContext.globalStorageUri.fsPath, hash, 'preferences.json'));
}
function reportPreviewError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);
    void panel?.webview.postMessage({ command: 'preferenceError', message });
    void vscode.window.showErrorMessage(`ABC preview: ${message}`);
}

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
	try {
		/* Show the music score on a separate webview panel */
		let showMusicCommand = vscode.commands.registerCommand('vscode-abc-music-editor.showMusicsheet', () => showMusicPreview(context));
		context.subscriptions.push(showMusicCommand);
        context.subscriptions.push(vscode.commands.registerCommand('vscode-abc-music-editor.choosePreferences', async () => {
            const document = previewDocument ?? vscode.window.activeTextEditor?.document;
            if (!document || document.languageId !== 'abc') return;
            const folders = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Use Preferences Folder' });
            if (!folders?.length) return;
            await context.workspaceState.update(`preferences:${libraryRoot(document)}`, path.join(folders[0].fsPath, 'preferences.json'));
            await postAbcToWebview(document);
        }));
        context.subscriptions.push(vscode.commands.registerCommand('vscode-abc-music-editor.useAppPreferences', async () => {
            const document = previewDocument ?? vscode.window.activeTextEditor?.document;
            if (!document) return;
            await context.workspaceState.update(`preferences:${libraryRoot(document)}`, undefined);
            await postAbcToWebview(document);
        }));
        context.subscriptions.push(vscode.commands.registerCommand('vscode-abc-music-editor.reloadPreferences', async () => {
            if (previewDocument) await postAbcToWebview(previewDocument);
        }));
		
		// Listen for text document changes to refresh the preview
		context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(handleTextDocumentChange));

		/* Smart editing commands to auto-close double quotes when adding chords.
		 There is a VS code configuration that would do almost that but it doesn't work if you're inserting it to the right of some text */
		const smartQuoteCommand = vscode.commands.registerCommand('abc.smartQuote', insertSmartQuote);
		context.subscriptions.push(smartQuoteCommand);
		// Intercept typing `"` for .abc files and call the insertSmartQuote function
		context.subscriptions.push(vscode.commands.registerCommand('type', handleTypeCommand));

		/* Show ABC errors in the editor as squiggly lines */
		diagnosticCollection = vscode.languages.createDiagnosticCollection('abc');
		context.subscriptions.push(diagnosticCollection);

		vscode.languages.registerCompletionItemProvider('abc', {
			provideCompletionItems(document, position) {
				const line = document.lineAt(position).text;
				const char = position.character;

				if (char > 0 && line[char - 1] === ' ') {
				const insertPos = position;
				const range = new vscode.Range(insertPos, insertPos); // zero-length range for insertion

				const item = new vscode.CompletionItem('|', vscode.CompletionItemKind.Keyword);
				item.detail = 'Insert bar line';
				item.insertText = '| ';
				item.range = range;
				item.sortText = '\0';

				return [item];
				}
				return [];
			}
		}, ' ');
		
	} catch (error) {
		console.error(error);		
	}
}

/* Facilitate adding chords to an existing melody by auto-closing double quotes when we type them next to a character */
// This function will be invoked to insert quotes
async function insertSmartQuote() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'abc') return;
  
	const pos = editor.selection.active;
  
	await editor.edit(editBuilder => {
	  editBuilder.insert(pos, '""');
	});
  
	const newPos = pos.translate(0, 1);
	editor.selection = new vscode.Selection(newPos, newPos);
}
  
// Function to handle typing and insert smart quotes
async function handleTypeCommand(args: { text: string }) {
	const editor = vscode.window.activeTextEditor;
	if (args.text === '"' && editor?.document.languageId === 'abc') {
	  // Call the insertSmartQuote method here
	  vscode.commands.executeCommand('abc.smartQuote');
	} else {
	  // Default behavior
	  vscode.commands.executeCommand('default:type', args);
	}
}
  
  // Function to handle text document changes
async function handleTextDocumentChange(e: vscode.TextDocumentChangeEvent) {
	if (e.document.languageId !== 'abc') return;

	// show errors and refresh preview whenever the text changes
	if (previewDocument?.uri.toString() === e.document.uri.toString()) await postAbcToWebview(e.document);
}
  

async function postAbcToWebview(document: vscode.TextDocument): Promise<void> {
    previewDocument = document;
    const currentRevision = ++revision;
    if (!panel || !ready) return;
    try {
        if (document.uri.scheme !== 'file') throw new Error('Personal ABC preview currently requires a local file. Save this document to a library first.');
        const root = libraryRoot(document);
        const selectedStore = preferenceStore(document);
        const [selectedSnapshot, tools, preferences] = await Promise.all([
            selectedStore.read(), import('abctools'), import('../shared/preferences.mjs')
        ]);
        const resourceKey = path.relative(root, document.fileName).split(path.sep).join('/');
        const effective = preferences.resolvePreferences(selectedSnapshot.value, resourceKey);
        const { mergedDirectives, body } = tools.getEffectiveAbcConfig(root, document.fileName, document.getText());
        if (currentRevision !== revision || !panel) return;
        store = selectedStore;
        snapshot = selectedSnapshot;
        panel.title = `ABC Preview: ${path.basename(document.fileName)}`;
        const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const message: RenderMessage = {
            command: 'render', documentId: document.uri.toString(), revision: currentRevision,
            resourceKey, content: `${mergedDirectives}${eol}${eol}${body}`,
            preferences: effective, fileChoices: selectedSnapshot.value.files?.[resourceKey] ?? {},
            defaultChoices: preferences.resolvePreferences({ version: 1, defaults: selectedSnapshot.value.defaults }, resourceKey),
            origin: selectedSnapshot.value.files?.[resourceKey] ? 'file' : 'defaults',
            storageLabel: selectedStore.filename
        };
        diagnosticCollection.set(document.uri, []);
        await panel.webview.postMessage(message);
    } catch (error) { if (currentRevision === revision) reportPreviewError(error); }
}

async function savePreferences(message: PreferenceMessage): Promise<void> {
    let ownsSave = false;
    try {
        if (saving || !previewDocument || !store || !snapshot || message.documentId !== previewDocument.uri.toString() || message.revision !== revision) {
            throw new Error('This preview changed before the preferences could be saved. Reload preferences and try again.');
        }
        saving = true;
        ownsSave = true;
        const document = previewDocument;
        const selectedStore = store;
        const selectedSnapshot = snapshot;
        const tools = await import('../shared/preferences.mjs');
        if (message.revision !== revision) throw new Error('The document changed before saving preferences. Try again from the refreshed preview.');
        const resourceKey = tools.validateResourceKey(path.relative(libraryRoot(document), document.fileName).split(path.sep).join('/'));
        const value = structuredClone(selectedSnapshot.value);
        const files = value.files ??= {};
        if (message.action === 'reset') {
            delete files[resourceKey];
        } else if (message.action === 'file') {
            files[resourceKey] = tools.validateChoices(message.choices);
        } else if (message.action === 'defaults') {
            const choices = tools.validateChoices(message.choices);
            const { transposition: _transposition, tempo: _tempo, ...personal } = choices;
            value.defaults = personal;
        } else {
            throw new Error('Unknown preference action');
        }
        await selectedStore.write(value, selectedSnapshot.revision);
        if (previewDocument) await postAbcToWebview(previewDocument);
    } catch (error) { reportPreviewError(error); }
    finally { if (ownsSave) saving = false; }
}

function showMusicPreview(context: vscode.ExtensionContext) {

	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== "abc") {
	  return;
	}
    if (panel) {
        panel.reveal(vscode.ViewColumn.Beside);
        void postAbcToWebview(editor.document);
        return;
    }
    previewDocument = editor.document;
    ready = false;

	// webview panel for live preview
	panel = vscode.window.createWebviewPanel('musicSheet', 'ABC Preview', vscode.ViewColumn.Beside, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [
			vscode.Uri.file(path.join(context.extensionPath, 'lib')),
			vscode.Uri.file(path.join(context.extensionPath, 'out', 'lib')),
			vscode.Uri.file(path.join(context.extensionPath, 'out', 'shared')),
			vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'))
		]
	});
	
	panel.iconPath = {
		light: vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icons', 'light', 'quaver.svg')),
		dark: vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icons', 'dark', 'quaver.svg'))
	};

	const baseUri = panel?.webview?.asWebviewUri(vscode.Uri.joinPath(context.extensionUri));

    panel.webview.html = getWebviewHtml(baseUri);

	// handle messages from the webview
	panel.webview.onDidReceiveMessage(message => {
		switch (message.command) {
            case 'ready':
                ready = true;
                if (previewDocument) void postAbcToWebview(previewDocument);
                return;
            case 'preferences':
                void savePreferences(message);
                return;
            case 'choosePreferences':
                void vscode.commands.executeCommand('vscode-abc-music-editor.choosePreferences');
                return;
            case 'reloadPreferences':
                void vscode.commands.executeCommand('vscode-abc-music-editor.reloadPreferences');
                return;
			case 'selection':
                // Configuration, projections and fit2box do not yet supply a
                // composed source map. Never jump to a misleading source offset.
				return;
			case 'error':
                if (message.documentId === previewDocument?.uri.toString() && message.revision === revision) {
                    console.error(`ABC renderer: ${message.message}`);
                }
				return;
			case 'openLink':
				if (message.url) {
					vscode.env.openExternal(vscode.Uri.parse(message.url));
				}
				return;
		}
	}, undefined, context.subscriptions);

	panel.onDidDispose(() => {
		panel = undefined;
        ready = false;
        revision++;
	  });
}

function showDiagnostics(message: string, line: number, col: number) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

    const lineText = editor.document.lineAt(line).text; // Get the text of the specified line

	const column = col || 0;
	if (column > lineText.length) {
		console.error(`ABC error highlighting returned an invalid state. Column ${column} exceeds line ${line}'s length ${lineText.length}. Error was: ${message}`);
		return;
	}
    const range = new vscode.Range(line, col || 0, line, Math.min(col + 3, lineText.length)); // Create a range of three characters
    
	const diagnostic = new vscode.Diagnostic(
	  range,
	  message,
	  vscode.DiagnosticSeverity.Error
	);
  
	diagnosticCollection.set(editor.document.uri, [diagnostic]);
}

function getWebviewHtml(baseUri: vscode.Uri): string {
	const htmlPath = vscode.Uri.joinPath(baseUri, 'out', 'webview', 'webview.html');
	let rawHtml = fs.readFileSync(htmlPath.fsPath, 'utf8');
	let html = rawHtml.replace(/__BASE_URI__/g, baseUri.toString());
	return html;
}

function normalizeLineEndings(content: string) {
	return content?.replace(/\r\n/g, "\n");
}

export function jumpToPosition(start: number, stop: number) {
	if (vscode.window.visibleTextEditors?.length !== 1) {
		return;
	}

	const editor = vscode.window.visibleTextEditors[0];

	const text = normalizeLineEndings(editor.document.getText());
	let pos = 0;
	let line = 0;
	const lines = text.split('\n');

	while (line < lines.length && pos + lines[line].length + 1 <= start) {
		pos += lines[line].length + 1;
		line++;
	}

	const col = start - pos;
	editor.selection = new vscode.Selection(line, col, line, col + (stop - start));
	editor.revealRange(new vscode.Range(line, 0, line + 10, 0));
}

// this method is called when your extension is deactivated
export function deactivate() {}
