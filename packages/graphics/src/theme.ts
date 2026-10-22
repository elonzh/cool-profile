const native = {
  cnb: {
    light: ['#f2f2f2', '#ffd9c2', '#ffb88c', '#ff8742', '#ff6200'],
    dark: ['#2c2c2c', '#6b2e13', '#85370b', '#a84105', '#db5400'],
    accent: ['#07b87d', '#00a16d'],
  },
  github: {
    light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    dark: ['#161b22', '#01311f', '#034525', '#0f6d31', '#00c647'],
    accent: ['#0969da', '#58a6ff'],
  },
} as const;

export function calendarPalette(source: 'github' | 'cnb', dark: boolean): readonly string[] {
  return native[source][dark ? 'dark' : 'light'];
}

export function cardTheme(source: 'github' | 'cnb', theme: string) {
  const dark = theme === 'dark';
  return {
    background: dark ? (source === 'cnb' ? '#202020' : '#0d1117') : '#ffffff',
    panel: dark ? (source === 'cnb' ? '#292929' : '#161b22') : '#f6f8fa',
    border: dark ? '#30363d' : '#d1d9e0',
    text: dark ? '#e6edf3' : '#1f2328',
    muted: dark ? '#9198a1' : '#59636e',
    accent: native[source].accent[dark ? 1 : 0],
  };
}
