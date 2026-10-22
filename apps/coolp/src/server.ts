import { fileURLToPath } from 'node:url';
import { readGalleryAsset, AssetNotFoundError } from './assets.js';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigurationError } from '@cool-profile/card-kit';
import type { Card } from '@cool-profile/card-kit';
import { DataError } from '@cool-profile/data';
import { CardNotFoundError, resolveCardRequest } from './config/index.js';
import type { Configuration } from './config/index.js';
import { parseCardUrl } from './input/url.js';
import type { Renderer } from './render.js';

function sendMedia(
  request: IncomingMessage,
  response: ServerResponse,
  media: { bytes: Buffer; mime: string; etag: string },
  cacheControl: string,
) {
  const headers = {
    'Content-Type': media.mime,
    ETag: media.etag,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  };
  const condition = request.headers['if-none-match'];
  const matches =
    typeof condition === 'string' &&
    condition
      .split(',')
      .some((tag) => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === media.etag);
  if (matches) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, { ...headers, 'Content-Length': media.bytes.length });
  response.end(request.method === 'HEAD' ? undefined : media.bytes);
}

export function createImageServer(options: {
  registry: ReadonlyMap<string, Card>;
  configuration: Configuration;
  renderer: Renderer;
  galleryRoot?: string;
}) {
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const controller = new AbortController();
    response.once('close', () => {
      if (!response.writableEnded) controller.abort();
    });
    try {
      const asset = await readGalleryAsset(
        request.url ?? '/',
        options.galleryRoot ?? fileURLToPath(new URL('../assets/gallery/', import.meta.url)),
      );
      if (asset) {
        sendMedia(request, response, asset, asset.cacheControl);
        return;
      }
      const parsed = parseCardUrl(request.url ?? '/', options.registry);
      const normalized = resolveCardRequest(options.configuration, options.registry, parsed.id, {
        inputs: [parsed.input],
      });
      const media = await options.renderer.render(normalized, controller.signal);
      sendMedia(
        request,
        response,
        media,
        'public, max-age=' + options.configuration.runtime.cache.ttl,
      );
    } catch (error) {
      if (controller.signal.aborted || response.destroyed) return;
      const status =
        error instanceof AssetNotFoundError ||
        error instanceof CardNotFoundError ||
        (error instanceof DataError && error.kind === 'not-found')
          ? 404
          : error instanceof ConfigurationError ||
              (error instanceof DataError && error.kind === 'input')
            ? 400
            : error instanceof DataError
              ? 502
              : 500;
      const message =
        error instanceof AssetNotFoundError ||
        error instanceof ConfigurationError ||
        error instanceof DataError ||
        error instanceof CardNotFoundError
          ? error.message
          : 'Media generation failed';
      const body = JSON.stringify({ error: { status, message } });
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    }
  };
  return createServer((request, response) => {
    void handle(request, response);
  });
}
