// Shared plumbing for the /api/create/* route handlers.

import { NextResponse } from 'next/server';
import { ClaudeError } from '@/lib/create-project/anthropic';

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
