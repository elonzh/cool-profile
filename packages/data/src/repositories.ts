import * as z from 'zod';
import type { DataRequest, Repository } from './types.js';
import type { SourceHttp } from './http.js';
import { DataError } from './http.js';
import { count, decode, metric } from './response.js';
import { languageColor } from './language-colors.js';
import { repositorySubjectIssue } from './repository-subject.js';

const cnbLanguage = z.object({ language: z.string(), color: z.string() });
const githubSummary = z.object({
  full_name: z.string(),
  private: z.boolean(),
  stargazers_count: count,
  fork: z.boolean(),
  language: z.string().nullable(),
});
const cnbSummary = z.object({
  path: z.string(),
  visibility_level: z.string(),
  star_count: count,
  languages: cnbLanguage,
  forked_from_repo: z.object({ path: z.string() }).nullish(),
});

interface PublicRepository {
  path: string;
  stars: number;
  fork: boolean;
  language: { name: string; color: string } | null;
}

function primaryLanguage(name: string | null, color?: string) {
  return name ? { name, color: languageColor(name, color) } : null;
}

export async function publicRepos(http: SourceHttp, username: string): Promise<PublicRepository[]> {
  if (http.source === 'cnb') http.requireToken();
  // Empty repository lists must still distinguish an existing account from a missing one.
  decode(
    http.source === 'github' ? z.object({ login: z.string() }) : z.object({ username: z.string() }),
    await http.get('/users/' + encodeURIComponent(username)),
    http.source,
  );
  const result: PublicRepository[] = [];
  const seen = new Set<string>();
  for (let page = 1; ; page++) {
    const query =
      http.source === 'github'
        ? new URLSearchParams({
            type: 'owner',
            sort: 'full_name',
            direction: 'asc',
            per_page: '100',
            page: String(page),
          })
        : new URLSearchParams({
            filter_type: 'public',
            role: 'Owner',
            order_by: 'slug_path',
            desc: 'false',
            page_size: '100',
            page: String(page),
          });
    const raw = await http.get('/users/' + encodeURIComponent(username) + '/repos?' + query);
    const rows =
      http.source === 'github'
        ? decode(z.array(githubSummary), raw, http.source).map((repo) => ({
            path: repo.full_name,
            stars: repo.stargazers_count,
            public: !repo.private,
            fork: repo.fork,
            language: primaryLanguage(repo.language),
          }))
        : decode(z.array(cnbSummary), raw, http.source).map((repo) => ({
            path: repo.path,
            stars: repo.star_count,
            public: repo.visibility_level === 'Public',
            fork: !!repo.forked_from_repo,
            language: primaryLanguage(repo.languages.language, repo.languages.color),
          }));
    if (!rows.length) break;
    let added = 0;
    for (const { public: isPublic, ...repo } of rows) {
      if (seen.has(repo.path)) continue;
      seen.add(repo.path);
      if (isPublic) result.push(repo);
      added++;
    }
    if (!added) throw new DataError(http.source + ' repository pagination did not advance');
  }
  return result;
}

export function repositoryApiPath(source: string, subject: string): string {
  const issue = repositorySubjectIssue(subject, source);
  if (issue) throw new DataError(issue, 'input');
  return (
    (source === 'github' ? '/repos/' : '/') + subject.split('/').map(encodeURIComponent).join('/')
  );
}

export async function loadRepository(
  http: SourceHttp,
  query: DataRequest<'repository'>,
): Promise<Repository> {
  const path = repositoryApiPath(http.source, query.subject);
  if (http.source === 'cnb') http.requireToken();
  const raw = await http.get(path);
  if (http.source === 'github') {
    const repo = decode(
      githubSummary.extend({
        description: z.string().nullable(),
        html_url: z.url(),
        forks_count: count,
        open_issues_count: count,
        license: z.object({ spdx_id: z.string().nullable(), name: z.string() }).nullable(),
      }),
      raw,
      http.source,
    );
    if (repo.private) throw new DataError('Public repository not found', 'not-found');
    return {
      name: repo.full_name,
      description: repo.description ?? '',
      url: repo.html_url,
      language: primaryLanguage(repo.language),
      license: repo.license
        ? repo.license.spdx_id && repo.license.spdx_id !== 'NOASSERTION'
          ? repo.license.spdx_id
          : repo.license.name
        : null,
      metrics: [
        metric('stars', repo.stargazers_count, 'current'),
        metric('forks', repo.forks_count, 'current'),
        metric('open-items', repo.open_issues_count, 'issues-and-pull-requests'),
      ],
    };
  }
  const repo = decode(
    cnbSummary.extend({
      description: z.string(),
      web_url: z.url(),
      fork_count: count,
      open_issue_count: count,
      open_pull_request_count: count,
      license: z.string(),
    }),
    raw,
    http.source,
  );
  if (repo.visibility_level !== 'Public')
    throw new DataError('Public repository not found', 'not-found');
  return {
    name: repo.path,
    description: repo.description,
    url: repo.web_url,
    language: primaryLanguage(repo.languages.language, repo.languages.color),
    license: repo.license || null,
    metrics: [
      metric('stars', repo.star_count, 'current'),
      metric('forks', repo.fork_count, 'current'),
      metric(
        'open-items',
        repo.open_issue_count + repo.open_pull_request_count,
        'issues-and-pull-requests',
      ),
    ],
  };
}
