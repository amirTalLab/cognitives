import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExperimentDefinition } from '@/lib/experiment-runtime/schema';

export const runtime = 'nodejs';

/**
 * Serves a definition straight from experiments/<slug>.json, in development only.
 *
 * Without this, looking at an experiment means publishing it first — pushing a draft to
 * the shared Supabase project, where every other lecturer can see it, just to check that
 * a fixation cross lasts long enough. That is the wrong order: you preview, then decide
 * whether it deserves to exist.
 *
 * It also means the terminal path needs no database at all to iterate. Publishing becomes
 * the deliberate last step it should have been.
 */

/** Character check only — this reads a path, so the slug must not escape the folder. */
const SLUG = /^[a-zA-Z][a-zA-Z0-9-]*$/;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  // 404 rather than 403: on a deployed site this route simply does not exist, and saying
  // so invites nobody to go looking for the files behind it.
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { slug } = await params;
  if (!SLUG.test(slug)) {
    return NextResponse.json({ error: 'Not a usable slug.' }, { status: 400 });
  }

  let raw: string;
  try {
    raw = await readFile(join(process.cwd(), 'experiments', `${slug}.json`), 'utf8');
  } catch {
    // The ordinary case: most slugs are built-in or published, not local files.
    return NextResponse.json({ error: 'No local definition.' }, { status: 404 });
  }

  try {
    const definition = JSON.parse(raw) as ExperimentDefinition;
    return NextResponse.json({ definition });
  } catch (err) {
    // Surfaced rather than swallowed — a file being edited by hand is malformed often, and
    // silently falling through to "no experiment named X" would hide the reason.
    return NextResponse.json(
      { error: `experiments/${slug}.json is not valid JSON: ${err instanceof Error ? err.message : 'parse failed'}` },
      { status: 422 },
    );
  }
}
