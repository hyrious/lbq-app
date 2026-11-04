import * as vscode from 'vscode';
import { Config } from './config.ts';
import { checkLayers } from './layers.shared.ts';

export function lintLayers(context: vscode.ExtensionContext) {
	const diagnostics = vscode.languages.createDiagnosticCollection('local-linter-layers');
	const configs = new Map<string, Config>();
	const pending = new Map<string, object>();

	function lint(doc: vscode.TextDocument) {
		if (doc.languageId !== 'typescript') return;
		const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
		const config = folder && configs.get(folder.uri.toString());
		const results: vscode.Diagnostic[] = [];
		if (folder && config) {
			const file = vscode.workspace.asRelativePath(doc.uri, false).replace(/\\/g, '/');
			for (const error of checkLayers(config, file, doc.getText())) {
				const line = doc.positionAt(error.offset).line;
				const range = doc.lineAt(line).range;
				const diagnostic = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
				diagnostic.source = '(Local) Linter';
				results.push(diagnostic);
			}
		}

		diagnostics.set(doc.uri, results);
	}

	async function reload(folder: vscode.WorkspaceFolder) {
		const key = folder.uri.toString();
		const token = {};
		pending.set(key, token);
		let config: Config | undefined;
		let error: unknown;
		try {
			const data = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, 'lint.config.json'));
			config = new Config(new TextDecoder().decode(data));
		} catch (e) {
			if (!(e instanceof vscode.FileSystemError && e.code === 'FileNotFound')) error = e;
		}
		if (pending.get(key) !== token) return;
		pending.delete(key);
		if (config) configs.set(key, config);
		else configs.delete(key);
		if (error) void vscode.window.showErrorMessage(`Local Linter: ${folder.name}/lint.config.json: ${error}`);
		vscode.workspace.textDocuments.forEach(lint);
	}

	function reloadUri(uri: vscode.Uri) {
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		if (folder && uri.toString() === vscode.Uri.joinPath(folder.uri, 'lint.config.json').toString()) {
			void reload(folder);
		}
	}

	const watcher = vscode.workspace.createFileSystemWatcher('**/lint.config.json');
	context.subscriptions.push(
		diagnostics,
		watcher,
		watcher.onDidCreate(reloadUri),
		watcher.onDidChange(reloadUri),
		watcher.onDidDelete(reloadUri),
		vscode.workspace.onDidOpenTextDocument(lint),
		vscode.workspace.onDidChangeTextDocument(e => lint(e.document)),
		vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri)),
		vscode.workspace.onDidChangeWorkspaceFolders(e => {
			for (const folder of e.removed) {
				configs.delete(folder.uri.toString());
				pending.delete(folder.uri.toString());
			}
			vscode.workspace.textDocuments.forEach(lint);
			e.added.forEach(folder => void reload(folder));
		}),
		new vscode.Disposable(() => pending.clear()),
	);

	vscode.workspace.workspaceFolders?.forEach(folder => void reload(folder));
}
