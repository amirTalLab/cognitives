import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateSlug, StagingError } from '@/lib/create-project/staging';
import { errorResponse } from '../_shared';

export const runtime = 'nodejs';

/**
 * Puts a finished experiment on the homepage and into the middleware lock list.
 *
 * These two files are shared by all sixteen existing experiments, which is exactly why
 * generated code is never allowed to write them — a bad generation editing app/page.tsx
 * takes down the whole site. So the edits are made here instead, by the app, from
 * validated values: the model never supplies the text that gets inserted.
 *
 * Idempotent — registering twice is a no-op, so Regenerate cannot duplicate an entry.
 */

/** Reuses an icon app/page.tsx already imports, so registration never edits the imports. */
const DEFAULT_ICON = 'Shapes';

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'Registration edits source files, so it only works locally (npm run dev). On a deployed site, download the files and commit them.' },
        { status: 403 },
      );
    }

    const { slug, title, titleHe, category, target } = await req.json() as {
      slug: string; title: string; titleHe: string; category: string;
      /** 'definition' experiments live at /run/{slug}; generated code has its own route. */
      target?: 'definition' | 'code';
    };
    validateSlug(slug);

    // Everything interpolated below is either validated or stripped of anything that
    // could break out of a string literal.
    const safe = (s: string) => (s ?? '').replace(/['\\\n\r]/g, '').trim().slice(0, 80);
    const t = safe(title) || slug;
    const tHe = safe(titleHe) || t;
    const cat = safe(category).toUpperCase();

    const root = process.cwd();
    const done: string[] = [];
    const skipped: string[] = [];

    // ── app/page.tsx ──────────────────────────────────────────────────────────
    const pagePath = join(root, 'app', 'page.tsx');
    let page = await readFile(pagePath, 'utf8');

    if (page.includes(`id: '${slug}'`)) {
      skipped.push('already listed on the homepage');
    } else {
      // Without href, a definition-backed card links to /{slug} — a route that does not
      // exist, because definitions all run at /run/{slug}.
      const href = target === 'code' ? '' : `, href: '/run/${slug}'`;
      const entry = `  { id: '${slug}', title: '${t}', titleHe: '${tHe}', icon: ${DEFAULT_ICON}, color: 'text-purple-400'${href} },\n`;
      const anchor = page.indexOf('];', page.indexOf('const EXPERIMENTS'));
      if (anchor === -1) throw new StagingError('Could not find the EXPERIMENTS array in app/page.tsx.');
      page = page.slice(0, anchor) + entry + page.slice(anchor);
      done.push('added to the homepage experiment list');

      // Add the slug to its category row so the card actually renders.
      const catLine = new RegExp(`(\\{ name: '${cat}',[^}]*ids: \\[)([^\\]]*)(\\])`);
      if (catLine.test(page)) {
        page = page.replace(catLine, (_m, head, ids, tail) => {
          const list = ids.trim();
          return `${head}${list ? `${list}, ` : ''}'${slug}'${tail}`;
        });
        done.push(`filed under ${cat}`);
      } else {
        skipped.push(`no category row named "${cat}" — the card will not show until it is added to CATEGORIES`);
      }

      await writeFile(pagePath, page, 'utf8');
    }

    // ── middleware.ts ─────────────────────────────────────────────────────────
    const mwPath = join(root, 'middleware.ts');
    let mw = await readFile(mwPath, 'utf8');

    if (mw.includes(`'${slug}'`)) {
      skipped.push('already in the middleware lock list');
    } else {
      const setAnchor = mw.indexOf(']);', mw.indexOf('EXPERIMENT_SLUGS'));
      const matchAnchor = mw.indexOf('  ],', mw.indexOf('matcher:'));
      if (setAnchor === -1 || matchAnchor === -1) {
        throw new StagingError('Could not find the slug list in middleware.ts.');
      }
      // Insert into the matcher first: editing the earlier offset would shift the later one.
      // Definitions are matched under /run/, which is where they actually serve from.
      const route = target === 'code' ? `/${slug}` : `/run/${slug}`;
      mw = mw.slice(0, matchAnchor) + `    '${route}/:path*',\n` + mw.slice(matchAnchor);
      mw = mw.slice(0, setAnchor) + `  '${slug}',\n` + mw.slice(setAnchor);
      await writeFile(mwPath, mw, 'utf8');
      done.push('lock/unlock enabled');
    }

    return NextResponse.json({ done, skipped });
  } catch (err) {
    if (err instanceof StagingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}
