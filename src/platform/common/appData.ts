import { createServiceIdentifier } from './instantiation.ts';

export const IAppDataService = createServiceIdentifier<IAppDataService>('appDataService');

export interface IAppDataService {
	openFolder(): Promise<void>;
}
