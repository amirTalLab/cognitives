import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GeneratedFile } from '@/lib/create-project/types';
import { isOwnedPath, ownedPaths, StagingError, validateSlug } from '@/lib/create-project/staging';
import { errorResponse } from '../_shared';

export const runtime = 'nodejs';

/**
 * Writes the generated experiment into the working copy so the dev server compiles it and
 * the lecturer can click through the real thing at /{slug} — the point of the feature,
 * since judging an experiment from its source is not something a lecturer should have to do.
 *
 * Local development only. Vercel's filesystem is read-only at runtime, so on the deployed
 * site the route refuses and the wizard falls back to downloading the files.
 *
 * Overwriting IS allowed here, unlike a plain save: refining in chat regenerates files
 * that were staged a moment ago. The protection is not "never overwrite" but "can only
 * ever write inside this slug's own directories" — see lib/create-project/staging.ts.
 */
export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'Live preview only works when running locally (npm run dev), because a deployed server cannot write files. Download the files and commit them instead.' },
        { status: 403 },
      );
    }

    const { files, slug } = await req.json() as { files: GeneratedFile[]; slug: string };
    validateSlug(slug);
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files to stage.' }, { status: 400 });
    }

    const root = process.cwd();
    const written: string[] = [];
    const refused: { path: string; reason: string }[] = [];

    for (const file of files) {
      if (!isOwnedPath(file.path, slug)) {
        refused.push({ path: file.path, reason: `outside the ${slug} experiment` });
        continue;
      }
      const target = join(root, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.contents, 'utf8');
      written.push(file.path);
    }

    return NextResponse.json({ written, refused });
  } catch (err) {
    if (err instanceof StagingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}

/** Removes a staged experiment, so an unwanted generation leaves nothing behind. */
export async function DELETE(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Nothing is staged on a deployed server.' }, { status: 403 });
    }

    const { slug } = await req.json() as { slug: string };
    validateSlug(slug);

    const root = process.cwd();
    const { prefixes, files } = ownedPaths(slug);
    const targets = [...prefixes.map(p => p.replace(/\/$/, '')), ...files];
    for (const target of targets) {
      await rm(join(root, target), { recursive: true, force: true });
    }

    return NextResponse.json({ removed: targets });
  } catch (err) {
    if (err instanceof StagingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}
