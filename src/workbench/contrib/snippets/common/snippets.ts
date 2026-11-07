import { createServiceIdentifier } from '../../../../platform/common/instantiation.ts';

export const ISnippetsService = createServiceIdentifier<ISnippetsService>('snippetsService');

export interface Snippet {
	readonly id: string;
	readonly text: string;
}

export interface ISnippetsService {
	read(): Promise<Snippet[]>;
	write(items: Snippet[]): Promise<void>;
	confirmClear(): Promise<boolean>;
}
