import * as vscode from 'vscode';
import { lintLayers } from './layers.ts';

export function activate(context: vscode.ExtensionContext) {
	lintLayers(context);
}
