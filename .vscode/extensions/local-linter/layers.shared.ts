import type { Config } from './config.ts';
import { posix } from 'node:path';

// Credit: https://github.com/unjs/mlly/blob/main/src/analyze.ts (MIT licensed)
const ESM_STATIC_IMPORT_RE = /(?<=\s|^|;|\})import\s*(?:[\s"']*(?<imports>[\p{L}\p{M}\w\t\n\r $*,/{}@.]+)from\s*)?["']\s*(?<specifier>(?<="\s*)[^"]*[^\s"](?=\s*")|(?<='\s*)[^']*[^\s'](?=\s*'))\s*["'][\s;]*/dgmu;

export interface LayerError {
	readonly offset: number;
	readonly length: number;
	readonly message: string;
}

// File paths are relative to the configuration file and use forward slashes.
export function checkLayers(config: Config, file: string, text: string): readonly LayerError[] {
	const results: LayerError[] = [];
	const here = config.file(file);
	if (here == null) return results;

	for (const match of text.matchAll(ESM_STATIC_IMPORT_RE)) {
		const imports = match.groups?.imports?.trim();
		if (imports && /^type\s+\S/.test(imports)) continue;

		const specifier = match.groups?.specifier;
		if (!specifier) continue;
		const there = specifier.startsWith('./') || specifier.startsWith('../')
			? config.file(posix.join(posix.dirname(file), specifier))
			: config.module(specifier);
		if (there == null || config.allows(here, there)) continue;

		results.push({
			offset: match.indices!.groups!.specifier[0],
			length: specifier.length,
			message: `Can not import "${there}" from "${here}".`,
		});
	}
	return results;
}
