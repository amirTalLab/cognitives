// Loads the Claude Code skill files so the web app and an interactive Claude Code
// session run off the SAME instructions.
//
// A skill only fires inside Claude Code (`/experiment-from-paper`); it has no runtime a
// deployed page can call. Rather than keeping a second, hand-maintained copy of the
// rules in a prompt string — which would silently drift from the skill — the routes read
// the .md at request time and inject it into the system prompt. Editing SKILL.md changes
// both paths at once.
//
// The files are outside Next's normal import graph, so next.config.ts uses
// outputFileTracingIncludes to bundle them into the /api/create functions. If that read
// ever fails, only /create breaks — the rest of the site never touches this module.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SKILL_PAPER = 'experiment-from-paper';
export const SKILL_CODEGEN = 'new-cognitive-experiment';

// Skill files change only when a developer edits them, so one read per process is plenty.
const cache = new Map<string, string>();

/** Drops the YAML frontmatter — `name`/`description` are Claude Code routing metadata. */
function stripFrontmatter(md: string): string {
  return md.startsWith('---') ? md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '') : md;
}

/** Returns the body of `.claude/skills/<name>/SKILL.md`. Throws if it cannot be read. */
export async function loadSkill(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  const path = join(process.cwd(), '.claude', 'skills', name, 'SKILL.md');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(
      `Could not read the skill file at .claude/skills/${name}/SKILL.md. ` +
      'It is the source of truth for this pipeline, so generation cannot continue without it.',
    );
  }

  const body = stripFrontmatter(raw).trim();
  cache.set(name, body);
  return body;
}

/**
 * Reads a repo file to use as a prompt contract.
 *
 * The definition schema is the contract for generating an experiment, and the TypeScript
 * source is the most precise statement of it there will ever be — better than any prose
 * restatement, and it cannot drift, because the runtime compiles against the same file.
 */
export async function loadSource(relativePath: string): Promise<string> {
  const cached = cache.get(relativePath);
  if (cached) return cached;

  try {
    const text = await readFile(join(process.cwd(), relativePath), 'utf8');
    cache.set(relativePath, text);
    return text;
  } catch {
    throw new Error(`Could not read ${relativePath}, which is needed as the generation contract.`);
  }
}

/** Reports which skill files are readable, for the /create status banner. */
export async function skillStatus(): Promise<{ name: string; loaded: boolean; bytes: number }[]> {
  return Promise.all([SKILL_PAPER, SKILL_CODEGEN].map(async name => {
    try {
      const body = await loadSkill(name);
      return { name, loaded: true, bytes: body.length };
    } catch {
      return { name, loaded: false, bytes: 0 };
    }
  }));
}
