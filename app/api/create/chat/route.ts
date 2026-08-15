import { NextRequest, NextResponse } from 'next/server';
import { callClaude, MODEL_STRONG, Turn, CACHE } from '@/lib/create-project/anthropic';
import { chatSystem, repairSystem } from '@/lib/create-project/prompts';
import { loadSkill, SKILL_CODEGEN } from '@/lib/create-project/skills';
import { parsePayload } from '@/lib/create-project/file-format';
import { ChatMessage, GeneratedFile, Spec } from '@/lib/create-project/types';
import { mockChatReply, mockDelay, isMockMode } from '@/lib/create-project/fixtures';
import { errorResponse } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 800;

/**
 * Stage 4: back-and-forth revision of the generated experiment.
 *
 * The full current file set is resent on every turn rather than kept server-side. The
 * app is stateless on Vercel (no shared memory between invocations), and it keeps the
 * browser as the single source of truth for what the lecturer is actually looking at.
 */
export async function POST(req: NextRequest) {
  try {
    const { spec, files, messages, repair } = await req.json() as {
      spec: Spec;
      files: GeneratedFile[];
      messages: ChatMessage[];
      /** Set by the automatic compile-repair pass, which uses a stricter prompt. */
      repair?: boolean;
    };

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'There are no generated files to edit yet.' }, { status: 400 });
    }
    if (!messages?.length || messages[messages.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'No message to respond to.' }, { status: 400 });
    }

    if (isMockMode()) {
      await mockDelay();
      return NextResponse.json(mockChatReply(messages[messages.length - 1].content));
    }

    const fileDump = files
      .map(f => `===FILE: ${f.path}===\n${f.contents}\n===END===`)
      .join('\n');

    const context = `Experiment: ${spec.title} (slug: ${spec.slug})

Current files:

${fileDump}`;

    // Earlier turns are replayed as plain text so the model keeps the thread of the
    // conversation; the file dump above always reflects the latest state, so the
    // assistant's older JSON payloads are not resent.
    const history: Turn[] = [
      // Cached: the file dump is the bulk of every chat turn. It stays a cache hit across
      // turns that change nothing (questions, clarifications) and is rewritten only when
      // a turn actually edits a file.
      { role: 'user', content: [{ type: 'text', text: context, ...CACHE }] },
      { role: 'assistant', content: 'I have the current files. What would you like to change?' },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const skill = await loadSkill(SKILL_CODEGEN);
    const { text, usage, stopReason } = await callClaude({
      model: MODEL_STRONG,
      system: repair ? repairSystem(skill) : chatSystem(skill),
      maxTokens: 24000,
      messages: history,
    });

    const parsed = parsePayload(text);
    const problems: string[] = [];
    if (stopReason === 'max_tokens') {
      problems.push(`The reply ran out of output room. Incomplete: ${parsed.truncated.join(', ') || 'unknown'}. Ask for a smaller change.`);
    } else if (parsed.truncated.length) {
      problems.push(`Incomplete file(s): ${parsed.truncated.join(', ')}.`);
    }

    return NextResponse.json({
      reply: parsed.prose,
      files: parsed.files,
      problems,
      usage,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
