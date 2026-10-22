import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  discoverCardPackages,
  loadCardPackages,
  writeCardRegistry,
} from '../scripts/card-packages.js';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

async function workspace() {
  const root = await mkdtemp(resolve(tmpdir(), 'coolp-discovery-'));
  folders.push(root);
  return root;
}

async function cardPackage(root: string, name: string, entry = './src/index.ts') {
  const directory = resolve(root, 'cards', name);
  await mkdir(resolve(directory, 'src'), { recursive: true });
  await writeFile(
    resolve(directory, 'package.json'),
    JSON.stringify({
      name: '@cool-profile/' + name,
      coolp: { 'card-entry': entry },
    }),
  );
  await writeFile(resolve(directory, 'src/index.ts'), 'export const cards = [];');
}

it('discovers arbitrary workspace packages and generates imports without a central list', async () => {
  const root = await workspace();
  await cardPackage(root, 'z-last');
  await cardPackage(root, 'a-first');
  const packages = await discoverCardPackages(root);
  expect(packages.map((item) => item.name)).toEqual([
    '@cool-profile/a-first',
    '@cool-profile/z-last',
  ]);
  const target = resolve(root, 'generated/cards.ts');
  await writeCardRegistry(packages, target);
  const generated = await readFile(target, 'utf8');
  expect(generated).toContain('../cards/a-first/src/index.ts');
  expect(generated).toContain('...cards0, ...cards1');
});

it('reports a missing card entry instead of silently omitting the package', async () => {
  const root = await workspace();
  await cardPackage(root, 'missing', './src/missing.ts');
  await expect(discoverCardPackages(root)).rejects.toThrow('ENOENT');
});

it('loads typed card exports and checks duplicates across packages', async () => {
  const entry = fileURLToPath(new URL('./fixtures/profile-card.ts', import.meta.url));
  const item = { name: 'profile-card', directory: resolve(entry, '..'), entry };
  const cards = await loadCardPackages([item]);
  expect(cards.map((card) => card.id)).toEqual(['profile/overview']);
  await expect(loadCardPackages([item, { ...item, name: 'duplicate' }])).rejects.toThrow(
    'Duplicate card ID',
  );
});

it('keeps each declared entry inside its package, including symlinks', async () => {
  const root = await workspace();
  await cardPackage(root, 'outside', './src/external.ts');
  const external = resolve(root, 'external.ts');
  await writeFile(external, 'export const cards = [];');
  await symlink(external, resolve(root, 'cards/outside/src/external.ts'));
  await expect(discoverCardPackages(root)).rejects.toThrow('inside its package');
});
