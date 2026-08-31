import { NextRequest, NextResponse } from 'next/server';
import { callClaude, MODEL_STRONG, ClaudeError, Usage, CACHE } from '@/lib/create-project/anthropic';
import { generateSystem, GENERATE_BATCHES } from '@/lib/create-project/prompts';
import { loadSkill, SKILL_CODEGEN } from '@/lib/create-project/skills';
import { parsePayload } from '@/lib/create-project/file-format';
import { GeneratedFile, Spec } from '@/lib/create-project/types';
import { MOCK_GENERATION, mockDelay, isMockMode } from '@/lib/create-project/fixtures';
import { errorResponse, requireAccess } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Renders the confirmed spec as the prompt text for code generation. */
function specToPrompt(spec: Spec): string {
  const fields = spec.fields
    .map(f => `- ${f.label} [${f.source === 'paper' ? 'from paper' : 'inferred, confirmed by the lecturer'}]: ${f.value}`)
    .join('\n');

  return `Build this experiment. The lecturer has reviewed and confirmed the spec below.

URL slug: ${spec.slug}
English title: ${spec.title}
Hebrew title: ${spec.titleHe}
Category: ${spec.category}

${fields}`;
}

function sumUsage(parts: Usage[]): Usage {
  return parts.reduce((a, u) => ({
    input: a.input + u.input,
    output: a.output + u.output,
    cacheWrite: a.cacheWrite + u.cacheWrite,
    cacheRead: a.cacheRead + u.cacheRead,
  }), { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
}

/**
 * Stage 3: generate the experiment in dependency-ordered batches.
 *
 * Batching is what makes this survivable. A whole experiment asked for in one response
 * sits near the output ceiling, and going over used to lose every file including the
 * finished ones. Now each batch is well clear of the limit, and a batch that truncates is
 * reported by name while the others stand.
 *
 * Nothing is written to disk here — the files go back to the browser, which stages them.
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireAccess(req);
    if (denied) return denied;

    const { spec } = await req.json() as { spec: Spec };
    if (!spec?.slug) {
      return NextResponse.json({ error: 'No spec was provided.' }, { status: 400 });
    }

    if (isMockMode()) {
      await mockDelay(1200);
      return NextResponse.json(MOCK_GENERATION);
    }

    const skill = await loadSkill(SKILL_CODEGEN);
    const specText = specToPrompt(spec);

    const files: GeneratedFile[] = [];
    const usages: Usage[] = [];
    const notes: string[] = [];
    const problems: string[] = [];

    for (const batch of GENERATE_BATCHES) {
      const wanted = batch.files.map(f =>
        f.replace('[slug-kebab]', toKebab(spec.slug)).replace('[slug]', spec.slug),
      );

      // Earlier batches are context for later ones, so imports line up. Marked as a cache
      // prefix because batches 2 and 3 send an identical, growing block of files.
      const context = files.length
        ? `\n\n## Files already written\n\n${files.map(f => `===FILE: ${f.path}===\n${f.contents}\n===END===`).join('\n')}`
        : '';

      const { text, usage, stopReason } = await callClaude({
        model: MODEL_STRONG,
        stage: 'generate',
        system: generateSystem(skill, wanted),
        maxTokens: batch.maxTokens,
        messages: [{ role: 'user', content: [{ type: 'text', text: specText + context, ...CACHE }] }],
      });

      usages.push(usage);
      const parsed = parsePayload(text);
      files.push(...parsed.files);
      if (parsed.prose) notes.push(parsed.prose);

      // A file cut off mid-write is dropped by the parser; say which, and say why, rather
      // than letting a silently missing page surface later as a 404 in the preview.
      if (stopReason === 'max_tokens') {
        problems.push(`The "${batch.label}" pass ran out of output room. Missing or incomplete: ${parsed.truncated.join(', ') || 'unknown'}.`);
      } else if (parsed.truncated.length) {
        problems.push(`Incomplete file(s) in "${batch.label}": ${parsed.truncated.join(', ')}.`);
      }

      const missing = wanted.filter(w => !files.some(f => f.path === w));
      if (missing.length) problems.push(`"${batch.label}" did not produce: ${missing.join(', ')}.`);
    }

    if (files.length === 0) {
      throw new ClaudeError('The model returned no files. Try generating again.');
    }

    return NextResponse.json({
      files,
      notes: notes.join('\n\n'),
      problems,
      usage: sumUsage(usages),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** camelCase slug -> kebab, matching the lib/ and types/ naming convention. */
function toKebab(slug: string): string {
  return slug.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();
}
