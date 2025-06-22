import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseFlatDirectives, mergeFlatDirectives, stringifyParsedLines, ParsedLine } from './directivesMerger';

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
	postAbcToWebview(e.document);
}
  

function postAbcToWebview(document: vscode.TextDocument) {
	if (!panel) return;
  
	panel.title = `ABC Preview: ${path.basename(document.fileName)}`;
	
    // 1. Find all abc.directives files from current folder up to workspace root
    const abcDirFiles: string[] = [];
    let dir = path.dirname(document.fileName);
    const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];
    while (true) {
        const directivesPath = path.join(dir, 'abc.directives');
        if (fs.existsSync(directivesPath)) {
            abcDirFiles.unshift(directivesPath); // parent first
        }
        if (workspaceFolders.some(root => dir === root) || dir === path.dirname(dir)) break;
        dir = path.dirname(dir);
    }

    // 2. Parse and merge all found directives
    let mergedDirectives: ParsedLine[] = [];
    for (const file of abcDirFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const parsed = parseFlatDirectives(content);
        mergedDirectives = mergeFlatDirectives(mergedDirectives, parsed);
    }

    // 3. Extract directives from the .abc file before the first X: line
    const abcText = normalizeLineEndings(document.getText());
    const lines = abcText.split('\n');
    const abcDirectives: ParsedLine[] = [];
    for (const line of lines) {
        if (line.trim().startsWith('X:')) break;
        const parsed = parseFlatDirectives(line);
        abcDirectives.push(...parsed);
    }
    mergedDirectives = mergeFlatDirectives(mergedDirectives, abcDirectives);

    // 4. Build the merged content: merged directives + rest of ABC file (from X: onward)
    const firstX = lines.findIndex(l => l.trim().startsWith('X:'));
    const abcBody = firstX >= 0 ? lines.slice(firstX).join('\n') : abcText;
    const mergedContent = `${stringifyParsedLines(mergedDirectives)}\n\n${abcBody}`;

    diagnosticCollection.set(document.uri, []);

    panel.webview.postMessage({
        command: 'render',
        content: mergedContent
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
				jumpToPosition(message.start, message.stop); // known issue: doesn't work if fit2box module is activated, as it rewrites the tune
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
}

// this method is called when your extension is deactivated
export function deactivate() {}
