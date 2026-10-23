import { cp, mkdir, readFile, readdir, rm, writeFile, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'yaml';

export const execute = promisify(execFile);
export const repositoryRoot = resolve(import.meta.dirname, '..');
const nativeDependencies = ['@resvg/resvg-js', 'sharp'] as const;

export function releaseVersion(input: string) {
  const version = input.replace(/^v/, '');
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version,
    );
  if (
    !match ||
    match[0] !== version ||
    match[4]?.split('.').some((part) => /^\d+$/.test(part) && /^0\d/.test(part))
  )
    throw new Error('Expected a semantic version, e.g. 0.1.0 or 0.2.0-beta.1');
  const prerelease = Boolean(match[4]);
  return {
    version,
    tag: 'v' + version,
    prerelease,
    npmTag: prerelease ? 'next' : 'latest',
    imageTags: prerelease
      ? [version, 'next']
      : [version, `${match[1]}.${match[2]}`, match[1]!, 'latest'],
  };
}

export async function manifests(root = repositoryRoot) {
  const workspace = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const application = JSON.parse(await readFile(join(root, 'apps/coolp/package.json'), 'utf8'));
  if (workspace.version !== application.version)
    throw new Error('Root and application versions must match');
  return { workspace, application, ...releaseVersion(workspace.version) };
}

export async function prepareVersion(input: string, root = repositoryRoot) {
  const { version } = releaseVersion(input);
  for (const name of ['package.json', 'apps/coolp/package.json']) {
    const path = join(root, name);
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.version = version;
    await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
  }
  return version;
}

export async function stagePackage(root = repositoryRoot) {
  const { workspace, application, version } = await manifests(root);
  const catalog = parse(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8'))
    .catalog as Record<string, string>;
  const target = join(root, 'dist/npm');
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const directory of ['dist', 'assets'])
    await cp(join(root, 'apps/coolp', directory), join(target, directory), { recursive: true });
  await cp(join(root, 'LICENSE'), join(target, 'LICENSE'));
  for (const file of ['README.md', 'README.en.md']) {
    const readme = await readFile(join(root, file), 'utf8');
    const absolute = readme.replace(
      /(!?)\[([^\]]*)\]\(([^)]+)\)/g,
      (all: string, image: string, label: string, path: string) => {
        if (/^(?:[a-z]+:|#|\/)/i.test(path)) return all;
        const base = image
          ? 'https://raw.githubusercontent.com/elonzh/cool-profile/v' + version + '/'
          : 'https://github.com/elonzh/cool-profile/blob/v' + version + '/';
        return image + '[' + label + '](' + base + path + ')';
      },
    );
    await writeFile(join(target, file), absolute);
  }
  await cp(join(root, 'apps/coolp/action.mjs'), join(target, 'action.mjs'));
  await cp(join(root, 'packages/graphics/assets/THEMES-LICENSE'), join(target, 'THEMES-LICENSE'));
  await cp(join(root, 'packages/data/assets/linguist-LICENSE'), join(target, 'LINGUIST-LICENSE'));
  const dependencies = Object.fromEntries(
    nativeDependencies.map((name) => {
      if (application.dependencies[name] !== 'catalog:' || !catalog[name])
        throw new Error('Unresolved native dependency: ' + name);
      return [name, catalog[name]];
    }),
  );
  const manifest = {
    name: workspace.name,
    version,
    description:
      'Generate multilingual profile cards and animations with coolp CLI and image server',
    type: 'module',
    license: workspace.license,
    engines: workspace.engines,
    bin: { coolp: './dist/coolp.mjs' },
    files: [
      'dist',
      'assets',
      'action.mjs',
      'README.md',
      'README.en.md',
      'LICENSE',
      'THEMES-LICENSE',
      'LINGUIST-LICENSE',
    ],
    homepage: 'https://elonzh.github.io/cool-profile/',
    repository: { type: 'git', url: 'git+https://github.com/elonzh/cool-profile.git' },
    bugs: { url: 'https://github.com/elonzh/cool-profile/issues' },
    publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
    dependencies,
  };
  await writeFile(join(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  await chmod(join(target, 'dist/coolp.mjs'), 0o755);
  await chmod(join(target, 'action.mjs'), 0o755);
  return target;
}

export async function packRelease(root = repositoryRoot) {
  const metadata = await manifests(root);
  const target = await stagePackage(root);
  const output = join(root, 'dist/release');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const packed = await execute(
    'npm',
    ['pack', target, '--ignore-scripts', '--json', '--pack-destination', output],
    { cwd: root },
  );
  const filename = (JSON.parse(packed.stdout) as { filename: string }[])[0]?.filename;
  if (!filename) throw new Error('npm pack did not produce a tarball');
  const bytes = await readFile(join(output, filename));
  const descriptor = {
    name: metadata.workspace.name,
    version: metadata.version,
    tag: metadata.tag,
    npmTag: metadata.npmTag,
    prerelease: metadata.prerelease,
    tarball: filename,
    imageTags: metadata.imageTags,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    images: ['docker.io/elonzh/cool-profile', 'docker.cnb.cool/elonzh/cool-profile'].map(
      (image) => image + ':' + metadata.version,
    ),
  };
  await writeFile(join(output, 'release.json'), JSON.stringify(descriptor, null, 2) + '\n');
  const checksums = await Promise.all(
    (await readdir(output)).map(
      async (name) =>
        createHash('sha256')
          .update(await readFile(join(output, name)))
          .digest('hex') +
        '  ' +
        name,
    ),
  );
  await writeFile(join(output, 'SHA256SUMS'), checksums.sort().join('\n') + '\n');
  return descriptor;
}

export async function tagRelease(root = repositoryRoot) {
  const { tag } = await manifests(root);
  const git = async (...args: string[]) =>
    (await execute('git', args, { cwd: root })).stdout.trim();
  if (await git('status', '--porcelain'))
    throw new Error('Commit the version and validated changes before tagging');
  if ((await git('branch', '--show-current')) !== 'main')
    throw new Error('Releases are cut from main');
  const head = await git('rev-parse', 'HEAD');
  for (const remote of ['origin', 'github']) {
    if ((await git('ls-remote', remote, 'refs/heads/main')).split(/\s/)[0] !== head)
      throw new Error(remote + '/main must match HEAD');
    if (await git('ls-remote', remote, 'refs/tags/' + tag))
      throw new Error(tag + ' already exists on ' + remote);
  }
  await git('tag', '-a', tag, '-m', 'Release ' + tag);
  // Keep the same tag object on both upstreams. A failed push can be retried explicitly.
  for (const remote of ['origin', 'github']) await git('push', remote, 'refs/tags/' + tag);
  return tag;
}
