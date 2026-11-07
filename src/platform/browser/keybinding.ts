import type { IDisposable } from '../../base/common/lifecycle.ts';

import { listen } from '../../base/browser/dom.ts';
import { getModifiers, resolveModifiers } from '../../base/browser/keyboard.ts';
import { Disposable, toDisposable } from '../../base/common/lifecycle.ts';
import { mainWindow } from '../../base/browser/window.ts';
import { registerService } from '../common/extensions.ts';
import { createServiceIdentifier } from '../common/instantiation.ts';

export interface Keybinding {
	/** KeyboardEvent.key, case-insensitive. */
	readonly key: string;
	/** Exact modifier combination. Primary means Meta on macOS, Ctrl elsewhere. */
	readonly modifiers?: number;
	readonly scope: HTMLElement;
	readonly when?: (event: KeyboardEvent) => boolean;
	readonly handler: (event: KeyboardEvent) => void;
}

export const IKeybindingService = createServiceIdentifier<IKeybindingService>('keybindingService');

export interface IKeybindingService {
	registerKeybinding(binding: Keybinding): IDisposable;
}

export class KeybindingService extends Disposable implements IKeybindingService {
	private readonly bindings: Keybinding[] = [];

	constructor() {
		super();
		this.register(listen(mainWindow, 'keydown', event => this.dispatch(event)));
	}

	registerKeybinding(binding: Keybinding): IDisposable {
		const modifiers = resolveModifiers(binding.modifiers ?? 0);
		const entry: Keybinding = { ...binding, key: binding.key.toLowerCase(), modifiers };
		this.bindings.push(entry);
		return toDisposable(() => {
			const index = this.bindings.indexOf(entry);
			if (index >= 0) this.bindings.splice(index, 1);
		});
	}

	private dispatch(event: KeyboardEvent): void {
		if (event.defaultPrevented || event.isComposing) return;
		const key = event.key.toLowerCase();
		const modifiers = getModifiers(event);
		// Inner scopes win; within one scope, the last matching registration wins.
		for (const scope of event.composedPath()) {
			for (let index = this.bindings.length - 1; index >= 0; index--) {
				const binding = this.bindings[index];
				if (binding.scope != scope || binding.key != key || binding.modifiers != modifiers) continue;
				if (binding.when && !binding.when(event)) continue;
				event.preventDefault();
				binding.handler(event);
				return;
			}
		}
	}

	override dispose(): void {
		this.bindings.length = 0;
		super.dispose();
	}
}

registerService(IKeybindingService, KeybindingService);
