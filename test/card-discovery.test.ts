import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
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
async function cardPackage(root: string, path: string, name = '@example/unrelated-name') {
  const directory = resolve(root, 'cards', path);
  await mkdir(resolve(directory, 'src'), { recursive: true });
  await writeFile(resolve(directory, 'package.json'), JSON.stringify({ name }));
  const fixture = pathToFileURL(resolve('test/fixtures/profile-card.ts')).href;
  await writeFile(
    resolve(directory, 'src/index.ts'),
    'export { default } from ' + JSON.stringify(fixture) + ';',
  );
  return directory;
}

it('derives IDs from single and nested directories, independent of package names and data sources', async () => {
  const root = await workspace();
  await cardPackage(root, 'profile/combined/overview');
  await cardPackage(root, 'snake');
  const packages = await discoverCardPackages(root);
  expect(packages.map(({ id }) => id)).toEqual(['profile/combined/overview', 'snake']);
  const cards = await loadCardPackages(packages);
  expect(cards.map(({ id }) => id)).toEqual(['profile/combined/overview', 'snake']);
  const target = resolve(root, 'generated/cards.ts');
  await writeCardRegistry(packages, target);
  const generated = await readFile(target, 'utf8');
  expect(generated).toContain('../cards/profile/combined/overview/src/index.ts');
  expect(generated).toContain('bindCard("profile/combined/overview", card0)');
  const built = await import(pathToFileURL(target).href);
  expect(built.cards.map((card: { id: string }) => card.id)).toEqual(cards.map(({ id }) => id));
  const directory = packages[1]!.directory;
  await rename(directory, resolve(root, 'cards/renamed'));
  expect((await loadCardPackages(await discoverCardPackages(root))).map(({ id }) => id)).toEqual([
    'profile/combined/overview',
    'renamed',
  ]);
});

it('requires the conventional entry and one default card export', async () => {
  const root = await workspace();
  const directory = await cardPackage(root, 'missing');
  await rm(resolve(directory, 'src/index.ts'));
  await expect(discoverCardPackages(root)).rejects.toThrow('ENOENT');
  await writeFile(resolve(directory, 'src/index.ts'), 'export const cards = [];');
  await expect(loadCardPackages(await discoverCardPackages(root))).rejects.toThrow(
    'default-export one card',
  );
});

it('rejects noncanonical directory names and duplicate registered paths', async () => {
  const root = await workspace();
  await cardPackage(root, 'Bad_Name/card');
  await expect(discoverCardPackages(root)).rejects.toThrow('invalid card directory');
  await rm(resolve(root, 'cards/Bad_Name'), { recursive: true });
  await cardPackage(root, 'profile/overview');
  const packages = await discoverCardPackages(root);
  await expect(loadCardPackages([...packages, ...packages])).rejects.toThrow('Duplicate card ID');
});

it('keeps the conventional entry inside its package, including symlinks', async () => {
  const root = await workspace();
  const directory = await cardPackage(root, 'outside');
  const external = resolve(root, 'external.ts');
  await writeFile(external, 'export default {};');
  await rm(resolve(directory, 'src/index.ts'));
  await symlink(external, resolve(directory, 'src/index.ts'));
  await expect(discoverCardPackages(root)).rejects.toThrow('inside its package');
});
