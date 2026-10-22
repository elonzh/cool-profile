import colors from '../assets/language-colors.json' with { type: 'json' };

export function languageColor(name: string, providerColor?: string): string {
  if (providerColor && /^#[0-9a-f]{6}$/i.test(providerColor)) return providerColor;
  const known = Object.hasOwn(colors, name) ? (colors as Record<string, string>)[name] : undefined;
  if (known) return known;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return 'hsl(' + (hash % 360) + ',55%,55%)';
}
