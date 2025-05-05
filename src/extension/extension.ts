import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let diagnosticCollection: vscode.DiagnosticCollection;
let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
	try {
		/* Show the music score on a separate webview panel */
		let showMusicCommand = vscode.commands.registerCommand('vscode-abc-music-editor.showMusicsheet', () => showMusicPreview(context));
		context.subscriptions.push(showMusicCommand);
		
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
	postAbcToWebview(e.document);
}
  

function postAbcToWebview(document: vscode.TextDocument) {
	if (!panel) return;
  
	panel.title = `ABC Preview: ${path.basename(document.fileName)}`;
	const content = normalizeLineEndings(document.getText());
  
	diagnosticCollection.set(document.uri, []);
  
	panel.webview.postMessage({
	  command: 'render',
	  content
	});
  }

function showMusicPreview(context: vscode.ExtensionContext) {

	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== "abc") {
	  return;
	}

	// webview panel for live preview
	panel = vscode.window.createWebviewPanel('musicSheet', 'ABC Preview', vscode.ViewColumn.Beside, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [
			vscode.Uri.file(path.join(context.extensionPath, 'lib')),
			vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview')),
			vscode.Uri.file(path.join(context.extensionPath, 'out', 'lib')),
			vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'))
		]
	});
	
	panel.iconPath = {
		light: vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icons', 'light', 'quaver.svg')),
		dark: vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icons', 'dark', 'quaver.svg'))
	};

	const baseUri = panel?.webview?.asWebviewUri(vscode.Uri.joinPath(context.extensionUri));

    panel.webview.html = getWebviewHtml(baseUri);

	// TODO sometimes not ready to accept messages at this point
	console.log("Sending ABC to webview");
	postAbcToWebview(editor.document)

	// handle messages from the webview
	panel.webview.onDidReceiveMessage(message => {
		switch (message.command) {
			case 'selection':
				jumpToPosition(message.start, message.stop);
				return;
			case 'error':
				showDiagnostics(message.message, message.line, message.col);
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
	const htmlPath = vscode.Uri.joinPath(baseUri, 'src', 'webview', 'webview.html');
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

	vscode.window.activeTextEditor = editor;
}

// this method is called when your extension is deactivated
export function deactivate() {}
