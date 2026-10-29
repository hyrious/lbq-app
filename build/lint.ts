import { globSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { styleText } from 'node:util';
import { Config } from '../.vscode/extensions/local-linter/config.ts';
import { checkLayers } from '../.vscode/extensions/local-linter/layers.shared.ts';
import { repoRoot } from './common.ts';

const config = new Config(readFileSync(join(repoRoot, 'lint.config.json'), 'utf8'));
const files = globSync('src/**/*', { cwd: repoRoot, withFileTypes: true })
	.filter(entry => entry.isFile())
	.map(entry => join(entry.parentPath, entry.name));

for (const file of files.sort()) {
	const relativePath = relative(repoRoot, file).split(sep).join('/');
	const text = readFileSync(file, 'utf8');
	const errors = checkLayers(config, relativePath, text);
	if (!errors.length) continue;
	process.exitCode = 1;
	console.log(styleText('magenta', relativePath));
	for (const error of errors) {
		const start = text.lastIndexOf('\n', error.offset - 1) + 1;
		const end = text.indexOf('\n', error.offset);
		const line = text.slice(start, end < 0 ? text.length : end).replace(/\r$/, '');
		const lineNumber = text.slice(0, start).split('\n').length;
		const column = error.offset - start;
		const marked = line.slice(0, column)
			+ styleText(['black', 'bgWhite'], line.slice(column, column + error.length))
			+ line.slice(column + error.length);
		console.log(`${styleText('green', String(lineNumber))}: ${marked} ${styleText('dim', '// ' + error.message)}`);
	}
	console.log();
}
