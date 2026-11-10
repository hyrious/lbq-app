import { createServiceIdentifier } from './instantiation.ts';

export const ILoginItemService = createServiceIdentifier<ILoginItemService>('loginItemService');

export interface ILoginItemState {
	readonly available: boolean;
	readonly enabled: boolean;
	readonly message: string;
}

export interface ILoginItemService {
	read(): Promise<ILoginItemState>;
	write(enabled: boolean): Promise<ILoginItemState>;
}
