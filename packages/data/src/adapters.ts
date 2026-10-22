import * as z from 'zod';
import type { Activity, DataRequest, Metric, ProfileStats } from './types.js';
import { DataError } from './http.js';
import type { SourceHttp } from './http.js';
import { calendarWindow, dates, validDate } from './window.js';

const count = z.number().int().nonnegative();
const cnbDaySchema = z.object({
  score: z.number().nonnegative(),
  commit_count: count,
  pr_count: count,
  issues_count: count,
});
const cnbCalendarSchema = z.record(z.string().regex(/^\d{8}$/), cnbDaySchema);
const ghDaySchema = z.object({
  date: z.string(),
  contributionCount: count,
  contributionLevel: z.enum([
    'NONE',
    'FIRST_QUARTILE',
    'SECOND_QUARTILE',
    'THIRD_QUARTILE',
    'FOURTH_QUARTILE',
  ]),
});
const ghContributionsSchema = z.object({
  totalCommitContributions: count,
  totalIssueContributions: count,
  totalPullRequestContributions: count,
  contributionCalendar: z.object({
    colors: z.array(z.string()),
    weeks: z.array(z.object({ contributionDays: z.array(ghDaySchema) })),
  }),
});

function decode<S extends z.ZodType>(schema: S, value: unknown, source: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DataError(
      source +
        ' API returned invalid data at ' +
        result.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  }
  return result.data;
}

function metric(id: string, value: number, scope: string): Metric {
  return { id, value, scope, unit: 'count' };
}

async function publicRepos(http: SourceHttp, username: string): Promise<{ stars: number }[]> {
  const result: { stars: number }[] = [];
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
    const path = '/users/' + encodeURIComponent(username) + '/repos?' + query;
    const raw = await http.get(path);
    const rows =
      http.source === 'github'
        ? decode(
            z.array(
              z.object({ full_name: z.string(), private: z.boolean(), stargazers_count: count }),
            ),
            raw,
            http.source,
          ).map((repo) => ({
            path: repo.full_name,
            stars: repo.stargazers_count,
            public: !repo.private,
          }))
        : decode(
            z.array(
              z.object({ path: z.string(), visibility_level: z.string(), star_count: count }),
            ),
            raw,
            http.source,
          ).map((repo) => ({
            path: repo.path,
            stars: repo.star_count,
            public: repo.visibility_level === 'Public',
          }));
    if (!Array.isArray(raw) || raw.length === 0) break;
    let added = 0;
    for (const repo of rows) {
      if (seen.has(repo.path)) continue;
      seen.add(repo.path);
      if (repo.public) result.push({ stars: repo.stars });
      added++;
    }
    if (!added) throw new DataError(http.source + ' repository pagination did not advance');
  }
  return result;
}

async function githubContributions(http: SourceHttp, query: DataRequest<'activity'>, now: Date) {
  http.requireToken();
  const window = calendarWindow(query, now, 'UTC');
  const body = await http.post('/graphql', {
    query: `query ProfileActivity($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions totalIssueContributions totalPullRequestContributions
          contributionCalendar {
            colors weeks { contributionDays { date contributionCount contributionLevel } }
          }
        }
      }
    }`,
    variables: {
      login: query.subject,
      from: window.from + 'T00:00:00Z',
      to: window.to + 'T23:59:59Z',
    },
  });
  const response = decode(
    z.object({
      data: z
        .object({ user: z.object({ contributionsCollection: ghContributionsSchema }).nullable() })
        .optional(),
      errors: z.array(z.unknown()).optional(),
    }),
    body,
    'github',
  );
  if (response.errors?.length)
    throw new DataError('GitHub GraphQL rejected the contribution query');
  if (!response.data?.user) throw new DataError('GitHub user not found', 'not-found');
  return { ...window, collection: response.data.user.contributionsCollection };
}

async function cnbCalendar(http: SourceHttp, query: DataRequest<'activity'>, now: Date) {
  http.requireToken();
  const window = calendarWindow(query, now, 'Asia/Shanghai');
  const explicit = query.year !== undefined || query.from !== undefined || query.to !== undefined;
  const years = explicit
    ? [...new Set([window.from.slice(0, 4), window.to.slice(0, 4)])]
    : [undefined];
  const raw = await Promise.all(
    years.map((year) =>
      http.get(
        '/users/' + encodeURIComponent(query.subject) + '/calendar' + (year ? '?year=' + year : ''),
      ),
    ),
  );
  const calendar = Object.assign(
    {},
    ...raw.map((value) => decode(cnbCalendarSchema, value, 'cnb')),
  ) as z.output<typeof cnbCalendarSchema>;
  for (const key of Object.keys(calendar)) {
    if (!validDate(key.slice(0, 4) + '-' + key.slice(4, 6) + '-' + key.slice(6))) {
      throw new DataError('CNB calendar returned an invalid date');
    }
  }
  return { ...window, calendar };
}

