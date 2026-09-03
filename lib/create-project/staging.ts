// Path rules for staging a generated experiment into the working copy.
//
// Staging exists so the lecturer can *use* the generated experiment — click through the
// task, open the teacher dashboard — instead of reading TSX to guess whether it is right.
// The dev server compiles whatever lands on disk, so writing the files makes the real
// routes live at /{slug} and /{slug}/teacher.
//
// That means this module is the blast radius of the whole feature: it is the only place
// model-written code touches the repo. Every rule here exists to make it impossible for a
// generated experiment to overwrite one of the sixteen that already work.

/** Slugs already in use. A generated experiment may never write over one of these. */
const EXISTING_SLUGS = new Set([
  'stroop', 'drm', 'bouba-kiki', 'mentalRep', 'summaryStats',
  'posnerCueing', 'visualSearch', 'CompositeFace', 'wordSuperiority',
  'srt', 'twoStepTask', 'serialOrder', 'testingEffect', 'logics',
  'creativity', 'bRMS', 'create', 'api', 'locked',
]);

/** camelCase or kebab slug -> kebab, matching the lib/ and types/ naming convention. */
export function toKebab(slug: string): string {
  return slug
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

export class StagingError extends Error {}

/** Rejects a slug that would collide with an existing route or escape its directory. */
export function validateSlug(slug: string): string {
  if (!slug || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(slug)) {
    throw new StagingError(
      `"${slug}" is not a usable URL slug. Use letters, digits and hyphens, starting with a letter.`,
    );
  }
  if (EXISTING_SLUGS.has(slug)) {
    throw new StagingError(
      `"${slug}" is already taken by an existing experiment. Change the slug on the spec screen and generate again.`,
    );
  }

  // The route slug and the lib/types slug are different strings — /bouba-kiki lives at
  // app/bouba-kiki/ but lib/bouba-kiki/ and types/bouba-kiki.ts. So a NEW slug can clear
  // the check above and still own the kebab directory of an experiment that already
  // exists: "boubaKiki" kebabs to "bouba-kiki" and would overwrite the live one's stimuli
  // and mock data while leaving its app/ route untouched. Compare kebab to kebab.
  const kebab = toKebab(slug);
  for (const existing of EXISTING_SLUGS) {
    if (toKebab(existing) === kebab) {
      throw new StagingError(
        `"${slug}" resolves to "${kebab}", which is already used by the "${existing}" experiment ` +
        `(lib/${kebab}/ and types/${kebab}.ts). Pick a different slug on the spec screen.`,
      );
    }
  }

  return slug;
}

/**
 * The four path shapes a generated experiment owns. Anything outside them is refused —
 * so app/page.tsx, middleware.ts, another experiment's lib/, and package.json are all
 * unreachable no matter what the model emits.
 */
export function ownedPaths(slug: string): { prefixes: string[]; files: string[] } {
  const kebab = toKebab(slug);
  return {
    prefixes: [`app/${slug}/`, `lib/${kebab}/`],
    files: [`types/${kebab}.ts`, `supabase/schemas/${kebab}.sql`],
  };
}

/** True when `path` is inside the tree this slug is allowed to write. */
export function isOwnedPath(path: string, slug: string): boolean {
  if (!path || path.includes('..') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false;
  if (path.includes('\\')) return false; // POSIX separators only, so prefix checks are sound
  const { prefixes, files } = ownedPaths(slug);
  return prefixes.some(p => path.startsWith(p)) || files.includes(path);
}
