import { NextRequest, NextResponse } from 'next/server';
import { callClaude, parseJson, MODEL_FAST, CACHE, ClaudeError } from '@/lib/create-project/anthropic';
import { specSystem } from '@/lib/create-project/prompts';
import { loadSkill, SKILL_PAPER } from '@/lib/create-project/skills';
import { Candidate, Spec } from '@/lib/create-project/types';
import { MOCK_SPEC, mockDelay, isMockMode } from '@/lib/create-project/fixtures';
import { errorResponse, validatePdf } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Stage 2: extract an editable design spec for the experiment the lecturer picked.
 * The PDF is sent again rather than relying on stage 1's summary, so timings, counts
 * and the reported effect come from the source text instead of a paraphrase.
 */
export async function POST(req: NextRequest) {
  try {
    const { pdfBase64, candidate } = await req.json() as { pdfBase64: string; candidate: Candidate };
    validatePdf(pdfBase64);
    if (!candidate?.name) {
      return NextResponse.json({ error: 'No experiment was selected.' }, { status: 400 });
    }

    if (isMockMode()) {
      await mockDelay();
      return NextResponse.json({ ...MOCK_SPEC, title: candidate.name || MOCK_SPEC.title });
    }

    const { text, usage, stopReason } = await callClaude({
      model: MODEL_FAST,
      system: specSystem(await loadSkill(SKILL_PAPER)),
      maxTokens: 16000,
      messages: [{
        role: 'user',
        content: [
          // Same bytes the analyze stage just cached, so this is a cache read.
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }, ...CACHE },
          {
            type: 'text',
            text: `Extract the design spec for this experiment from the paper:

Name: ${candidate.name}
Paradigm: ${candidate.paradigm}
Manipulation: ${candidate.manipulation}
Measure: ${candidate.measure}
Expected effect: ${candidate.expectedEffect}

Return the JSON object only.`,
          },
        ],
      }],
    });

    // A spec cut short loses whole design fields, which would silently reach the lecturer
    // as a shorter form than they should be reviewing.
    if (stopReason === 'max_tokens') {
      throw new ClaudeError(
        'The design spec ran out of output room before it was finished. This usually means the paper describes a very complex design; try picking a simpler experiment from the list.',
      );
    }
    return NextResponse.json({ ...parseJson<Spec>(text), usage, stopReason });
  } catch (err) {
    return errorResponse(err);
  }
}
