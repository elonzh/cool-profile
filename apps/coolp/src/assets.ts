import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { createHash } from 'node:crypto';

export class AssetNotFoundError extends Error {
  constructor() {
    super('Asset not found');
    this.name = 'AssetNotFoundError';
  }
}

const mimeTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export async function readGalleryAsset(url: string, root: string) {
  const path = url.split('?')[0]!;
  const index = path === '/' || path === '/index.html';
  if (!index && !path.startsWith('/assets/')) return undefined;
  let name: string;
  try {
    name = index ? 'index.html' : decodeURIComponent(path.slice('/assets/'.length));
  } catch {
    throw new AssetNotFoundError();
  }
  const directory = resolve(root, index ? '.' : 'assets');
  const file = resolve(directory, name);
  const mime = mimeTypes[extname(file)];
  if (
    !mime ||
    dirname(file) !== directory ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0')
  )
    throw new AssetNotFoundError();
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new AssetNotFoundError();
    throw error;
  }
  return {
    bytes,
    mime,
    etag: '"' + createHash('sha256').update(bytes).digest('hex') + '"',
    cacheControl: index ? 'no-cache' : 'public, max-age=31536000, immutable',
  };
}
