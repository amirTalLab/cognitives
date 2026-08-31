import { NextRequest, NextResponse } from 'next/server';
import { callClaude, parseJson, MODEL_FAST, CACHE, ClaudeError } from '@/lib/create-project/anthropic';
import { analyzeSystem, ANALYZE_USER_TEXT } from '@/lib/create-project/prompts';
import { loadSkill, SKILL_PAPER } from '@/lib/create-project/skills';
import { AnalyzeResponse } from '@/lib/create-project/types';
import { MOCK_ANALYSIS, MOCK_ANALYSIS_EMPTY, mockDelay, isMockMode } from '@/lib/create-project/fixtures';
import { errorResponse, validatePdf, requireAccess } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Stage 1: read the uploaded paper and list the experiments in it, each with a
 * feasibility verdict. The PDF is passed to the Messages API as a document block, so
 * no server-side PDF text extraction (and no poppler binary) is needed — which matters
 * because the local `pdftotext` fallback the skill uses does not exist on Vercel.
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireAccess(req);
    if (denied) return denied;

    const { pdfBase64, filename } = await req.json() as { pdfBase64: string; filename?: string };
    validatePdf(pdfBase64);

    if (isMockMode()) {
      await mockDelay();
      // Filename is the switch between the two branches worth eyeballing: a paper with
      // usable experiments, and the refusal case. Name a test file "…review.pdf" to see
      // the latter.
      const empty = /review|phenomenolog/i.test(filename ?? '');
      return NextResponse.json(empty ? MOCK_ANALYSIS_EMPTY : MOCK_ANALYSIS);
    }

    const { text, usage, stopReason } = await callClaude({
      model: MODEL_FAST,
      stage: 'analyze',
      system: analyzeSystem(await loadSkill(SKILL_PAPER)),
      maxTokens: 16000,
      messages: [{
        role: 'user',
        content: [
          // Cached: the spec stage sends this same PDF again a moment later, and a paper
          // is the largest single input in the pipeline.
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }, ...CACHE },
          { type: 'text', text: ANALYZE_USER_TEXT },
        ],
      }],
    });

    if (stopReason === 'max_tokens') {
      throw new ClaudeError(
        'The list of experiments ran out of output room. The paper is unusually long or describes very many studies; try a shorter paper.',
      );
    }
    return NextResponse.json({ ...parseJson<AnalyzeResponse>(text), usage, stopReason });
  } catch (err) {
    return errorResponse(err);
  }
}
