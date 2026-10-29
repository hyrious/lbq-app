import type { AsyncService } from '../common/channel.ts';
import type { ServiceIdentifier } from '../common/instantiation.ts';

import { createServiceProxy } from '../common/channel.ts';
import { registerService } from '../common/extensions.ts';

export function registerRemoteService<T extends AsyncService<T>>(id: ServiceIdentifier<T>): void {
	registerService(id, () => createServiceProxy(id, vscode), true);
}
