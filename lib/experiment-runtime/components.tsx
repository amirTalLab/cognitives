'use client';

// The escape hatch: phases that cannot be declared.
//
// Read component-names.ts before adding anything here — it holds the rule for when a phase
// is allowed to be code, and the reason the list should stay short. Everything in this file
// is a phase that breaks one of the runtime's three assumptions, never a phase that was
// merely awkward to express.
//
// A component is reached by NAME from the fixed map at the bottom. A definition never names
// a path and never carries code, so a published row — which is data from a database — can at
// worst name nothing, which the validator reports and the runner renders as a message.

import { useState } from 'react';
import type { ComponentType } from 'react';

/** What every phase component is handed, and how it gives a trial back. */
export interface PhaseComponentProps {
  /** This trial's factor values, for a component that varies with them. */
  values: Record<string, unknown>;
  language: 'he' | 'en';
  practice: boolean;
  /**
   * Ends the phase.
   *
   * `response` is the trial's answer, scored by the definition's rule like any other.
   * `payload` adds columns to this trial's row — which a component usually needs: bRMS
   * records whether its frame timing held, and the rule task records every triple that was
   * tested, none of which is a "response".
   */
  onDone: (result: { response?: string; payload?: Record<string, unknown> }) => void;
}

// ─── Wason 2-4-6 ──────────────────────────────────────────────────────────────
//
// Original: app/logics/experiment/page.tsx (RuleScreen) and lib/logics/questions.ts.
//
// The participant is given 2-4-6, told it fits a rule, and may test up to five triples of
// their own to work out what the rule is. The rule is simply "ascending", and almost nobody
// finds it — because almost nobody tests a triple they expect to FAIL. That is the finding:
// people seek confirmation, so they never discover that their hypothesis is narrower than
// the truth.
//
// This is here rather than in a definition because the participant authors the stimulus.
// There are no trials to plan: the numbers come from them, and the answer is a predicate on
// what they typed, not a comparison against a value chosen in advance.

const ascending = (a: number, b: number, c: number) => a < b && b < c;

const WASON_TEXT = {
  en: {
    test: 'Test',
    fits: 'Fits ✓',
    unfits: "Doesn't fit ✗",
    tested: (n: number) => `${n}/5 sequences tested`,
    ready: 'I am ready to guess the rule',
    guess: 'What is the rule?',
    placeholder: 'The rule is...',
    submit: 'Submit',
  },
  he: {
    test: 'בדיקה',
    fits: 'תואם ✓',
    unfits: 'לא תואם ✗',
    tested: (n: number) => `${n}/5 סדרות נבדקו`,
    ready: 'אני מוכן/ה לנחש את הכלל',
    guess: 'מהו הכלל?',
    placeholder: 'הכלל הוא...',
    submit: 'שליחה',
  },
};

const MAX_TRIPLES = 5;

function WasonRuleDiscovery({ language, onDone }: PhaseComponentProps) {
  const t = WASON_TEXT[language];
  const rtl = language === 'he';
  const [tested, setTested] = useState<{ numbers: number[]; fits: boolean }[]>([]);
  const [inputs, setInputs] = useState(['', '', '']);
  const [guessing, setGuessing] = useState(false);
  const [guess, setGuess] = useState('');

  const valid = inputs.every(s => s.trim() !== '' && !Number.isNaN(Number(s)));
  const canTest = tested.length < MAX_TRIPLES && !guessing;

  const test = () => {
    const [a, b, c] = inputs.map(Number);
    setTested(prev => [...prev, { numbers: [a, b, c], fits: ascending(a, b, c) }]);
    setInputs(['', '', '']);
  };

  const submit = () => {
    if (!guess.trim()) return;
    // Every triple goes with the answer. What people TESTED is the whole finding — a
    // participant who only ever tried ascending triples never gave the rule a chance to say
    // no — and none of it is recoverable from the guess alone.
    onDone({
      response: guess.trim(),
      payload: {
        rule_triples: JSON.stringify(tested),
        triples_tested: tested.length,
        // A triple the participant expected to fail is the one that could have taught them
        // something. Counted here rather than in the dashboard so the CSV carries it too.
        disconfirming_tests: tested.filter(tr => !tr.fits).length,
        found_rule: /ascend|increas|larger|bigger|עול|גדל|עולה/i.test(guess),
      },
    });
  };

  return (
    <div className="flex flex-col gap-5 w-full max-w-lg" dir={rtl ? 'rtl' : 'ltr'}>
      {tested.length > 0 && (
        <div className="flex flex-col gap-1">
          {tested.map((tr, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-gray-300 font-mono">{tr.numbers.join(' – ')}</span>
              <span className={tr.fits ? 'text-emerald-400' : 'text-red-400'}>
                {tr.fits ? t.fits : t.unfits}
              </span>
            </div>
          ))}
        </div>
      )}

      {!guessing && (
        <>
          {canTest && (
            <div className="flex items-center gap-2">
              {[0, 1, 2].map(i => (
                <input key={i} type="text" inputMode="numeric" value={inputs[i]}
                  onChange={e => setInputs(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder={`#${i + 1}`}
                  className="w-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-center outline-none focus:border-emerald-400" />
              ))}
              <button onClick={test} disabled={!valid}
                className={`px-4 py-2 rounded-lg font-semibold touch-manipulation ${valid
                  ? 'bg-blue-500 hover:bg-blue-400 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                {t.test}
              </button>
            </div>
          )}

          <p className="text-gray-500 text-xs">{t.tested(tested.length)}</p>

          <button onClick={() => setGuessing(true)}
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold rounded-xl touch-manipulation">
            {t.ready}
          </button>
        </>
      )}

      {guessing && (
        <>
          <p className="text-gray-300 text-sm font-semibold">{t.guess}</p>
          <input type="text" value={guess} autoFocus
            onChange={e => setGuess(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={t.placeholder}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 outline-none focus:border-emerald-400" />
          <button onClick={submit} disabled={!guess.trim()}
            className={`w-full py-3 rounded-xl font-bold touch-manipulation ${guess.trim()
              ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
            {t.submit}
          </button>
        </>
      )}
    </div>
  );
}

// ─── The registry ─────────────────────────────────────────────────────────────

/** Keys must match PHASE_COMPONENTS in component-names.ts; a test fails if they drift. */
export const PHASE_COMPONENT_MAP: Record<string, ComponentType<PhaseComponentProps>> = {
  wasonRuleDiscovery: WasonRuleDiscovery,
};

/** A gate before the first trial. Same rules; nothing needs one yet. */
export const ONBOARDING_COMPONENT_MAP: Record<string, ComponentType<{
  language: 'he' | 'en';
  onDone: () => void;
}>> = {};
