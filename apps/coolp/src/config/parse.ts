import { parseDocument } from 'yaml';
import { ConfigurationError } from '@cool-profile/card-kit';
import { cloneJson } from './values.js';

export function parseConfigurationText(text: string, source: string, json = false): unknown {
  if (json) {
    try {
      JSON.parse(text);
    } catch {
      throw new ConfigurationError(source + ': invalid JSON');
    }
  }
  const document = parseDocument(text, {
    strict: true,
    uniqueKeys: true,
    prettyErrors: false,
    schema: 'core',
  });
  const issues = [...document.errors, ...document.warnings];
  if (issues.length) {
    throw new ConfigurationError(source + ': ' + issues.map((error) => error.message).join('; '));
  }
  try {
    return cloneJson(document.toJS({ maxAliasCount: 100 }));
  } catch (error) {
    if (error instanceof ConfigurationError)
      throw new ConfigurationError(source + ': ' + error.message);
    throw new ConfigurationError(source + ': invalid YAML structure');
  }
}
