// Server-only helper for talking to the Anthropic Messages API.
//
// Deliberately uses plain `fetch` rather than the SDK: this feature is additive and
// must not change the dependency tree of the existing 16 experiments. The API key is
// read from ANTHROPIC_API_KEY (server env only — never NEXT_PUBLIC_, or it would ship
// in the browser bundle).

// Import this module only from route handlers / server components — it reads a secret.

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** Fast model for reading the paper and drafting the spec. */
export const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST ?? 'claude-sonnet-5';
/** Strong model for writing and revising experiment code. */
export const MODEL_STRONG = process.env.ANTHROPIC_MODEL_STRONG ?? 'claude-opus-5';

/** Marks the end of a prefix worth caching. Reads bill at ~10% of normal input. */
export const CACHE: { cache_control: { type: 'ephemeral' } } = { cache_control: { type: 'ephemeral' } };

export type ContentBlock =
  | ({ type: 'text'; text: string } & Partial<typeof CACHE>)
  | ({ type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } } & Partial<typeof CACHE>);

export interface Turn {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

/** Token counts for one call, so spend can be measured rather than estimated. */
export interface Usage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface ClaudeResult {
  text: string;
  usage: Usage;
  /** 'max_tokens' means the reply was cut off mid-sentence — the output is incomplete. */
  stopReason: string | null;
}

/** Transient API failures worth retrying rather than losing an expensive call over. */
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Thrown for any non-2xx response, so routes can surface a useful message. */
export class ClaudeError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = 'ClaudeError';
  }
}

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Sends one Messages API request and returns the concatenated text output.
 *
 * Always streams. Code generation can run for several minutes, and the API rejects
 * non-streaming requests whose expected duration is too long; streaming also keeps the
 * connection alive so platform proxies don't time it out mid-generation.
 */
export async function callClaude(opts: {
  model: string;
  system: string;
  messages: Turn[];
  maxTokens: number;
}): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeError(
      'ANTHROPIC_API_KEY is not set on the server. Add it to .env.local (local) or the Vercel project environment variables.',
      503,
    );
  }

  const body = JSON.stringify({
    model: opts.model,
    max_tokens: opts.maxTokens,
    // The system prompt carries the whole skill document — several thousand tokens that
    // are byte-identical on every call of a stage — so it is always a cache prefix.
    system: [{ type: 'text', text: opts.system, ...CACHE }],
    messages: opts.messages,
    stream: true,
  });

  // Generation is the most expensive call in the pipeline; losing one to a momentary 529
  // means paying for it twice. Retry the transient statuses with backoff.
  let lastError: ClaudeError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        // An identity-linked ("personal") key belongs to a user rather than a workspace, so
        // the API cannot tell which workspace to bill and rejects the call without this.
        // Workspace-scoped keys carry it implicitly and need nothing here.
        ...(process.env.ANTHROPIC_WORKSPACE_ID
          ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID }
          : {}),
      },
      body,
    });

    if (res.ok && res.body) {
      const result = await readTextStream(res.body);
      // An empty reply used to surface as "the model did not return JSON at all" with
      // nothing after it, which says nothing about why. The stream already carries the
      // answer — how it stopped, and whether any tokens were produced — so say it.
      if (!result.text.trim()) {
        const why = result.stopReason === 'refusal'
          ? 'The model declined to answer. Rephrase the spec, or pick a different experiment from the paper.'
          : result.stopReason === 'max_tokens'
            ? 'The reply hit the output limit before producing anything, which usually means the design is too large to emit in one go. Try a simpler experiment or fewer conditions.'
            : `The model produced no output (stop reason: ${result.stopReason ?? 'none'}, output tokens: ${result.usage.output}). This is usually a transient API problem — try again.`;
        throw new ClaudeError(why, 502);
      }
      return result;
    }

    const detail = await res.text().catch(() => '');
    lastError = new ClaudeError(`Anthropic API error (${res.status}): ${detail.slice(0, 500)}`, res.status);
    if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) throw lastError;
    await sleep(1000 * 2 ** (attempt - 1)); // 1s, 2s
  }

  throw lastError ?? new ClaudeError('Anthropic API call failed.');
}

/** Accumulates the text deltas of an SSE message stream, and the usage counters with them. */
export async function readTextStream(body: ReadableStream<Uint8Array>): Promise<ClaudeResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stopReason: string | null = null;
  const usage: Usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

  /** Consumes whole frames from the buffer, leaving any trailing partial one. */
  const drain = (flush: boolean) => {
    // Normalised because a CRLF stream would otherwise never match the \n\n separator and
    // every frame would sit in the buffer unread.
    buffer = buffer.replace(/\r\n/g, '\n');
    const frames = buffer.split('\n\n');
    // On flush the last piece is the genuine end of the stream, not a partial frame.
    buffer = flush ? '' : (frames.pop() ?? '');
    if (flush && frames.length === 0) return [];
    return frames;
  };

  for (let done = false; !done;) {
    const chunk = await reader.read();
    done = chunk.done;
    buffer += done
      ? decoder.decode()                              // flush any incomplete multi-byte char
      : decoder.decode(chunk.value, { stream: true });

    // On the final read the remaining buffer must be processed too. Dropping it truncated
    // long replies mid-sentence, which then failed to parse as JSON — with the error
    // pointing at the model rather than at this loop.
    for (const frame of drain(done)) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            text += evt.delta.text;
          } else if (evt.type === 'error') {
            throw new ClaudeError(`Anthropic stream error: ${evt.error?.message ?? 'unknown'}`);
          }
          // Input counts arrive once on message_start. message_delta then carries the
          // running output total — so these are assignments, not sums; adding them would
          // double-count output and inflate the cost readout.
          if (evt.type === 'message_start' && evt.message?.usage) {
            const u = evt.message.usage;
            usage.input = u.input_tokens ?? 0;
            usage.cacheWrite = u.cache_creation_input_tokens ?? 0;
            usage.cacheRead = u.cache_read_input_tokens ?? 0;
          }
          if (evt.type === 'message_delta') {
            if (evt.usage?.output_tokens != null) usage.output = evt.usage.output_tokens;
            if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          }
        } catch (err) {
          if (err instanceof ClaudeError) throw err;
          // A malformed frame is not worth failing the whole generation over.
        }
      }
    }
  }

  return { text, usage, stopReason };
}

