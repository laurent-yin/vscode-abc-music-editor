import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let diagnosticCollection: vscode.DiagnosticCollection;
let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
	try {
		// Preview command
		let showMusicCommand = vscode.commands.registerCommand('vscode-abc-music-editor.showMusicsheet', () => showMusicPreview(context));
	
		diagnosticCollection = vscode.languages.createDiagnosticCollection('abc');
		context.subscriptions.push(diagnosticCollection);
		context.subscriptions.push(showMusicCommand);
	
		// automatically open preview
		showMusicPreview(context);
	
		// show errors and refresh preview whenever the text changes
		vscode.workspace.onDidChangeTextDocument(eventArgs => {
			if (eventArgs.document.languageId === "abc") {
				postAbcToWebview(eventArgs.document);
			}
		});
	} catch (error) {
		console.error(error);		
	}
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
			vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'))
		]
	});
	
	panel.iconPath = {
		light: vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icons', 'light', 'quaver.svg')),
		dark: vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icons', 'dark', 'quaver.svg'))
	};

	const baseUri = panel?.webview?.asWebviewUri(vscode.Uri.joinPath(context.extensionUri));

    panel.webview.html = getWebviewHtml(baseUri);

	// TODO sometimes not ready to accept messages at this point
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
