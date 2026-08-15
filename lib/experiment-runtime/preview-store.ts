// Where a just-generated definition lives while it is being reviewed.
//
// sessionStorage, deliberately. The wizard and the preview iframe are the same origin, so
// the iframe can read what the wizard wrote — which means a refine appears in the running
// experiment immediately, with no database write, no server state, and nothing left behind
// if the lecturer abandons the experiment.
//
// It is also what keeps preview honest on a serverless host: there is no shared memory
// between invocations, so anything held server-side would vanish between requests.

import type { ExperimentDefinition } from './schema';

const KEY = 'cognitives_preview_definitions';

type Store = Record<string, ExperimentDefinition>;

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

export function putPreview(def: ExperimentDefinition): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify({ ...read(), [def.slug]: def }));
}

export function getPreview(slug: string): ExperimentDefinition | null {
  return read()[slug] ?? null;
}

export function clearPreview(slug: string): void {
  if (typeof window === 'undefined') return;
  const store = read();
  delete store[slug];
  sessionStorage.setItem(KEY, JSON.stringify(store));
}
