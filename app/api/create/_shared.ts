// Shared plumbing for the /api/create/* route handlers.

import { NextResponse } from 'next/server';
import { ClaudeError } from '@/lib/create-project/anthropic';
import { verifyPassword } from '@/lib/auth';

/** Header the create page sends the shared password in (plaintext, over HTTPS). */
const ACCESS_HEADER = 'x-cognitives-access';

/**
 * Server-side gate for the metered create endpoints.
 *
 * The site's password check is otherwise client-only — fine for hiding UI, useless for
 * protecting an endpoint that spends API credits, since anyone could POST here directly.
 * This verifies the shared password on the SERVER before any paid Claude call. The client
 * sends the plaintext the teacher typed at the gate; only the hash is ever in the bundle,
 * so reading the bundle does not get you in. Pair it with a spend cap on the API key.
 *
 * Returns a 401 response to short-circuit with, or null when access is granted.
 */
export async function requireAccess(req: Request): Promise<NextResponse | null> {
  const provided = req.headers.get(ACCESS_HEADER) ?? '';
  if (provided && (await verifyPassword(provided))) return null;
  return NextResponse.json(
    { error: 'Not authorised. Enter the site password on the builder page to use it.' },
    { status: 401 },
  );
}

/** Turns any thrown value into a JSON error response the wizard can display. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ClaudeError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Rejects a base64 PDF that is missing or too large to send to the API. */
export function validatePdf(pdfBase64: unknown): string {
  if (typeof pdfBase64 !== 'string' || pdfBase64.length === 0) {
    throw new ClaudeError('No PDF was provided.', 400);
  }
  // base64 inflates by ~4/3; the Messages API caps documents at 32MB.
  const bytes = (pdfBase64.length * 3) / 4;
  if (bytes > 30 * 1024 * 1024) {
    throw new ClaudeError('That PDF is too large (over 30MB). Try a smaller file.', 413);
  }
  return pdfBase64;
}
