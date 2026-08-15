import { NextRequest, NextResponse } from 'next/server';
import { callClaude, parseJson, MODEL_STRONG, ClaudeError, Usage, CACHE } from '@/lib/create-project/anthropic';
import { definitionSystem } from '@/lib/create-project/prompts';
import { loadSkill, loadSource, SKILL_CODEGEN } from '@/lib/create-project/skills';
import { Spec } from '@/lib/create-project/types';
import { AssetManifest, ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import { validate } from '@/lib/experiment-runtime/validate';
import { MOCK_DEFINITION, mockDelay, isMockMode } from '@/lib/create-project/fixtures';
import { errorResponse } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 600;

const SCHEMA_PATH = 'lib/experiment-runtime/schema.ts';
/** One retry. A second failure usually means the design does not fit, not a slip. */
const MAX_REPAIRS = 1;

function specToPrompt(spec: Spec, assets?: AssetManifest): string {
  const fields = spec.fields
    .map(f => `- ${f.label} [${f.source === 'paper' ? 'from paper' : 'inferred, confirmed by the lecturer'}]: ${f.value}`)
    .join('\n');

  // Named exhaustively rather than described. The model has to write these strings
  // character for character into image srcs, and a filename it half-remembers renders as a
  // broken picture in front of a class.
  const assetBlock = assets?.files.length
    ? `\n\nThe lecturer uploaded these image files. Use them as image srcs, spelled EXACTLY as listed, and use no other filename. Do not set "assets" yourself — it is filled in for you.\n${assets.files.map(f => `- ${f}`).join('\n')}`
    : '\n\nNo image files were uploaded, so every stimulus must be drawn from text and inline shapes.';

  return `Build this experiment as a definition. The lecturer has reviewed and confirmed the spec.

URL slug: ${spec.slug}
English title: ${spec.title}
Hebrew title: ${spec.titleHe}
Category: ${spec.category}

${fields}${assetBlock}`;
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
 * Generates an experiment definition from a confirmed spec.
 *
 * The definition path, as opposed to /api/create/generate which writes code. Cheaper by an
 * order of magnitude (a few KB of JSON instead of ~20k tokens of TSX), instantly
 * previewable because nothing needs building, and safe because an uploaded paper can never
 * cause code to execute — the output is data checked against a schema.
 *
 * Validation failures go straight back to the model. Unlike a compile error this costs
 * seconds and pennies, so it is worth doing before the lecturer ever sees the result.
 */
export async function POST(req: NextRequest) {
  try {
    const { spec, assets } = await req.json() as { spec: Spec; assets?: AssetManifest };
    if (!spec?.slug) {
      return NextResponse.json({ error: 'No spec was provided.' }, { status: 400 });
    }

    if (isMockMode()) {
      await mockDelay(1200);
      return NextResponse.json({ definition: MOCK_DEFINITION, issues: [], repairs: 0 });
    }

    const [skill, schema] = await Promise.all([loadSkill(SKILL_CODEGEN), loadSource(SCHEMA_PATH)]);
    const system = definitionSystem(skill, schema);
    const usages: Usage[] = [];

    let prompt = specToPrompt(spec, assets);
    let definition: ExperimentDefinition | null = null;
    let issues: ReturnType<typeof validate> = [];

    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
      const { text, usage } = await callClaude({
        model: MODEL_STRONG,
        system,
        maxTokens: 8000,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt, ...CACHE }] }],
      });
      usages.push(usage);

      // A parse failure is retried like a validation failure rather than thrown. The call
      // has already been paid for, and "your JSON did not parse, here is the error" is
      // something a model fixes reliably — losing the whole generation over a stray comma
      // would be the expensive way to handle it.
      try {
        definition = parseJson<ExperimentDefinition>(text);
      } catch (err) {
        if (attempt === MAX_REPAIRS) throw err;
        prompt = `${specToPrompt(spec, assets)}

Your previous reply could not be parsed as JSON:

${err instanceof Error ? err.message : 'unknown error'}

Return the complete definition again as valid JSON. No comments, no trailing commas, no text outside the object.`;
        continue;
      }

      definition.slug = spec.slug; // the route depends on this, so it is not the model's to choose
      // Same reasoning for the manifest: the base URL comes from where the files were
      // actually uploaded, and a model inventing one produces an experiment whose every
      // stimulus 404s. Cleared when nothing was uploaded, so a hallucinated block cannot
      // survive either.
      if (assets?.files.length) definition.assets = assets;
      else delete definition.assets;

      issues = validate(definition);

      const errors = issues.filter(i => i.severity === 'error');
      if (errors.length === 0) {
        return NextResponse.json({
          definition,
          issues,
          repairs: attempt,
          usage: sumUsage(usages),
        });
      }

      prompt = `${specToPrompt(spec, assets)}

Your previous definition failed validation. Fix exactly these problems and return the corrected definition in full:

${errors.map(e => `- ${e.message}`).join('\n')}

Previous attempt:
${JSON.stringify(definition, null, 2)}`;
    }

    // Returned rather than thrown: a definition that fails validation is still worth
    // showing, with its problems named, so the lecturer can adjust the spec instead of
    // being handed a bare error.
    if (!definition) throw new ClaudeError('The model returned no definition.');
    return NextResponse.json({ definition, issues, repairs: MAX_REPAIRS, usage: sumUsage(usages) });
  } catch (err) {
    return errorResponse(err);
  }
}
