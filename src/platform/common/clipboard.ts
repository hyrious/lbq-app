import { createServiceIdentifier } from './instantiation.ts';

export const IClipboardService = createServiceIdentifier<IClipboardService>('clipboardService');

export interface IClipboardService {
	writeImage(png: Uint8Array): Promise<void>;
}
