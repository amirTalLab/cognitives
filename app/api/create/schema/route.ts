import { NextRequest, NextResponse } from 'next/server';
import {
  applyPlan, dropIfEmpty, planSchema, SchemaError, validateSchemaSql, tablePrefix,
} from '@/lib/create-project/supabase-admin';
import { validateSlug, StagingError } from '@/lib/create-project/staging';
import { isMockMode, mockDelay } from '@/lib/create-project/fixtures';
import { errorResponse } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Brings the experiment's Supabase table into line with its generated schema.
 *
 * Deliberately not a blind CREATE TABLE IF NOT EXISTS: that is a no-op on an existing
 * table, so a refine that changed the columns would report success and change nothing,
 * leaving the experiment inserting columns the database does not have. It reads the live
 * table first and does only what is actually needed.
 *
 * Never destructive. Missing columns are added; columns the schema no longer declares are
 * reported as drift and left alone.
 */
export async function POST(req: NextRequest) {
  try {
    const { sql, slug } = await req.json() as { sql: string; slug: string };
    validateSlug(slug);
    if (!sql?.trim()) {
      return NextResponse.json({ error: 'No schema SQL was generated for this experiment.' }, { status: 400 });
    }

    if (isMockMode()) {
      await mockDelay(400);
      // Still run the allow-list: mock mode is where it gets exercised for free, and SQL
      // that would be refused in production must be refused here too.
      const { tables } = validateSchemaSql(sql, slug);
      return NextResponse.json({
        table: tables[0], action: 'create', missing: [], extra: [], simulated: true,
      });
    }

    const plan = await planSchema(sql, slug);
    await applyPlan(plan, slug);
    return NextResponse.json({ ...plan, statements: undefined, simulated: false });
  } catch (err) {
    if (err instanceof SchemaError || err instanceof StagingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}

/** Removes a discarded experiment's table, but only when it has collected nothing. */
export async function DELETE(req: NextRequest) {
  try {
    const { slug, table } = await req.json() as { slug: string; table?: string };
    validateSlug(slug);

    if (isMockMode()) {
      await mockDelay(300);
      return NextResponse.json({ result: 'dropped', simulated: true });
    }

    const result = await dropIfEmpty(slug, table || `${tablePrefix(slug)}_results`);
    return NextResponse.json({ result, simulated: false });
  } catch (err) {
    if (err instanceof SchemaError || err instanceof StagingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}
