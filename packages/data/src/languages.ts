import * as z from 'zod';
import type { DataRequest, LanguageBreakdown } from './types.js';
import type { SourceHttp } from './http.js';
import { DataError } from './http.js';
import { count, decode } from './response.js';
import { publicRepos, repositoryApiPath } from './repositories.js';
import { languageColor } from './language-colors.js';

export async function loadLanguages(
  http: SourceHttp,
  query: DataRequest<'languages'>,
): Promise<LanguageBreakdown> {
  const unit = query.metric ?? (http.source === 'github' ? 'bytes' : 'repositories');
  if (unit === 'bytes' && http.source !== 'github') {
    throw new DataError('CNB supports the repositories language metric', 'input');
  }
  const repos = (await publicRepos(http, query.subject)).filter(
    (repo) => (query['include-forks'] || !repo.fork) && !query['exclude-repo']?.includes(repo.path),
  );
  const totals = new Map<string, { name: string; value: number; color: string }>();
  const add = (name: string, value: number, color: string) => {
    if (!value) return;
    const language = totals.get(name);
    if (language) language.value += value;
    else totals.set(name, { name, value, color });
  };
  let classifiedRepositories = 0;
  if (unit === 'repositories') {
    for (const repo of repos) {
      if (!repo.language) continue;
      classifiedRepositories++;
      add(repo.language.name, 1, repo.language.color);
    }
  } else {
    const rows = await Promise.all(
      repos.map((repo) =>
        http
          .get(repositoryApiPath(http.source, repo.path) + '/languages')
          .then((raw) => decode(z.record(z.string().min(1), count), raw, http.source)),
      ),
    );
    for (const row of rows) {
      if (Object.values(row).some((value) => value > 0)) classifiedRepositories++;
      for (const [name, value] of Object.entries(row)) add(name, value, languageColor(name));
    }
  }
  return {
    unit,
    scope: query['include-forks']
      ? 'public-owned-repositories'
      : 'public-owned-non-fork-repositories',
    repositoryCount: repos.length,
    classifiedRepositories,
    languages: [...totals.values()].sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name, 'en'),
    ),
  };
}
