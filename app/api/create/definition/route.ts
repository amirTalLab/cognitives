import { NextRequest, NextResponse } from 'next/server';
import { callClaude, parseJson, MODEL_STRONG, ClaudeError, Usage, CACHE } from '@/lib/create-project/anthropic';
import { definitionSystem, specToPrompt } from '@/lib/create-project/prompts';
import { loadSkill, loadSource, SKILL_CODEGEN } from '@/lib/create-project/skills';
import { Spec } from '@/lib/create-project/types';
import { AssetManifest, ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import { validate } from '@/lib/experiment-runtime/validate';
import { MOCK_DEFINITION, mockDelay, isMockMode } from '@/lib/create-project/fixtures';
import { errorResponse, requireAccess } from '../_shared';

export const runtime = 'nodejs';
// 300s is the ceiling on Vercel's lower plans; a higher value fails the deploy. The
// definition path finishes in 60-90s even with one repair round, so this is ample — the
// number was never a real budget, and a build error is a worse failure than a rare timeout.
export const maxDuration = 300;

const SCHEMA_PATH = 'lib/experiment-runtime/schema.ts';
/** One retry. A second failure usually means the design does not fit, not a slip. */
const MAX_REPAIRS = 1;

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
    const denied = await requireAccess(req);
    if (denied) return denied;

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
      const { text, usage, stopReason } = await callClaude({
        model: MODEL_STRONG,
        system,
        maxTokens: 16000,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt, ...CACHE }] }],
      });
      usages.push(usage);

      // A definition cut off at the output ceiling is unparseable, and retrying it produces
      // the same length again — so say what happened rather than spending a second call to
      // arrive at the same place. Checked here as the other stages already do.
      if (stopReason === 'max_tokens') {
        throw new ClaudeError(
          'The experiment ran out of output room before it was finished. This usually means ' +
          'the design has a very large stimulus pool or many conditions — try fewer of either.',
        );
      }

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
