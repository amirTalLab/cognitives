import { NextRequest, NextResponse } from 'next/server';
import { ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import { validate } from '@/lib/experiment-runtime/validate';
import { validateSlug, StagingError } from '@/lib/create-project/staging';
import { errorResponse } from '../_shared';

export const runtime = 'nodejs';

/**
 * Checks a definition before it is saved.
 *
 * The write itself happens in the browser, through the same anon key the rest of the site
 * uses, so this route is the gate rather than the writer: it refuses to bless a definition
 * that would not run. Publishing a broken experiment is worse than failing to publish,
 * because the failure surfaces during a class instead of here.
 */
export async function POST(req: NextRequest) {
  try {
    const { definition } = await req.json() as { definition: ExperimentDefinition };
    if (!definition?.slug) {
      return NextResponse.json({ error: 'There is no experiment to publish.' }, { status: 400 });
    }
    validateSlug(definition.slug);

    const errors = validate(definition).filter(i => i.severity === 'error');
    if (errors.length > 0) {
      return NextResponse.json({
        ok: false,
        error: `it does not pass validation:\n${errors.map(e => `• ${e.message}`).join('\n')}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StagingError) {
      return NextResponse.json({ ok: false, error: err.message });
    }
    return errorResponse(err);
  }
}
