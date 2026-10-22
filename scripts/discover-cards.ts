import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { discoverCardPackages, loadCardPackages, writeCardRegistry } from './card-packages.js';
import { writeGalleryCatalog } from './gallery-catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const packages = await discoverCardPackages(root);
const cards = await loadCardPackages(packages);
await writeCardRegistry(packages, resolve(root, 'generated/cards.ts'));
await writeGalleryCatalog(packages, resolve(root, 'generated/card-catalog.ts'));
console.log('Registered ' + cards.length + ' cards from ' + packages.length + ' packages');
