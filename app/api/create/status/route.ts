import { NextResponse } from 'next/server';
import { hasApiKey, MODEL_FAST, MODEL_STRONG } from '@/lib/create-project/anthropic';
import { skillStatus } from '@/lib/create-project/skills';
import { isMockMode } from '@/lib/create-project/fixtures';
import { hasSchemaAccess } from '@/lib/create-project/supabase-admin';

export const runtime = 'nodejs';

/**
 * Preflight for the wizard: report what is and isn't configured before the user has
 * uploaded anything, instead of failing four minutes into a generation.
 *
 * Reports only whether the API key exists — never the key itself.
 */
export async function GET() {
  return NextResponse.json({
    mock: isMockMode(),
    configured: hasApiKey(),
    modelFast: MODEL_FAST,
    modelStrong: MODEL_STRONG,
    canWriteFiles: process.env.NODE_ENV === 'development',
    canCreateTables: hasSchemaAccess(),
    skills: await skillStatus(),
  });
}
