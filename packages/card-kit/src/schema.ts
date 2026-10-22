import * as z from 'zod';

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function missingAt(value: unknown, path: readonly PropertyKey[]): boolean {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return false;
    if (!Object.hasOwn(current, key)) return true;
    current = Reflect.get(current, key);
  }
  return false;
}

function blocksPatch(
  issue: z.core.$ZodIssue,
  input: unknown,
  base: readonly PropertyKey[] = [],
): boolean {
  const path = [...base, ...issue.path];
  if (issue.code === 'invalid_union') {
    return !issue.errors.some((branch) =>
      branch.every((child) => !blocksPatch(child, input, path)),
    );
  }
  return !(issue.code === 'invalid_type' && missingAt(input, path));
}

export function issueMessage(issue: z.core.$ZodIssue): string {
  const path = issue.path.length ? issue.path.map(String).join('.') : '<root>';
  return path + ': ' + issue.message;
}

export function validatePatch(schema: z.ZodType, input: unknown, source: string): void {
  const result = schema.safeParse(input);
  if (result.success) return;
  const issues = result.error.issues.filter((issue) => blocksPatch(issue, input));
  if (issues.length) {
    throw new ConfigurationError(source + ': ' + issues.map(issueMessage).join('; '));
  }
}

export function parseSchema<T extends z.ZodType>(
  schema: T,
  input: unknown,
  source: string,
): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ConfigurationError(source + ': ' + result.error.issues.map(issueMessage).join('; '));
  }
  return result.data;
}
