import { createServiceIdentifier } from '../../../../platform/common/instantiation.ts';

export const IImageService = createServiceIdentifier<IImageService>('imageService');

export interface ImageRequest {
	/** File path or PNG/JPEG bytes. */
	readonly source: string | Uint8Array;
	readonly scale?: number;
	readonly width?: number;
}

export interface ProcessedImage {
	readonly width: number;
	readonly height: number;
	/** PNG bytes. */
	readonly preview: Uint8Array;
}

export interface IImageService {
	process(input: ImageRequest): Promise<ProcessedImage>;
}
