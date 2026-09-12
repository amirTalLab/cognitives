// Crash protection for the create wizard.
//
// Every stage of the pipeline costs a metered API call, and the wizard held all of it in
// React state — so a refresh, a closed tab or a browser crash threw away both the work and
// the money that produced it, with no way back except paying for it again.
//
// This keeps a single draft of the expensive parts in localStorage. Deliberately
// localStorage and not sessionStorage: sessionStorage dies with the tab, and losing a tab
// is exactly one of the accidents worth surviving.
//
// The PDF bytes are the one thing NOT kept. A 3.2MB paper is ~4.3MB of base64, which is
// past the ~5MB localStorage quota on its own and would fail every write — and it is also
// the only piece that costs nothing to supply again, since it is a file already sitting on
// the lecturer's disk. See the re-attach prompt on the select stage.

import type { AssetManifest, ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import type {
  AnalyzeResponse, Candidate, ChatMessage, GeneratedFile, Spec, Stage, UsageEntry,
} from './types';

const KEY = 'cognitives_create_draft';

/** Bumped whenever the shape below changes; older drafts are dropped rather than guessed at. */
const VERSION = 1;

export interface CreateDraft {
  version: number;
  savedAt: number;
  stage: Stage;
  /** Kept so the re-attach prompt can name the file that is missing. */
  pdfName: string;
  analysis: AnalyzeResponse | null;
  candidate: Candidate | null;
  spec: Spec | null;
  assets: AssetManifest | null;
  definition: ExperimentDefinition | null;
  files: GeneratedFile[];
  notes: string;
  problems: string[];
  messages: ChatMessage[];
  usage: UsageEntry[];
  staged: boolean;
  compileState: { ok: boolean; message: string } | null;
  finishResult: string | null;
}

/** Everything the wizard needs to restore, minus the bookkeeping fields. */
export type DraftState = Omit<CreateDraft, 'version' | 'savedAt'>;

/**
 * Whether a draft is worth keeping.
 *
 * Guards the save effect so that nothing which is not actually work can overwrite a real
 * draft before the lecturer has had the chance to restore it. Two cases, both of which
 * would otherwise destroy a draft with a single harmless-looking click:
 *
 *   - simply opening the page, which renders empty state before anything is restored;
 *   - "No paper — describe it myself", which installs a spec whose every field is blank.
 *
 * So a spec counts only once something has been typed into it.
 */
export function worthSaving(d: DraftState): boolean {
  const specStarted = !!d.spec && !!(
    d.spec.slug?.trim() || d.spec.title?.trim() || d.spec.titleHe?.trim()
    || d.spec.fields?.some(f => f.value.trim())
  );
  return !!(d.analysis || specStarted || d.definition || d.files.length);
}

export function writeDraft(state: DraftState): void {
  if (typeof window === 'undefined') return;
  try {
    const draft: CreateDraft = { ...state, version: VERSION, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Quota, private browsing, storage disabled. Saving a draft is a convenience; it must
    // never be the reason a working pipeline stops.
  }
}

export function readDraft(): CreateDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as CreateDraft;
    if (draft.version !== VERSION) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Same reasoning as writeDraft.
  }
}

const STAGE_LABELS: Record<Stage, string> = {
  upload: 'reading the paper',
  select: 'choosing an experiment',
  spec: 'the design spec',
  refine: 'refining',
};

/** One line describing a draft, so the restore prompt says what it is about to bring back. */
export function describeDraft(draft: CreateDraft): string {
  const name = draft.spec?.title?.trim()
    || draft.candidate?.name
    || draft.analysis?.paperTitle
    || draft.pdfName
    || 'Untitled experiment';

  const minutes = Math.round((Date.now() - draft.savedAt) / 60_000);
  const when = minutes < 1 ? 'just now'
    : minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'} ago`
    : minutes < 60 * 24 ? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? '' : 's'} ago`
    : `${Math.round(minutes / (60 * 24))} day${Math.round(minutes / (60 * 24)) === 1 ? '' : 's'} ago`;

  return `${name} — stopped at ${STAGE_LABELS[draft.stage]}, ${when}`;
}
