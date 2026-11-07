import '../../platform/browser/keybinding.ts';
import '../../platform/browser/storage.ts';
import '../../platform/electron-browser/clipboard.ts';

import '../browser/style.css';
import '../contrib/image-portal/browser/imagePortal.contribution.ts';
import '../contrib/image-portal/electron-browser/imagePortal.contribution.ts';
import '../contrib/snippets/browser/snippets.contribution.ts';
import '../contrib/snippets/electron-browser/snippets.contribution.ts';

import { main } from './desktop.main.ts';

main();
