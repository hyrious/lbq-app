import type { ICarbonIcons } from '../common/icon.ts';

import './icon.css';
import { $ } from './dom.ts';

let carbonIcons: ICarbonIcons | undefined;

export function setCarbonIcons(icons: ICarbonIcons): void {
	carbonIcons = icons;
}

export function i(name: string): HTMLElement {
	if (!carbonIcons) throw new Error('Carbon icons have not been initialized.');
	const element = $('i.carbon-icon', { 'aria-hidden': 'true' });
	const key = carbonIcons.aliases[name]?.parent ?? name;
	const data = carbonIcons.icons[key];
	if (data) {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${carbonIcons.width} ${carbonIcons.height}">${data.body}</svg>`;
		element.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
	} else {
		element.style.display = 'none';
		console.warn(`Unknown Carbon icon '${name}'.`);
	}
	return element;
}