/**
 * Pulls a JSON object out of a model response.
 *
 * Claude reliably returns JSON when asked, but sometimes wraps it in a ```json fence or
 * adds a sentence around it, so slice to the outermost braces before parsing.
 */
export function parseJson<T>(raw: string): T {
  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // An opening fence with no closing one means the reply was cut short. Strip it anyway,
  // so the diagnostic below is about the JSON rather than about the backticks.
  else if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*\n?/, '');

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  // Diagnostics say where the fault is. An opening brace with no closing one means the
  // reply was cut off — a token-limit or transport problem — not the model ignoring the
  // instruction to return JSON, and those need completely different fixes.
  if (start === -1) {
    throw new ClaudeError(`The model did not return JSON at all. First 300 chars: ${raw.slice(0, 300)}`);
  }
  if (end <= start) {
    throw new ClaudeError(
      `The reply was cut off before the JSON was complete (${raw.length} characters received). ` +
      `Last 200 chars: …${raw.slice(-200)}`,
    );
  }

  const body = text.slice(start, end + 1);
  try {
    return JSON.parse(body) as T;
  } catch {
    // Fall through to the repair pass.
  }

  // A reply cut off mid-structure still ends in a brace — the last one that happened to
  // arrive — so slicing to it yields something that looks like an object but has unclosed
  // arrays inside. That is a truncated reply, not a malformed one, and the two need
  // different responses: retry or shrink the design, versus repair the syntax.
  if (unbalanced(body)) {
    throw new ClaudeError(
      `The reply was cut off before the JSON was complete (${raw.length} characters received). ` +
      'This is usually a transient problem — try building again. If it keeps happening at the ' +
      'same point, the design is too large to emit in one reply; use fewer conditions or a ' +
      `smaller stimulus pool.\n\nLast 200 chars: …${raw.slice(-200)}`,
    );
  }

  // Models producing hand-written JSON slip in ways JSON.parse rejects but which are
  // unambiguous to fix: a trailing comma before a closing brace, or a // comment
  // explaining a value. Repairing beats discarding an otherwise complete definition and
  // paying to generate it again.
  const repaired = insertMissingCommas(
    body
      .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
      .replace(/(^|[^:"'\\])\/\/[^\n\r]*/g, '$1') // line comments, but not inside a URL
      .replace(/,(\s*[}\]])/g, '$1'),             // trailing commas
  );

  try {
    return JSON.parse(repaired) as T;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    throw new ClaudeError(
      `The model returned malformed JSON (${raw.length} characters). Parser said: ${detail}\n\n` +
      `${excerptAround(repaired, detail)}`,
    );
  }
}

/**
 * Whether braces and brackets are left open — the signature of a truncated reply.
 *
 * Counted outside strings only, so a stimulus word containing a bracket is not mistaken
 * for structure.
 */
function unbalanced(json: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
  }

  return depth !== 0 || inString;
}

/**
 * Puts back commas a model left out between elements.
 *
 * The commonest way hand-written JSON fails: two factors in an array with nothing between
 * them, or a second key straight after a closing brace. It is unambiguous — a value can
 * never directly follow another value in JSON — so it is safe to repair, and repairing
 * beats discarding a complete definition and paying to generate it again.
 *
 * Scans rather than regexes, because the same characters inside a string must be left
 * alone: a stimulus word containing a brace is text, not structure.
 */
function insertMissingCommas(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  let lastSignificant = '';

  for (const ch of json) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') { inString = false; lastSignificant = '"'; }
      continue;
    }

    // A value starting immediately after a value ended: the comma is missing. After ':',
    // ',', '{' or '[' a value is expected, so those are left alone.
    if ((ch === '"' || ch === '{' || ch === '[') &&
        (lastSignificant === '"' || lastSignificant === '}' || lastSignificant === ']' ||
         /[0-9a-z]/i.test(lastSignificant))) {
      out += ',';
    }

    out += ch;
    if (ch === '"') inString = true;
    if (!/\s/.test(ch)) lastSignificant = ch;
  }

  return out;
}

/**
 * Shows the text around the position the parser objected to.
 *
 * "Unexpected token at position 2451" is useless on its own; the surrounding 200
 * characters usually make the mistake obvious at a glance.
 */
function excerptAround(text: string, message: string): string {
  const at = Number(message.match(/position (\d+)/)?.[1]);
  if (Number.isNaN(at)) return `First 200 chars: ${text.slice(0, 200)}`;
  const from = Math.max(0, at - 120);
  return `Around position ${at}:\n…${text.slice(from, at)}  <<< HERE >>>  ${text.slice(at, at + 120)}…`;
}
