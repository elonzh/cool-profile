import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { releaseVersion, prepareVersion, manifests, stagePackage } from '../scripts/release-lib.js';
it('keeps stable and prerelease channels separate and rejects ambiguous version tags', () => {
  expect(releaseVersion('v1.2.3')).toMatchObject({
    version: '1.2.3',
    tag: 'v1.2.3',
    npmTag: 'latest',
    imageTags: ['1.2.3', '1.2', '1', 'latest'],
  });
  expect(releaseVersion('0.2.0-beta.1')).toMatchObject({
    npmTag: 'next',
    prerelease: true,
    imageTags: ['0.2.0-beta.1', 'next'],
  });
  for (const input of [
    '1.2',
    '01.2.3',
    '1.2.3-01',
    '1.2.3+private',
    'latest',
    'v1.2.3\nmalicious',
    '1.2.3\n',
  ])
    expect(() => releaseVersion(input)).toThrow('semantic version');
});
it('prepares both manifests and detects a mismatched runtime version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'coolp-version-'));
  try {
    await mkdir(join(root, 'apps/coolp'), { recursive: true });
    await writeFile(
      join(root, 'package.json'),
      '{"name":"cool-profile","version":"0.0.0","private":true}',
    );
    await writeFile(
      join(root, 'apps/coolp/package.json'),
      '{"name":"internal","version":"0.0.0","private":true}',
    );
    await prepareVersion('0.1.0', root);
    expect((await manifests(root)).version).toBe('0.1.0');
    expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).private).toBe(true);
    await writeFile(join(root, 'apps/coolp/package.json'), '{"version":"0.2.0"}');
    await expect(manifests(root)).rejects.toThrow('must match');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('stages a standalone npm manifest with exact native dependencies and all media assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'coolp-staging-'));
  try {
    const write = async (path: string, body: string) => {
      const parent = join(root, ...path.split('/').slice(0, -1));
      await mkdir(parent, { recursive: true });
      await writeFile(join(root, path), body);
    };
    await write(
      'package.json',
      JSON.stringify({
        name: 'cool-profile',
        version: '0.1.0',
        private: true,
        license: 'MIT',
        engines: { node: '>=24' },
      }),
    );
    await write(
      'apps/coolp/package.json',
      JSON.stringify({
        version: '0.1.0',
        dependencies: {
          sharp: 'catalog:',
          '@resvg/resvg-js': 'catalog:',
          '@cool-profile/data': 'workspace:*',
        },
      }),
    );
    await write('pnpm-workspace.yaml', 'catalog:\n  sharp: 0.35.5\n  "@resvg/resvg-js": 2.6.2\n');
    for (const name of [
      'apps/coolp/dist/coolp.mjs',
      'apps/coolp/assets/fonts/font.ttf',
      'apps/coolp/assets/gallery/index.html',
      'apps/coolp/action.mjs',
      'packages/graphics/assets/THEMES-LICENSE',
      'packages/data/assets/linguist-LICENSE',
      'README.md',
      'README.en.md',
      'LICENSE',
    ])
      await write(name, 'fixture');
    const target = await stagePackage(root),
      manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
    expect(manifest.private).toBeUndefined();
    expect(manifest.bin).toEqual({ coolp: './dist/coolp.mjs' });
    expect(manifest.dependencies).toEqual({ sharp: '0.35.5', '@resvg/resvg-js': '2.6.2' });
    expect(JSON.stringify(manifest)).not.toContain('workspace:');
    expect(await readFile(join(target, 'assets/gallery/index.html'), 'utf8')).toBe('fixture');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
