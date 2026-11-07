import type { IDisposable } from '../common/lifecycle.ts';
import { mainWindow } from './window.ts';

/** Animate existing list elements to their new positions with FLIP. */
export class ListAnimation implements IDisposable {
	private readonly animations = new Map<HTMLElement, Animation>();

	run(elements: () => HTMLElement[], change: () => void): void {
		// Read the displayed position before cancelling an interrupted animation.
		const before = new Map(elements().map(element => [element, element.getBoundingClientRect()]));
		this.clear();
		change();
		if (mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}
		for (const element of elements()) {
			const from = before.get(element);
			if (!from) continue;
			const to = element.getBoundingClientRect();
			const dx = from.left - to.left;
			const dy = from.top - to.top;
			if (!dx && !dy) continue;
			const animation = element.animate([
				{ transform: `translate(${dx}px, ${dy}px)` },
				{ transform: 'none' }
			], { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
			this.animations.set(element, animation);
			animation.onfinish = animation.oncancel = () => this.stop(element);
		}
	}

	private stop(element: HTMLElement): void {
		const animation = this.animations.get(element);
		if (!animation) return;
		this.animations.delete(element);
		animation.onfinish = animation.oncancel = null;
		animation.cancel();
	}

	private clear(): void {
		for (const element of this.animations.keys()) this.stop(element);
	}

	dispose(): void {
		this.clear();
	}
}
