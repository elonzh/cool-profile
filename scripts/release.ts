import { appendFile } from 'node:fs/promises';
import { manifests, packRelease, prepareVersion, stagePackage, tagRelease } from './release-lib.js';
const [command, input] = process.argv.slice(2);
if (command === 'prepare' && input) console.log('Prepared ' + (await prepareVersion(input)));
else if (command === 'stage') console.log(await stagePackage());
else if (command === 'pack') console.log(JSON.stringify(await packRelease()));
else if (command === 'tag') console.log(await tagRelease());
else if (command === 'check') {
  const metadata = await manifests();
  const expected = input ?? process.env.GITHUB_REF_NAME;
  if (expected && expected !== metadata.tag)
    throw new Error('Tag ' + expected + ' does not match ' + metadata.tag);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      Object.entries({
        version: metadata.version,
        tag: metadata.tag,
        prerelease: String(metadata.prerelease),
      })
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
  console.log(
    JSON.stringify({ version: metadata.version, tag: metadata.tag, npmTag: metadata.npmTag }),
  );
} else
  throw new Error('Usage: release prepare <version> | stage | pack | check [v<version>] | tag');