export async function loadProfileStats(
  http: SourceHttp,
  query: DataRequest<'profile-stats'>,
  now: Date,
): Promise<ProfileStats> {
  http.requireToken();
  const calendarQuery = { ...query, kind: 'activity' as const };
  if (http.source === 'github') {
    const [user, repos, activity] = await Promise.all([
      http.get('/users/' + encodeURIComponent(query.subject)).then((raw) =>
        decode(
          z.object({
            login: z.string(),
            name: z.string().nullable(),
            html_url: z.string(),
            public_repos: count,
            followers: count,
          }),
          raw,
          'github',
        ),
      ),
      publicRepos(http, query.subject),
      githubContributions(http, calendarQuery, now),
    ]);
    const collection = activity.collection;
    return {
      name: user.name || user.login,
      url: user.html_url,
      metrics: [
        metric(
          'stars',
          repos.reduce((sum, repo) => sum + repo.stars, 0),
          'public-owned-repositories',
        ),
        metric('commits', collection.totalCommitContributions, 'last-365-days'),
        metric('pull-requests', collection.totalPullRequestContributions, 'last-365-days'),
        metric('issues', collection.totalIssueContributions, 'last-365-days'),
        metric('followers', user.followers, 'current'),
        metric('public-repositories', user.public_repos, 'current'),
      ],
    };
  }
  const [user, repos, activity] = await Promise.all([
    http.get('/users/' + encodeURIComponent(query.subject)).then((raw) =>
      decode(
        z.object({
          username: z.string(),
          nickname: z.string(),
          public_repo_count: count,
          follower_count: count,
        }),
        raw,
        'cnb',
      ),
    ),
    publicRepos(http, query.subject),
    cnbCalendar(http, calendarQuery, now),
  ]);
  const entries = dates(activity.from, activity.to).map(
    (date) => activity.calendar[date.replaceAll('-', '')],
  );
  const sum = (field: 'commit_count' | 'pr_count' | 'issues_count') =>
    entries.reduce((total, day) => total + (day?.[field] ?? 0), 0);
  return {
    name: user.nickname || user.username,
    url: 'https://cnb.cool/u/' + encodeURIComponent(user.username),
    metrics: [
      metric(
        'stars',
        repos.reduce((total, repo) => total + repo.stars, 0),
        'public-owned-repositories',
      ),
      metric('commits', sum('commit_count'), 'last-365-days'),
      metric('pull-requests', sum('pr_count'), 'last-365-days'),
      metric('issues', sum('issues_count'), 'last-365-days'),
      metric('followers', user.follower_count, 'current'),
      metric('public-repositories', user.public_repo_count, 'current'),
    ],
  };
}

export async function loadActivity(
  http: SourceHttp,
  query: DataRequest<'activity'>,
  now: Date,
): Promise<Activity> {
  if (http.source === 'github') {
    const { from, to, collection } = await githubContributions(http, query, now);
    const levels = [
      'NONE',
      'FIRST_QUARTILE',
      'SECOND_QUARTILE',
      'THIRD_QUARTILE',
      'FOURTH_QUARTILE',
    ];
    const byDate = new Map(
      collection.contributionCalendar.weeks
        .flatMap((week) => week.contributionDays)
        .map((day) => [day.date, day] as const),
    );
    const windowDates = dates(from, to);
    if (windowDates.some((date) => !byDate.has(date))) {
      throw new DataError('GitHub returned an incomplete contribution calendar');
    }
    return {
      from,
      to,
      timezone: 'UTC',
      metric: 'contributions',
      days: windowDates.map((date) => {
        const day = byDate.get(date)!;
        return { date, value: day.contributionCount, level: levels.indexOf(day.contributionLevel) };
      }),
    };
  }
  const { from, to, calendar } = await cnbCalendar(http, query, now);
  const values = dates(from, to).map((date) => ({
    date,
    value: calendar[date.replaceAll('-', '')]?.score ?? 0,
  }));
  const scores = [...new Set(values.map((day) => day.value).filter((value) => value > 0))].sort(
    (a, b) => b - a,
  );
  const levels = new Map<number, number>([[0, 0]]);
  let cursor = 0;
  for (let group = 0; group < 4; group++) {
    const size = Math.ceil((scores.length - group) / 4);
    for (const value of scores.slice(cursor, cursor + size)) levels.set(value, 4 - group);
    cursor += size;
  }
  return {
    from,
    to,
    timezone: 'Asia/Shanghai',
    metric: 'activity-score',
    days: values.map((day) => ({ ...day, level: levels.get(day.value)! })),
  };
}
