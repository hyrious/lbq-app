import type { IDisposable } from '../common/lifecycle.ts';

import { toDisposable } from '../common/lifecycle.ts';
import { mainWindow } from './window.ts';

type ElementTagNameMap = HTMLElementTagNameMap & { '': HTMLDivElement; };
type SelectorTag<T extends string> = T extends `${infer Tag}#${string}` ? Tag
	: T extends `${infer Tag}.${string}` ? Tag : T;
type TagToElement<T extends string> = SelectorTag<T> extends keyof ElementTagNameMap
	? ElementTagNameMap[SelectorTag<T>] : HTMLElement;

const SELECTOR_REGEX = /^(?<tag>[\w-]+)?(?:#(?<id>[\w-]+))?(?<classes>(?:\.[\w-]+)*)$/;

export function $<T extends string>(selector: T, attributes?: Record<string, string>, ...children: (Node | string)[]): TagToElement<T> {
	const match = SELECTOR_REGEX.exec(selector);
	if (!match?.groups) throw new Error('Invalid element selector');
	const { tag, id, classes } = match.groups;
	const element = mainWindow.document.createElement(tag || 'div');
	if (id) element.id = id;
	if (classes) element.className = classes.slice(1).replaceAll('.', ' ');
	if (attributes) {
		for (const [name, value] of Object.entries(attributes)) {
			element.setAttribute(name, value);
		}
	}
	element.append(...children);
	return element as TagToElement<T>;
}

export function listen<K extends keyof HTMLElementEventMap>(node: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void): IDisposable;
export function listen<K extends keyof DocumentEventMap>(node: Document, type: K, handler: (event: DocumentEventMap[K]) => void): IDisposable;
export function listen<K extends keyof WindowEventMap>(node: Window, type: K, handler: (event: WindowEventMap[K]) => void): IDisposable;
export function listen(node: EventTarget, type: string, handler: EventListener): IDisposable {
	node.addEventListener(type, handler);
	return toDisposable(() => node.removeEventListener(type, handler));
}

export function isActiveElement(element: Element): boolean {
	return element.ownerDocument.activeElement == element;
}

/** Whether focus belongs to an element rather than the document itself. */
export function hasFocusedElement(): boolean {
	const { activeElement, body, documentElement } = mainWindow.document;
	return activeElement != null && activeElement != body && activeElement != documentElement;
}

export function domContentLoaded(window: Window): Promise<void> {
	return new Promise(resolve => {
		if (window.document.readyState === 'complete' || window.document?.body) {
			resolve();
		} else {
			const onLoad = () => {
				window.window.removeEventListener('DOMContentLoaded', onLoad);
				resolve();
			};
			window.window.addEventListener('DOMContentLoaded', onLoad);
		}
	});
}
