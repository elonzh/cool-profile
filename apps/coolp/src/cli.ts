#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { once } from 'node:events';
import * as z from 'zod';
import { createCardRegistry, ConfigurationError } from '@cool-profile/card-kit';
import type { Card } from '@cool-profile/card-kit';
import { DataError } from '@cool-profile/data';
import { cards } from '../../../generated/cards.ts';
import {
  loadConfiguration,
  requireCard,
  CardNotFoundError,
  resolveCardRequest,
  resolveBatch,
  resolveOutput,
  runtimeSchema,
} from './config/index.js';
import type { RuntimePatch } from './config/index.js';
import { decodeWire, schemaAt } from './config/wire.js';
import { parseOptions, stringFields } from './input/options.js';
import { parseGenerationFields } from './input/fields.js';
import { readPluginSettings, pluginEnvironment } from './input/plugin.js';
import { createRenderer, version } from './render.js';
import { createImageServer } from './server.js';

function output(stream: NodeJS.WritableStream, bytes: string | Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(bytes, (error?: Error | null) => (error ? reject(error) : resolve()));
  });
}

function take(options: Map<string, string | true>, name: string): string | undefined {
  const value = options.get(name);
  options.delete(name);
  if (value === true) throw new ConfigurationError('Expected a value for --' + name);
  return value;
}

function runtimeOptions(options: Map<string, string | true>, command: string): RuntimePatch {
  const runtime: Record<string, unknown> = {};
  const schema = z.toJSONSchema(runtimeSchema);
  for (const name of [
    'log-level',
    'output-dir',
    ...(command === 'serve' ? ['host', 'port'] : []),
  ]) {
    const raw = take(options, name);
    if (raw === undefined) continue;
    const path = name === 'host' || name === 'port' ? ['server', name] : [name];
    const value = decodeWire(schemaAt(schema, path), raw, 'CLI --' + name, schema);
    if (path.length === 1) runtime[name] = value;
    else {
      const server = (runtime.server ?? {}) as Record<string, unknown>;
      server[name] = value;
      runtime.server = server;
    }
  }
  return runtime;
}

function help(registry: ReadonlyMap<string, Card>, card?: Card): string {
  const usage = [
    'coolp ' + version,
    '',
    'coolp render <card-id> [options]   生成卡片',
    'coolp batch --config <file>       批量生成',
    'coolp serve [--host <ip>] [--port <port>]   启动图片服务',
    '',
    '--format --theme --locale --seed     公共媒体选项',
    '--params <JSON>                     卡片参数对象',
    '--config <file> --output <file|->    配置与文件输出',
    '--dry-run                           显示最终配置与来源',
    '',
  ];
  if (!card)
    usage.push(
      '卡片: ' + [...registry.keys()].join(', '),
      '使用 coolp render <card-id> --help 查看卡片参数',
    );
  else {
    usage.push(
      '卡片: ' + card.id,
      '格式: ' + card.formats.join(', '),
      '主题: ' + card.themes.join(', '),
      '语言: ' + card.locales.join(', '),
    );
    for (const [name, schema] of Object.entries(card.parameterSchema.properties ?? {})) {
      if (typeof schema === 'boolean') continue;
      usage.push('--' + name + '  ' + (schema.description ?? schema.type ?? 'JSON'));
    }
  }
  return usage.join('\n') + '\n';
}

