import './windowOverlay.css';
import { $ } from './dom.ts';

/** Creates a non-modal window overlay, leaving its content and lifecycle to the caller. */
export function createWindowOverlay(label: string): HTMLDivElement {
	return $('.window-overlay.popover', { popover: 'auto', role: 'region', 'aria-label': label, tabindex: '-1' },
		$('.window-overlay-drag-region', { 'aria-hidden': 'true' }));
}
