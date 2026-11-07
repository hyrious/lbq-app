import { mainWindow } from './window.ts';

export const Ctrl = 1, Shift = 2, Alt = 4, Meta = 8, Primary = 16;

export function getModifiers(event: KeyboardEvent): number {
	return 0
		| (event.ctrlKey ? Ctrl : 0)
		| (event.shiftKey ? Shift : 0)
		| (event.altKey ? Alt : 0)
		| (event.metaKey ? Meta : 0);
}

export function resolveModifiers(modifiers: number): number {
	if (!(modifiers & Primary)) return modifiers;
	const primary = mainWindow.document.body.classList.contains('mac') ? Meta : Ctrl;
	return (modifiers & ~Primary) | primary;
}

export function getPrimaryKey(): 'Meta' | 'Control' {
	return resolveModifiers(Primary) == Meta ? 'Meta' : 'Control';
}
