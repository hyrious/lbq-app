import type { ProcessedImage } from '../common/imagePortal.ts';

import { createServiceIdentifier } from '../../../../platform/common/instantiation.ts';

export const IImagePortalService = createServiceIdentifier<IImagePortalService>('imagePortalService');

export interface IImagePortalService {
	/** Copy file to clipboard. Returns the copied image for preview. */
	copy(file: File, size?: number): Promise<ProcessedImage>;
}
