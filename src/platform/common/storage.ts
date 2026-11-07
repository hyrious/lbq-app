import { createServiceIdentifier } from './instantiation.ts';

export const IStorageService = createServiceIdentifier<IStorageService>('storageService');

export interface IStorageService {
	get(key: string): string | undefined;
	store(key: string, value: string): void;
	remove(key: string): void;
}
