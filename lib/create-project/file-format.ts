// The wire format for model-written code.
//
// Files used to come back as JSON string values. That was wrong on three counts:
//   - escaping TSX into JSON (quotes, newlines, backslashes) is the single easiest thing
//     for a model to get subtly wrong, and one bad escape invalidates the whole payload;
//   - escaping inflates the output by 15-25%, and output is the expensive direction;
//   - a truncated JSON document is unparseable, so hitting the token ceiling loses every
//     file including the ones that were already complete.
//
// A delimited plain-text format fixes all three. Nothing needs escaping, the cost is the
// raw source, and a response cut off mid-file still yields every complete file before the
// cut — which is what makes partial recovery and batching possible.

import { GeneratedFile } from './types';

const FILE_OPEN = /^===FILE:\s*(.+?)\s*===$/;
const FILE_CLOSE = /^===END===$/;
const NOTES_OPEN = /^===NOTES===$/;
const REPLY_OPEN = /^===REPLY===$/;

export interface ParsedPayload {
  files: GeneratedFile[];
  /** Prose from a ===NOTES=== or ===REPLY=== section, if the model sent one. */
  prose: string;
  /** Paths whose closing marker never arrived — the response was cut off inside them. */
  truncated: string[];
}

/** The format description injected into every prompt that asks for files. */
export const FILE_FORMAT_SPEC = `## Output format

Return plain text in exactly this shape. Do NOT use JSON, and do NOT wrap anything in markdown code fences.

===NOTES===
Only the judgement calls a lecturer would want to check: values you chose that the paper did not state, anything you simplified, anything about the design you are unsure of. Do NOT list setup steps — creating the database table and registering the experiment are automated, so telling the reader to do them by hand is noise. Do not summarise which files you wrote.
===FILE: relative/path/one.ts===
the complete file contents, exactly as they should appear on disk
===END===
===FILE: relative/path/two.tsx===
the complete file contents
===END===

Rules:
- Write file contents literally. No escaping of any kind — quotes, newlines and backslashes appear as themselves.
- Every ===FILE: must be closed by ===END=== on its own line.
- Nothing outside these markers.
- Never abbreviate a file. No "rest unchanged", no "...", no truncation. If you are running out of room, emit fewer files but keep every file you do emit complete.`;

/** Same format, but the prose section is a reply to the user rather than release notes. */
export const REPLY_FORMAT_SPEC = FILE_FORMAT_SPEC
  .replace('===NOTES===', '===REPLY===')
  .replace(
    'Anything the reader should know: assumptions you made, what still needs doing.',
    'A short, plain explanation of what you changed and why.',
  );

/**
 * Parses a delimited payload.
 *
 * Deliberately forgiving about everything except file boundaries: stray prose outside the
 * markers is ignored rather than fatal, but a file whose ===END=== never arrived is
 * reported as truncated and dropped, because a half-written source file is worse than a
 * missing one.
 */
export function parsePayload(raw: string): ParsedPayload {
  const lines = raw.split('\n');
  const files: GeneratedFile[] = [];
  const truncated: string[] = [];
  const proseLines: string[] = [];

  let mode: 'none' | 'prose' | 'file' = 'none';
  let currentPath = '';
  let buffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    const open = trimmed.match(FILE_OPEN);
    if (open) {
      // An unclosed previous file means the model started a new one without finishing.
      if (mode === 'file') truncated.push(currentPath);
      mode = 'file';
      currentPath = open[1];
      buffer = [];
      continue;
    }

    if (FILE_CLOSE.test(trimmed) && mode === 'file') {
      files.push({ path: currentPath, contents: buffer.join('\n').replace(/\s*$/, '') + '\n' });
      mode = 'none';
      currentPath = '';
      buffer = [];
      continue;
    }

    if ((NOTES_OPEN.test(trimmed) || REPLY_OPEN.test(trimmed)) && mode !== 'file') {
      mode = 'prose';
      continue;
    }

    if (mode === 'file') buffer.push(line);
    else if (mode === 'prose') proseLines.push(line);
  }

  // Whatever was still open when the response ended never got its closing marker.
  if (mode === 'file') truncated.push(currentPath);

  return {
    files,
    prose: proseLines.join('\n').trim(),
    truncated,
  };
}
