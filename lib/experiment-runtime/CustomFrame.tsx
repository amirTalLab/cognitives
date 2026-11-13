'use client';

// Hosts one custom display (see sandbox.ts) inside the runner, and the smoke test that runs
// every custom display of a definition before a lecturer ever sees it.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  readSandboxMessage, sandboxDocument, SANDBOX_STUCK_MS, type SandboxInit, type SandboxMessage,
} from './sandbox';
import type { ExperimentDefinition } from './schema';
import { buildTrials, planStages } from './trials';
import { ASSET_BASE_KEY, LANGUAGE_KEY, SEED_KEY } from './DisplayView';

function newToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * One sandboxed frame, for the lifetime of one phase.
 *
 * Mounted fresh per trial and phase (the runner keys it), so no state survives from one
 * trial to the next except what the script hands to exp.keep() — which the runner holds.
 */
export function CustomFrame({ script, init, interactive, onMessage, onStuck, hidden }: {
  script: string;
  init: SandboxInit;
  /** The script takes input: the frame gets focus and pointer events. */
  interactive: boolean;
  onMessage: (message: SandboxMessage) => void;
  /** Offered after SANDBOX_STUCK_MS when the phase is still waiting on the script. */
  onStuck?: () => void;
  /** For the smoke test: rendered, so it really runs, but out of sight. */
  hidden?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Fixed for the life of the frame: a new document would restart the script mid-phase.
  const [token] = useState(newToken);
  const [doc] = useState(() => sandboxDocument(script, init, token));
  const [stuck, setStuck] = useState(false);
  const handler = useRef(onMessage);
  useEffect(() => { handler.current = onMessage; }, [onMessage]);

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      // Only this frame's own window, carrying this frame's token. Anything else posted to
      // the page — another frame, a browser extension — is not a result.
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = readSandboxMessage(event.data, token);
      if (message) handler.current(message);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [token]);

  useEffect(() => {
    if (!onStuck) return;
    const timer = setTimeout(() => setStuck(true), SANDBOX_STUCK_MS);
    return () => clearTimeout(timer);
  }, [onStuck]);

  return (
    <div
      className={hidden ? undefined : 'w-full flex-1 min-h-[240px] flex flex-col items-center'}
      style={hidden
        ? { position: 'fixed', right: 0, bottom: 0, width: 360, height: 360, opacity: 0.01, pointerEvents: 'none', zIndex: -1 }
        : { maxHeight: '72dvh' }}
      aria-hidden={hidden || undefined}
    >
      <iframe
        ref={frame}
        title="stimulus"
        // allow-scripts WITHOUT allow-same-origin: the script runs at an opaque origin and
        // can reach nothing of the site's.
        sandbox="allow-scripts"
        allow="autoplay"
        referrerPolicy="no-referrer"
        srcDoc={doc}
        tabIndex={interactive ? 0 : -1}
        onLoad={() => { if (interactive && !hidden) frame.current?.focus(); }}
        className="w-full h-full rounded-xl"
        style={{
          border: 0,
          maxWidth: 900,
          minHeight: hidden ? undefined : 240,
          background: '#0f172a',
          // A display-only frame must not swallow taps or key focus meant for the response
          // buttons beneath it.
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      />
      {stuck && onStuck && (
        <button onClick={onStuck} className="mt-3 text-sm text-gray-400 underline">
          {init.language === 'he' ? 'המשך' : 'Continue'}
        </button>
      )}
    </div>
  );
}

/** One sample run the smoke test will try. */
interface Sample {
  key: string;
  label: string;
  script: string;
  init: SandboxInit;
}

/** How long a sample runs before it is declared healthy. Long enough for a few frames. */
const SMOKE_MS = 2500;

/** Samples per custom phase: different trials exercise different factor values. */
const SAMPLES_PER_PHASE = 3;

/**
 * Builds the sample runs: every custom phase in every block, on a few real planned trials.
 *
 * Real trials rather than invented values, because the usual script bug is reading a
 * factor that is not there or is shaped differently than the script assumed — which only a
 * real trial's values reveal.
 */
export function smokeSamples(def: ExperimentDefinition): Sample[] {
  const out: Sample[] = [];
  let blocks;
  try { blocks = planStages(def); } catch { return out; }
  for (const block of blocks) {
    const custom = block.design.trial.phases.filter(p => p.custom?.script);
    if (custom.length === 0) continue;
    let trials;
    try { trials = buildTrials(block.design, { context: block.context }); } catch { continue; }
    for (const trial of trials.slice(0, SAMPLES_PER_PHASE)) {
      for (const phase of custom) {
        out.push({
          key: `${block.stage}-${trial.index}-${phase.name}`,
          label: `phase "${phase.name}"${blocks.length > 1 ? ` in block "${block.stage}"` : ''}`,
          script: phase.custom!.script,
          init: {
            values: {
              ...block.context,
              ...trial.values,
              answer: {},
              [SEED_KEY]: trial.seed,
              [ASSET_BASE_KEY]: def.assets?.base ?? '',
              [LANGUAGE_KEY]: 'he',
            },
            // Hebrew is the default run language, and the one more likely to trip a script
            // (right-to-left text, a missing `he` string).
            language: 'he',
            practice: false,
            trialIndex: trial.index,
            seed: trial.seed,
            assetBase: def.assets?.base ?? '',
            memory: null,
            responds: !!phase.custom!.responds,
          },
        });
      }
    }
  }
  return out;
}

export type SmokeResult = { ok: true } | { ok: false; errors: string[] };

/**
 * Runs every custom display of a definition for a moment, out of sight, and reports errors.
 *
 * This is what lets /create catch a broken script BEFORE the lecturer clicks through to the
 * trial that uses it — and repair it automatically. It runs in the lecturer's own browser,
 * the same engine the students will use, so it also works on the live site where the server
 * cannot run a browser.
 */
export function SandboxSmokeTest({ definition, onResult }: {
  definition: ExperimentDefinition;
  onResult: (result: SmokeResult) => void;
}) {
  const samples = useMemo(() => smokeSamples(definition), [definition]);
  const errors = useRef<Map<string, string>>(new Map());
  const done = useRef(false);
  const report = useRef(onResult);
  useEffect(() => { report.current = onResult; }, [onResult]);

  useEffect(() => {
    errors.current = new Map();
    done.current = false;
    if (samples.length === 0) { report.current({ ok: true }); return; }
    const timer = setTimeout(() => {
      done.current = true;
      const found = [...new Set(errors.current.values())];
      report.current(found.length ? { ok: false, errors: found } : { ok: true });
    }, SMOKE_MS);
    return () => clearTimeout(timer);
  }, [samples]);

  return (
    <>
      {samples.map(sample => (
        <CustomFrame
          key={sample.key}
          hidden
          script={sample.script}
          init={sample.init}
          interactive={false}
          onMessage={message => {
            if (done.current || message.type !== 'error') return;
            errors.current.set(sample.label, `The custom display in ${sample.label} failed: ${message.message}`);
          }}
        />
      ))}
    </>
  );
}
