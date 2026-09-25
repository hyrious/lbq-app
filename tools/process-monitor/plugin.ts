import { createServiceIdentifier } from '../../src/platform/instantiation/common/instantiation.ts';
import type { Plugin } from '../../src/runtime/electron-main/plugin.ts';
import type { ProcessMonitorRpc } from './common/common.ts';
import { ProcessService } from './electron-main/processService.ts';

const IProcessService = createServiceIdentifier<ProcessService>('processMonitor.processService');

export const plugin: Plugin = {
  id: 'process-monitor',
  name: 'Process Monitor',
  window: {
    entry: 'browser/index.html',
    width: 560,
    height: 560,
    minWidth: 420,
    minHeight: 320,
    hideOnClose: true,
    vibrancy: 'under-window'
  },
  activate(context) {
    context.services.register(IProcessService, ProcessService);
    context.bindIpc<ProcessMonitorRpc>({
      listProcesses: () => context.services.get(IProcessService).snapshot()
    });
  }
};
