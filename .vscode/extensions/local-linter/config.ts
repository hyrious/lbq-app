interface IAssignment {
	readonly include: readonly string[];
	readonly layer: string;
}

interface IConfig {
	readonly layers: { readonly [layer: string]: readonly string[]; };
	readonly files: IAssignment[];
	readonly modules?: IAssignment[];
}

interface IRule {
	readonly matches: readonly ((text: string) => boolean)[];
	readonly layer: string;
}

export class Config {
	private readonly layers: { readonly [layer: string]: readonly string[]; };
	private readonly files: readonly IRule[];
	private readonly modules: readonly IRule[];

	constructor(text: string) {
		const config: IConfig = JSON.parse(text);
		if (!config || !config.layers || typeof config.layers !== 'object' || Array.isArray(config.layers)) {
			throw new Error('Expected a layers object.');
		}
		this.layers = config.layers;
		for (const dependencies of Object.values(this.layers)) {
			if (!Array.isArray(dependencies) || !dependencies.every(name => typeof name === 'string' && Object.hasOwn(this.layers, name))) {
				throw new Error('Layer dependencies must name declared layers.');
			}
		}
		this.files = this.compile(config.files);
		this.modules = this.compile(config.modules ?? []);
	}

	private compile(assignments: IAssignment[]): readonly IRule[] {
		if (!Array.isArray(assignments)) throw new Error('Expected an array of layer assignments.');
		return assignments.map(entry => {
			if (!entry || typeof entry.layer !== 'string' || !Object.hasOwn(this.layers, entry.layer)) {
				throw new Error('Assignments must name declared layers.');
			}
			if (!Array.isArray(entry.include) || !entry.include.length || !entry.include.every(pattern => typeof pattern === 'string' && pattern.length > 0)) {
				throw new Error('Assignments must include nonempty glob patterns.');
			}
			return { matches: entry.include.map(createMatch), layer: entry.layer };
		});
	}

	file(path: string): string | undefined {
		return this.files.find(rule => rule.matches.some(match => match(path)))?.layer;
	}

	module(specifier: string): string | undefined {
		return this.modules.find(rule => rule.matches.some(match => match(specifier)))?.layer;
	}

	allows(from: string, to: string): boolean {
		return from === to || this.layers[from].includes(to);
	}
}

// Credit: https://github.com/evanw/esbuild/blob/main/internal/helpers/glob.go (MIT licensed)
export function createMatch(pattern: string): (text: string) => boolean {
	let regex = '^';
	for (const part of pattern.split(/(\*\*\/|\*\*|\*)/)) {
		switch (part) {
			case '**/':
				regex += '(?:[^/]+/)*';
				break;
			case '**':
				regex += '.*';
				break;
			case '*':
				regex += '[^/]*';
				break;
			default:
				regex += part.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
		}
	}
	const re = new RegExp(regex + '$');
	return re.test.bind(re);
}
