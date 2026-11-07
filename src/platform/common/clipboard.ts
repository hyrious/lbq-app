import { createServiceIdentifier } from './instantiation.ts';

export const IClipboardService = createServiceIdentifier<IClipboardService>('clipboardService');

export interface IClipboardService {
	writeText(text: string): Promise<void>;
	writeImage(png: Uint8Array): Promise<void>;
}
