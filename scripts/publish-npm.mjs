import { readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const release = JSON.parse(await readFile('dist/release/release.json', 'utf8'));
const file = 'dist/release/' + release.tarball;
const bytes = await readFile(file);
if (createHash('sha256').update(bytes).digest('hex') !== release.sha256)
  throw new Error('Release checksum mismatch');
const response = await fetch(
  'https://registry.npmjs.org/' +
    encodeURIComponent(release.name) +
    '/' +
    encodeURIComponent(release.version),
);
if (response.ok) {
  const existing = await response.json();
  const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  if (existing.dist?.integrity !== integrity)
    throw new Error('This npm version already exists with different contents');
  console.log('Identical npm version already published; continuing this release');
} else if (response.status === 404) {
  execFileSync(
    'npm',
    ['publish', file, '--access', 'public', '--provenance', '--tag', release.npmTag],
    { stdio: 'inherit' },
  );
} else throw new Error('npm registry returned HTTP ' + response.status);

// Resuming an older release must not roll back the current image channel.
const channel = await fetch(
  'https://registry.npmjs.org/' + encodeURIComponent(release.name) + '/' + release.npmTag,
);
if (!channel.ok)
  throw new Error('Unable to verify the published npm channel: HTTP ' + channel.status);
const promote = (await channel.json()).version === release.version;
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, 'promote-images=' + promote + '\n');
console.log(promote ? 'Promoting matching image channels' : 'Keeping the current image channels');
