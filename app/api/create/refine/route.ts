import { NextRequest, NextResponse } from 'next/server';
import { callClaude, parseJson, MODEL_STRONG, CACHE } from '@/lib/create-project/anthropic';
import { definitionSystem } from '@/lib/create-project/prompts';
import { loadSkill, loadSource, SKILL_CODEGEN } from '@/lib/create-project/skills';
import { ChatMessage } from '@/lib/create-project/types';
import { ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import { validate } from '@/lib/experiment-runtime/validate';
import { isMockMode, mockDelay } from '@/lib/create-project/fixtures';
import { errorResponse } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Applies a plain-language change to an experiment definition.
 *
 * The definition path's version of refining. Far cheaper than editing code — the whole
 * experiment is a few KB, so a turn sends and returns a fraction of what rewriting TSX
 * files costs — and the result is validated before it reaches the preview, so a bad edit
 * is caught in seconds rather than surfacing as a broken experiment.
 */
export async function POST(req: NextRequest) {
  try {
    const { definition, messages } = await req.json() as {
      definition: ExperimentDefinition;
      messages: ChatMessage[];
    };

    if (!definition?.slug) {
      return NextResponse.json({ error: 'There is no experiment to refine yet.' }, { status: 400 });
    }
    const request = messages?.[messages.length - 1];
    if (!request || request.role !== 'user') {
      return NextResponse.json({ error: 'No message to respond to.' }, { status: 400 });
    }

    if (isMockMode()) {
      await mockDelay(700);
      return NextResponse.json({
        definition,
        issues: [],
        reply: `**Mock mode** — nothing was changed.\n\nYou asked: "${request.content}"\n\nWith a real API key the definition would be edited and the preview above would rebuild.`,
      });
    }

    const [skill, schema] = await Promise.all([
      loadSkill(SKILL_CODEGEN),
      loadSource('lib/experiment-runtime/schema.ts'),
    ]);

    const history = messages.slice(0, -1)
      .map(m => `${m.role === 'user' ? 'Lecturer' : 'You'}: ${m.content}`)
      .join('\n');

    const prompt = `Here is the current experiment definition:

${JSON.stringify(definition, null, 2)}
${history ? `\nEarlier in this conversation:\n${history}\n` : ''}
The lecturer now asks: "${request.content}"

Apply it and return the COMPLETE updated definition — the whole object, not a fragment. Keep the slug "${definition.slug}" unchanged. Change only what was asked; leave everything else exactly as it is.

If the request cannot be expressed in the schema, return the definition unchanged and explain why in "reply".

Return a JSON object of the form { "reply": "one or two sentences on what you changed", "definition": { ... } }.`;

    const { text, usage } = await callClaude({
      model: MODEL_STRONG,
      system: definitionSystem(skill, schema),
      maxTokens: 8000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt, ...CACHE }] }],
    });

    const result = parseJson<{ reply: string; definition: ExperimentDefinition }>(text);
    const updated = { ...result.definition, slug: definition.slug };

    return NextResponse.json({
      definition: updated,
      issues: validate(updated),
      reply: result.reply ?? '',
      usage,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