async function main(
  args: readonly string[] = process.argv.slice(2),
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  try {
    const registry = createCardRegistry(cards);
    const { positionals, options } = parseOptions(args);
    const command = positionals[0];
    if (options.has('version')) {
      await output(process.stdout, version + '\n');
      return 0;
    }
    if (options.has('help') || !command) {
      const id = positionals[1];
      await output(process.stdout, help(registry, id ? requireCard(registry, id) : undefined));
      return 0;
    }
    if (!['render', 'batch', 'serve'].includes(command))
      throw new ConfigurationError('Unknown command: ' + command);
    if (positionals.length > (command === 'render' ? 2 : 1))
      throw new ConfigurationError('Unexpected positional arguments');
    const settings = readPluginSettings(environment);
    const configPath = take(options, 'config') ?? settings.config;
    const explicitOutput = take(options, 'output');
    const dryRun = options.delete('dry-run');
    const runtime = runtimeOptions(options, command);
    const configuration = await loadConfiguration(registry, {
      environment,
      ...(configPath !== undefined ? { config: configPath } : {}),
      runtimeInputs: [
        { source: 'PLUGIN', value: settings.runtime },
        { source: 'CLI', value: runtime },
      ],
    });
    const credentials = pluginEnvironment(settings, configuration.runtime.providers, environment);
    if (command === 'serve') {
      if (
        dryRun ||
        explicitOutput !== undefined ||
        settings.output !== undefined ||
        settings.fields.length ||
        options.size
      ) {
        throw new ConfigurationError(
          'serve accepts runtime options; configure card defaults in a file or COOLP__CARDS',
        );
      }
      const renderer = await createRenderer({ registry, configuration, environment: credentials });
      const server = createImageServer({ registry, configuration, renderer });
      server.listen(configuration.runtime.server.port, configuration.runtime.server.host);
      await once(server, 'listening');
      const close = () => {
        server.close();
        server.closeIdleConnections();
      };
      process.once('SIGINT', close);
      process.once('SIGTERM', close);
      if (configuration.runtime['log-level'] !== 'silent') {
        await output(
          process.stderr,
          'coolp listening on http://' +
            configuration.runtime.server.host +
            ':' +
            configuration.runtime.server.port +
            '\n',
        );
      }
      return 0;
    }
    const id = positionals[1] ?? environment.PLUGIN_CARD;
    const card =
      command === 'render'
        ? requireCard(
            registry,
            id ??
              (() => {
                throw new ConfigurationError('Select a card ID');
              })(),
          )
        : undefined;
    const plugin = parseGenerationFields(card, settings.fields, 'PLUGIN');
    const cli = parseGenerationFields(card, stringFields(options), 'CLI');
    if (command === 'batch' && (explicitOutput !== undefined || settings.output !== undefined)) {
      throw new ConfigurationError('batch uses output paths from jobs and --output-dir');
    }
    const jobs =
      command === 'batch'
        ? resolveBatch(configuration, registry, [plugin, cli])
        : (() => {
            const request = resolveCardRequest(configuration, registry, card!.id, {
              inputs: [plugin, cli],
            });
            const target = explicitOutput ?? settings.output;
            return [
              {
                request,
                output: resolveOutput(
                  configuration,
                  request,
                  target !== undefined ? { output: target } : {},
                ),
              },
            ];
          })();
    if (dryRun) {
      await output(
        process.stdout,
        JSON.stringify(
          {
            runtime: configuration.runtime,
            runtimeOrigins: Object.fromEntries(configuration.runtimeOrigins),
            jobs: jobs.map(({ request, output }) => ({ ...request, output })),
          },
          null,
          2,
        ) + '\n',
      );
      return 0;
    }
    const renderer = await createRenderer({ registry, configuration, environment: credentials });
    for (const job of jobs) {
      const media = await renderer.render(job.request);
      if (job.output === '-') await output(process.stdout, media.bytes);
      else {
        await mkdir(dirname(job.output), { recursive: true });
        await writeFile(job.output, media.bytes);
        if (configuration.runtime['log-level'] !== 'silent') {
          await output(process.stderr, job.output + ' (' + media.bytes.length + ' bytes)\n');
        }
      }
    }
    return 0;
  } catch (error) {
    await output(
      process.stderr,
      (error instanceof Error ? error.message : 'Generation failed') + '\n',
    );
    return error instanceof ConfigurationError ||
      error instanceof CardNotFoundError ||
      (error instanceof DataError && ['configuration', 'input'].includes(error.kind))
      ? 2
      : 1;
  }
}

process.exitCode = await main();
