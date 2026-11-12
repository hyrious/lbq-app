import { createServiceIdentifier } from '../../../../platform/common/instantiation.ts';

export const IWindowMoverService = createServiceIdentifier<IWindowMoverService>('windowMover');

export interface IWindowMoverService {
	list(): Promise<readonly WindowTarget[]>;
	select(index: number): Promise<void>;
	finish(direction?: number): Promise<void>;
}

export interface WindowTarget {
	readonly pid: number;
	readonly app: string;
	readonly title: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface WorkArea {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export function windowPosition(window: WindowTarget, area: WorkArea, direction: number): { x: number; y: number; } {
	if (!Number.isInteger(direction) || direction < 1 || direction > 9) throw new Error('无效的窗口方位');
	const column = (direction - 1) % 3;
	const row = 2 - Math.floor((direction - 1) / 3);
	return {
		x: Math.round(area.x + Math.max(0, area.width - window.width) * column / 2),
		y: Math.round(area.y + Math.max(0, area.height - window.height) * row / 2)
	};
}
