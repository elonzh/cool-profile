import { ConfigurationError } from '@cool-profile/card-kit';

export interface ParsedOptions {
  positionals: string[];
  options: Map<string, string | true>;
}
const aliases: Record<string, string> = { o: 'output', h: 'help', v: 'version' };
const flags = new Set(['help', 'version', 'dry-run']);

export function parseOptions(args: readonly string[]): ParsedOptions {
  const options = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    if (token === '--') {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (!token.startsWith('-') || token === '-') {
      positionals.push(token);
      continue;
    }
    let name: string;
    let value: string | true;
    const equals = token.indexOf('=');
    if (token.startsWith('--')) name = token.slice(2, equals >= 0 ? equals : undefined);
    else {
      name = aliases[token.slice(1)] ?? '';
      if (!name) throw new ConfigurationError('Unknown short option: ' + token);
    }
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name))
      throw new ConfigurationError('Invalid option: ' + token);
    if (options.has(name)) throw new ConfigurationError('Duplicate option: --' + name);
    if (flags.has(name)) {
      if (equals >= 0) throw new ConfigurationError('--' + name + ' does not accept a value');
      value = true;
    } else if (equals >= 0) value = token.slice(equals + 1);
    else {
      const next = args[++index];
      if (next === undefined || next.startsWith('--')) {
        throw new ConfigurationError('Missing value for --' + name);
      }
      value = next;
    }
    options.set(name, value);
  }
  return { positionals, options };
}

export function stringFields(options: ReadonlyMap<string, string | true>): [string, string][] {
  return [...options].map(([name, value]) => {
    if (value === true) throw new ConfigurationError('Unexpected flag: --' + name);
    return [name, value];
  });
}
