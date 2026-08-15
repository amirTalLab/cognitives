import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateSlug, ownedPaths, StagingError } from '@/lib/create-project/staging';
import { errorResponse } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 300;

const run = promisify(execFile);

/**
 * Type-checks the staged experiment.
 *
 * The skill's Step 8 tells the agent to run `tsc --noEmit` before calling the job done.
 * In Claude Code a human agent does that; here nothing did, so generated code reached the
 * preview and failed as a Next.js error overlay — which tells a lecturer nothing useful.
 * This route is that missing step, and its output feeds the automatic repair pass.
 *
 * Development only: it needs the toolchain and the files on disk.
 */
export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ ok: true, errors: [], skipped: 'Type checking only runs locally.' });
    }

    const { slug } = await req.json() as { slug: string };
    validateSlug(slug);

    // Whole-project check: a generated file can break compilation somewhere else, and
    // tsc has to see the project's config to resolve the @/ path alias anyway.
    let output = '';
    try {
      const { stdout } = await run('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
        cwd: process.cwd(),
        shell: process.platform === 'win32',
        maxBuffer: 10 * 1024 * 1024,
      });
      output = stdout;
    } catch (err) {
      // tsc exits non-zero when it finds errors, which is the interesting case.
      output = (err as { stdout?: string }).stdout ?? (err as Error).message;
    }

    // Only report errors in this experiment's own files. Pre-existing warnings elsewhere
    // are not this generation's problem and must not trigger a repair pass.
    const { prefixes, files } = ownedPaths(slug);
    const isOurs = (line: string) => {
      const path = line.split('(')[0].replace(/\\/g, '/');
      return prefixes.some(p => path.includes(p)) || files.some(f => path.includes(f));
    };

    const errors = output
      .split('\n')
      .filter(l => /error TS\d+/.test(l))
      .filter(isOurs)
      .slice(0, 40); // enough for a repair pass; not so many the prompt bloats

    return NextResponse.json({ ok: errors.length === 0, errors });
  } catch (err) {
    if (err instanceof StagingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}
