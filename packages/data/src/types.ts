export interface Resource {
  source: string;
  subject: string;
}

export interface TimeWindow {
  year?: number;
  from?: string;
  to?: string;
}

export interface Metric {
  id: string;
  value: number | null;
  unit: string;
  scope: string;
}

export interface Activity {
  from: string;
  to: string;
  timezone: string;
  metric: 'contributions' | 'activity-score';
  days: readonly { date: string; value: number; level: number }[];
}

export interface ProfileStats {
  name: string;
  url: string;
  avatar?: string;
  metrics: readonly Metric[];
}

export interface Language {
  name: string;
  value: number;
  unit: string;
  color: string;
}

export interface Repository {
  name: string;
  description: string;
  url: string;
  metrics: readonly Metric[];
}

export interface DataCapabilities {
  activity: { query: Resource & TimeWindow; data: Activity };
  'profile-stats': { query: Resource; data: ProfileStats };
  languages: { query: Resource; data: readonly Language[] };
  repository: { query: Resource; data: Repository };
}

export type DataKind = keyof DataCapabilities;
export type DataRequest<K extends DataKind> = DataCapabilities[K]['query'] & { kind: K };

export type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;

export interface Snapshot<T> extends Readonly<Resource> {
  readonly collectedAt: string;
  readonly version: string;
  readonly permissionScope: string;
  readonly data: Immutable<T>;
}

export interface DataClient {
  read<K extends DataKind>(
    request: DataRequest<K>,
    options?: { signal?: AbortSignal; now?: Date },
  ): Promise<Snapshot<DataCapabilities[K]['data']>>;
}
