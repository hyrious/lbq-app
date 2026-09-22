import { runApplication } from './src/runtime/electron-main/runtime.ts';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
process.removeAllListeners('warning');

runApplication();
