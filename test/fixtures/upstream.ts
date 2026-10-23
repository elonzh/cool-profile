import repositories from './repositories.json' with { type: 'json' };
import { dates } from '../../packages/data/src/window.js';

export const fixedNow = new Date('2026-10-22T12:00:00Z');

export function fixtureApi(url: URL, body?: string, revision = 1): unknown {
  const cnb = url.pathname.startsWith('/cnb/') || url.hostname === 'api.cnb.cool';
  const path = url.pathname.replace(/^\/(?:cnb|github)/, '');
  if (path === '/graphql') {
    const input = JSON.parse(body ?? '{}') as { variables: { from: string; to: string } };
    const calendar = dates(input.variables.from.slice(0, 10), input.variables.to.slice(0, 10));
    return {
      data: {
        user: {
          contributionsCollection: {
            totalCommitContributions: revision * 9,
            totalIssueContributions: 3,
            totalPullRequestContributions: 4,
            totalPullRequestReviewContributions: 7,
            totalRepositoryContributions: 3,
            contributionCalendar: {
              colors: ['#9be9a8', '#40c463', '#30a14e', '#216e39'],
              weeks: [
                {
                  contributionDays: calendar.map((date, index) => ({
                    date,
                    contributionCount: index % 5,
                    contributionLevel: [
                      'NONE',
                      'FIRST_QUARTILE',
                      'SECOND_QUARTILE',
                      'THIRD_QUARTILE',
                      'FOURTH_QUARTILE',
                    ][index % 5],
                  })),
                },
              ],
            },
          },
        },
      },
    };
  }
  if (path === '/users/author')
    return cnb
      ? {
          username: 'author',
          nickname: '测试用户',
          public_repo_count: 7,
          follower_count: 2,
          repo_count: 99,
          stars_count: 9000,
          private_extra: 'not-a-public-field',
        }
      : {
          login: 'author',
          name: '测试用户',
          html_url: 'https://github.com/author',
          public_repos: 7,
          followers: 2,
          private_extra: 'not-a-public-field',
        };
  if (path === '/users/author/repos') {
    const page = Number(url.searchParams.get('page'));
    const stars = page === 1 ? [2, 999] : page === 2 ? [5] : [];
    return stars.map((value, index) =>
      cnb
        ? {
            path: 'author/repo-' + page + '-' + index,
            visibility_level: value === 999 ? 'Private' : 'Public',
            star_count: value,
            languages: {
              language: page === 1 ? 'TypeScript' : 'Python',
              color: page === 1 ? '#3178c6' : '#3572A5',
            },
            forked_from_repo: page === 2 ? { path: 'upstream/repo' } : null,
          }
        : {
            full_name: 'author/repo-' + page + '-' + index,
            private: value === 999,
            stargazers_count: value,
            language: page === 1 ? 'TypeScript' : 'Python',
            fork: page === 2,
          },
    );
  }
  if (path.match(/^\/repos\/author\/repo-\d-\d\/languages$/))
    return path.includes('repo-1-') ? { TypeScript: 300, CSS: 100 } : { Python: 100, CSS: 100 };
  if (path === '/repos/author/project' || path === '/author/group/project')
    return cnb ? repositories.cnb : repositories.github;
  if (path === '/users/author/calendar')
    return {
      '20251022': { score: 1000, commit_count: 1000, pr_count: 1000, issues_count: 1000 },
      '20261021': { score: 5, commit_count: 2, pr_count: 1, issues_count: 1 },
      '20261022': { score: 25, commit_count: revision * 7, pr_count: 3, issues_count: 2 },
    };
  throw new Error('Unexpected fixture API request: ' + url.pathname);
}

export const fixtureProviders = {
  github: { 'base-url': 'https://upstream.test/github', 'token-env': 'GITHUB_TOKEN' },
  cnb: { 'base-url': 'https://upstream.test/cnb', 'token-env': 'CNB_TOKEN' },
};
export const fixtureEnvironment = {
  GITHUB_TOKEN: 'fixture-github-token',
  CNB_TOKEN: 'fixture-cnb-token',
};

export function fixtureFetch(revision: () => number = () => 1): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    return Response.json(
      fixtureApi(url, typeof init?.body === 'string' ? init.body : undefined, revision()),
    );
  };
}
