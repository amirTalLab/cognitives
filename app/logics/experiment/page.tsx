'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  QuestionUnit, QuestionDef, AnchoringBlock, Group, Language,
  RuleTriple, LogicsResponse,
} from '@/types/logics';
import {
  buildQuestionSequence, getQuestionText, checkRuleFits,
} from '@/lib/logics/questions';
import { getSupabase } from '@/lib/supabase';

const KEY = 'logics';

type ScreenState =
  | { kind: 'question'; unit: QuestionUnit; unitIdx: number }
  | { kind: 'anchoring-s2'; block: AnchoringBlock; unitIdx: number }
  | { kind: 'multiplication-timer'; block: AnchoringBlock; unitIdx: number }
  | { kind: 'multiplication-estimate'; block: AnchoringBlock; unitIdx: number };

export default function LogicsExperiment() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>('he');
  const [group, setGroup] = useState<Group>('A');
  const [sessionId, setSessionId] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [units, setUnits] = useState<QuestionUnit[]>([]);
  const [unitIdx, setUnitIdx] = useState(0);
  const [screen, setScreen] = useState<ScreenState | null>(null);
  const [responses, setResponses] = useState<LogicsResponse[]>([]);
  const [saving, setSaving] = useState(false);
  const [orderCodes, setOrderCodes] = useState<string[]>([]);

  // Per-question state
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<Set<string>>(new Set());
  const [likertValue, setLikertValue] = useState<number | null>(null);
  const [numberInput, setNumberInput] = useState('');
  const [anchorResponse, setAnchorResponse] = useState<string | null>(null);

  // Rule discovery state
  const [ruleTriples, setRuleTriples] = useState<RuleTriple[]>([]);
  const [ruleInputs, setRuleInputs] = useState(['', '', '']);
  const [ruleGuess, setRuleGuess] = useState('');
  const [rulePhase, setRulePhase] = useState<'testing' | 'guessing'>('testing');
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);

  const questionOnsetRef = useRef(0);
  const questionOrderRef = useRef(0);

  const isHe = language === 'he';

  useEffect(() => {
    const lang = (sessionStorage.getItem(`${KEY}_language`) as Language) || 'he';
    const grp = (sessionStorage.getItem(`${KEY}_group`) as Group) || 'A';
    const sid = sessionStorage.getItem(`${KEY}_session_id`) || '';
    const pname = sessionStorage.getItem(`${KEY}_participant_name`) || '';

    if (!sid) {
      router.push('/logics');
      return;
    }

    setLanguage(lang);
    setGroup(grp);
    setSessionId(sid);
    setParticipantName(pname);

    const seq = buildQuestionSequence();
    setUnits(seq);

    const codes: string[] = [];
    for (const u of seq) {
      if (u.type === 'single' || u.type === 'interactive-rule') {
        codes.push(u.question!.code);
      } else if (u.type === 'anchoring-block' || u.type === 'multiplication-block') {
        codes.push(u.block!.screen1.code, u.block!.screen2.code);
      }
    }
    setOrderCodes(codes);

    setScreen({ kind: 'question', unit: seq[0], unitIdx: 0 });
    questionOnsetRef.current = performance.now();
    questionOrderRef.current = 0;
  }, [router]);

  const resetInputState = useCallback(() => {
    setSelectedOption(null);
    setSelectedMulti(new Set());
    setLikertValue(null);
    setNumberInput('');
    setAnchorResponse(null);
    setRuleTriples([]);
    setRuleInputs(['', '', '']);
    setRuleGuess('');
    setRulePhase('testing');
    setLastFeedback(null);
  }, []);

  const makeResponse = useCallback(
    (code: string, response: string, responseNumeric: number | null,
     ruleTripleJson: string | null = null, ruleGuessVal: string | null = null): LogicsResponse => {
      const rt = Math.round(performance.now() - questionOnsetRef.current);
      const entry: LogicsResponse = {
        session_id: sessionId,
        participant_name: participantName || null,
        language,
        group_assignment: group,
        question_code: code,
        response,
        response_numeric: responseNumeric,
        reaction_time_ms: rt,
        question_order: questionOrderRef.current,
        rule_triples_json: ruleTripleJson,
        rule_guess: ruleGuessVal,
      };
      questionOrderRef.current += 1;
      return entry;
    },
    [sessionId, participantName, language, group],
  );

  const finishExperiment = useCallback(
    async (allResponses: LogicsResponse[]) => {
      setSaving(true);
      sessionStorage.setItem(`${KEY}_responses`, JSON.stringify(allResponses));
      sessionStorage.setItem(`${KEY}_order`, JSON.stringify(orderCodes));
      try {
        const supabase = getSupabase();
        if (supabase) {
          for (let i = 0; i < allResponses.length; i += 500) {
            await supabase.from('logics_results').insert(allResponses.slice(i, i + 500));
          }
        }
      } catch (e) {
        console.error('Save error:', e);
      }
      router.push('/logics/thanks');
    },
    [router, orderCodes],
  );

  const advanceToNextUnit = useCallback(
    (allResponses: LogicsResponse[]) => {
      const nextIdx = unitIdx + 1;
      if (nextIdx >= units.length) {
        finishExperiment(allResponses);
        return;
      }
      setUnitIdx(nextIdx);
      const nextUnit = units[nextIdx];
      resetInputState();
      setScreen({ kind: 'question', unit: nextUnit, unitIdx: nextIdx });
      questionOnsetRef.current = performance.now();
    },
    [unitIdx, units, resetInputState, finishExperiment],
  );

  // ── Submit handlers ──────────────────────────────────────────────────────────

  const addAndAdvance = useCallback((entry: LogicsResponse) => {
    setResponses(prev => {
      const updated = [...prev, entry];
      return updated;
    });
    const allSoFar = [...responses, entry];
    advanceToNextUnit(allSoFar);
  }, [responses, advanceToNextUnit]);

  const handleMCSubmit = useCallback(() => {
    if (!screen || selectedOption === null) return;
    const q = screen.kind === 'question' ? getActiveQuestion(screen) : null;
    if (!q) return;
    addAndAdvance(makeResponse(q.code, selectedOption, null));
  }, [screen, selectedOption, makeResponse, addAndAdvance]);

  const handleMultiSelectSubmit = useCallback(() => {
    if (!screen || selectedMulti.size === 0) return;
    const q = screen.kind === 'question' ? getActiveQuestion(screen) : null;
    if (!q) return;
    const val = Array.from(selectedMulti).sort().join(',');
    addAndAdvance(makeResponse(q.code, val, null));
  }, [screen, selectedMulti, makeResponse, addAndAdvance]);

  const handleLikertSubmit = useCallback(() => {
    if (!screen || likertValue === null) return;
    const q = screen.kind === 'question' ? getActiveQuestion(screen) : null;
    if (!q) return;
    addAndAdvance(makeResponse(q.code, String(likertValue), likertValue));
  }, [screen, likertValue, makeResponse, addAndAdvance]);

  const handleNumberSubmit = useCallback(() => {
    if (!screen || !numberInput.trim()) return;
    let q: QuestionDef | null = null;
    if (screen.kind === 'question') {
      q = getActiveQuestion(screen);
    } else if (screen.kind === 'anchoring-s2' || screen.kind === 'multiplication-estimate') {
      q = screen.block.screen2;
    }
    if (!q) return;
    const num = parseFloat(numberInput.replace(/,/g, ''));
    addAndAdvance(makeResponse(q.code, numberInput.trim(), isNaN(num) ? null : num));
  }, [screen, numberInput, makeResponse, addAndAdvance]);

  const handleAnchorSubmit = useCallback(() => {
    if (!screen || anchorResponse === null) return;
    if (screen.kind !== 'question') return;
    const unit = screen.unit;
    if (unit.type !== 'anchoring-block' && unit.type !== 'multiplication-block') return;
    const block = unit.block!;
    const entry = makeResponse(block.screen1.code, anchorResponse, null);
    setResponses(prev => [...prev, entry]);
    resetInputState();
    questionOnsetRef.current = performance.now();
    setScreen({ kind: 'anchoring-s2', block, unitIdx: screen.unitIdx });
  }, [screen, anchorResponse, makeResponse, resetInputState]);

  const handleMultiplicationView = useCallback(() => {
    if (!screen || screen.kind !== 'question') return;
    const block = screen.unit.block!;
    setScreen({ kind: 'multiplication-timer', block, unitIdx: screen.unitIdx });
    questionOnsetRef.current = performance.now();
  }, [screen]);

  useEffect(() => {
    if (screen?.kind === 'multiplication-timer') {
      const timer = setTimeout(handleMultiplicationSubmit, 5000);
      return () => clearTimeout(timer);
    }
  }, [screen?.kind, handleMultiplicationSubmit]);

  const handleMultiplicationSubmit = useCallback(() => {
    if (!screen || screen.kind !== 'multiplication-timer') return;
    const block = screen.block;
    const entry = makeResponse(block.screen1.code, 'viewed', null);
    setResponses(prev => [...prev, entry]);
    resetInputState();
    questionOnsetRef.current = performance.now();
    setScreen({ kind: 'multiplication-estimate', block, unitIdx: screen.unitIdx });
  }, [screen, makeResponse, resetInputState]);

  // Rule discovery handlers
  const handleRuleTest = useCallback(() => {
    const nums = ruleInputs.map(s => parseFloat(s));
    if (nums.some(isNaN)) return;
    const [a, b, c] = nums;
    const fits = checkRuleFits(a, b, c);
    const triple: RuleTriple = { numbers: [a, b, c], fits };
    setRuleTriples(prev => [...prev, triple]);
    setLastFeedback(fits
      ? (isHe ? 'תואם את הכלל ✓' : 'Fits the rule ✓')
      : (isHe ? 'לא תואם את הכלל ✗' : 'Does not fit the rule ✗'));
    setRuleInputs(['', '', '']);
  }, [ruleInputs, isHe]);

  const handleRuleGuessSubmit = useCallback(() => {
    if (!ruleGuess.trim()) return;
    const triplesJson = JSON.stringify(ruleTriples);
    addAndAdvance(makeResponse('Q-RULE', ruleGuess.trim(), null, triplesJson, ruleGuess.trim()));
  }, [ruleGuess, ruleTriples, makeResponse, addAndAdvance]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getActiveQuestion(s: ScreenState): QuestionDef | null {
    if (s.kind === 'question') {
      const unit = s.unit;
      if (unit.type === 'single' || unit.type === 'interactive-rule') return unit.question!;
      if (unit.type === 'anchoring-block' || unit.type === 'multiplication-block') return unit.block!.screen1;
    }
    return null;
  }

  // ── Total screens for progress ───────────────────────────────────────────────

  const totalScreens = units.reduce((acc, u) => {
    if (u.type === 'anchoring-block' || u.type === 'multiplication-block') return acc + 2;
    return acc + 1;
  }, 0);

  const currentScreen = (() => {
    let count = 0;
    for (let i = 0; i < unitIdx; i++) {
      const u = units[i];
      if (u.type === 'anchoring-block' || u.type === 'multiplication-block') count += 2;
      else count += 1;
    }
    if (screen?.kind === 'anchoring-s2' || screen?.kind === 'multiplication-estimate') count += 1;
    if (screen?.kind === 'multiplication-timer') count += 1;
    return count;
  })();

  const progress = totalScreens > 0 ? (currentScreen / totalScreens) * 100 : 0;

  // ── Translation ──────────────────────────────────────────────────────────────

  const t = isHe
    ? { saving: 'שומר...', submit: 'המשך', next: 'המשך', testTriple: 'בדקו', guessRule: 'נסחו את הכלל', submitGuess: 'שלחו', readyGuess: 'מוכנים לנסח את הכלל', enterEstimate: 'הזינו הערכה' }
    : { saving: 'Saving...', submit: 'Continue', next: 'Continue', testTriple: 'Test', guessRule: 'State the rule', submitGuess: 'Submit', readyGuess: 'Ready to state the rule', enterEstimate: 'Enter your estimate' };

  if (!screen || saving) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <p className="text-gray-400 text-lg">{saving ? t.saving : 'Loading…'}</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#0f172a] flex flex-col select-none" style={{ height: '100dvh' }}>
      {/* Progress bar */}
      <div className="flex-shrink-0 h-5">
        <div className="h-1.5 bg-gray-800">
          <motion.div className="h-full bg-emerald-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 flex justify-center" dir={isHe ? 'rtl' : 'ltr'}>
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {screen.kind === 'question' && screen.unit.type === 'single' && (
              <QuestionScreen
                key={`q-${unitIdx}`}
                question={screen.unit.question!}
                group={group}
                language={language}
                isHe={isHe}
                selectedOption={selectedOption}
                setSelectedOption={setSelectedOption}
                selectedMulti={selectedMulti}
                setSelectedMulti={setSelectedMulti}
                likertValue={likertValue}
                setLikertValue={setLikertValue}
                numberInput={numberInput}
                setNumberInput={setNumberInput}
                onSubmitMC={handleMCSubmit}
                onSubmitMultiSelect={handleMultiSelectSubmit}
                onSubmitLikert={handleLikertSubmit}
                onSubmitNumber={handleNumberSubmit}
                t={t}
              />
            )}

            {screen.kind === 'question' && screen.unit.type === 'interactive-rule' && (
              <RuleScreen
                key={`rule-${unitIdx}`}
                question={screen.unit.question!}
                language={language}
                isHe={isHe}
                ruleTriples={ruleTriples}
                ruleInputs={ruleInputs}
                setRuleInputs={setRuleInputs}
                ruleGuess={ruleGuess}
                setRuleGuess={setRuleGuess}
                rulePhase={rulePhase}
                setRulePhase={setRulePhase}
                lastFeedback={lastFeedback}
                onTestTriple={handleRuleTest}
                onSubmitGuess={handleRuleGuessSubmit}
                t={t}
              />
            )}

            {screen.kind === 'question' && (screen.unit.type === 'anchoring-block') && (
              <AnchoringScreen1
                key={`anch-s1-${unitIdx}`}
                block={screen.unit.block!}
                group={group}
                language={language}
                isHe={isHe}
                anchorResponse={anchorResponse}
                setAnchorResponse={setAnchorResponse}
                onSubmit={handleAnchorSubmit}
                t={t}
              />
            )}

            {screen.kind === 'question' && screen.unit.type === 'multiplication-block' && (
              <MultiplicationScreen1
                key={`mul-s1-${unitIdx}`}
                block={screen.unit.block!}
                group={group}
                language={language}
                isHe={isHe}
                onView={handleMultiplicationView}
                t={t}
              />
            )}

            {screen.kind === 'multiplication-timer' && (
              <MultiplicationTimerScreen
                key={`mul-timer-${unitIdx}`}
                block={screen.block}
                group={group}
                language={language}
                isHe={isHe}
              />
            )}

            {screen.kind === 'anchoring-s2' && (
              <AnchoringScreen2
                key={`anch-s2-${unitIdx}`}
                block={screen.block}
                language={language}
                isHe={isHe}
                numberInput={numberInput}
                setNumberInput={setNumberInput}
                onSubmit={handleNumberSubmit}
                t={t}
              />
            )}

            {screen.kind === 'multiplication-estimate' && (
              <AnchoringScreen2
                key={`mul-s2-${unitIdx}`}
                block={screen.block}
                language={language}
                isHe={isHe}
                numberInput={numberInput}
                setNumberInput={setNumberInput}
                onSubmit={handleNumberSubmit}
                t={t}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface QuestionScreenProps {
  question: QuestionDef;
  group: Group;
  language: Language;
  isHe: boolean;
  selectedOption: string | null;
  setSelectedOption: (v: string | null) => void;
  selectedMulti: Set<string>;
  setSelectedMulti: (v: Set<string>) => void;
  likertValue: number | null;
  setLikertValue: (v: number | null) => void;
  numberInput: string;
  setNumberInput: (v: string) => void;
  onSubmitMC: () => void;
  onSubmitMultiSelect: () => void;
  onSubmitLikert: () => void;
  onSubmitNumber: () => void;
  t: Record<string, string>;
}

function QuestionScreen({
  question, group, language, isHe,
  selectedOption, setSelectedOption,
  selectedMulti, setSelectedMulti,
  likertValue, setLikertValue,
  numberInput, setNumberInput,
  onSubmitMC, onSubmitMultiSelect, onSubmitLikert, onSubmitNumber, t,
}: QuestionScreenProps) {
  const text = getQuestionText(question, group, language);
  const lang = language;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col gap-6"
    >
      <p className="text-gray-100 text-base leading-relaxed whitespace-pre-line">{text}</p>

      {question.type === 'multiple-choice' && question.options && (
        <>
          <div className="flex flex-col gap-3">
            {question.options.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedOption(opt.value)}
                className={`w-full text-start px-4 py-3 rounded-xl border transition-colors touch-manipulation ${
                  selectedOption === opt.value
                    ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                    : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-400'
                }`}
              >
                {opt[lang]}
              </button>
            ))}
          </div>
          <SubmitButton disabled={selectedOption === null} onClick={onSubmitMC} label={t.submit} />
        </>
      )}

      {question.type === 'multi-select' && question.options && (
        <>
          {question.multiSelectNote && (
            <p className="text-gray-400 text-sm">{question.multiSelectNote[lang]}</p>
          )}
          <div className="flex flex-col gap-3">
            {question.options.map(opt => {
              const selected = selectedMulti.has(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    const next = new Set(selectedMulti);
                    if (selected) next.delete(opt.value);
                    else next.add(opt.value);
                    setSelectedMulti(next);
                  }}
                  className={`w-full text-start px-4 py-3 rounded-xl border transition-colors touch-manipulation flex items-center gap-3 ${
                    selected
                      ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                      : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                    selected ? 'border-emerald-400 bg-emerald-400' : 'border-gray-500'
                  }`}>
                    {selected && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  {opt[lang]}
                </button>
              );
            })}
          </div>
          <SubmitButton disabled={selectedMulti.size === 0} onClick={onSubmitMultiSelect} label={t.submit} />
        </>
      )}

      {question.type === 'likert' && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-gray-400 px-1">
              <span>{question.likertMin?.[lang]}</span>
              <span>{question.likertMax?.[lang]}</span>
            </div>
            <div className="flex gap-2 justify-center">
              {Array.from({ length: question.likertRange || 5 }, (_, i) => i + 1).map(val => (
                <button
                  key={val}
                  onClick={() => setLikertValue(val)}
                  className={`w-14 h-14 rounded-xl border-2 text-lg font-bold transition-colors touch-manipulation ${
                    likertValue === val
                      ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300'
                      : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-400'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
          <SubmitButton disabled={likertValue === null} onClick={onSubmitLikert} label={t.submit} />
        </>
      )}

      {question.type === 'free-number' && (
        <>
          <div className="flex items-center gap-3">
            <input
              type="text"
              inputMode="numeric"
              value={numberInput}
              onChange={e => setNumberInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && numberInput.trim() && onSubmitNumber()}
              placeholder={isHe ? 'הזינו מספר' : 'Enter a number'}
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400 transition-colors text-center text-lg"
              autoFocus
            />
            {question.unit && question.unit[lang] && (
              <span className="text-gray-400 text-sm">{question.unit[lang]}</span>
            )}
          </div>
          <SubmitButton disabled={!numberInput.trim()} onClick={onSubmitNumber} label={t.submit} />
        </>
      )}
    </motion.div>
  );
}

interface RuleScreenProps {
  question: QuestionDef;
  language: Language;
  isHe: boolean;
  ruleTriples: RuleTriple[];
  ruleInputs: string[];
  setRuleInputs: (v: string[]) => void;
  ruleGuess: string;
  setRuleGuess: (v: string) => void;
  rulePhase: 'testing' | 'guessing';
  setRulePhase: (v: 'testing' | 'guessing') => void;
  lastFeedback: string | null;
  onTestTriple: () => void;
  onSubmitGuess: () => void;
  t: Record<string, string>;
}

function RuleScreen({
  question, language, isHe,
  ruleTriples, ruleInputs, setRuleInputs,
  ruleGuess, setRuleGuess,
  rulePhase, setRulePhase,
  lastFeedback,
  onTestTriple, onSubmitGuess, t,
}: RuleScreenProps) {
  const text = question.text?.[language] ?? '';
  const canTest = ruleTriples.length < 5 && rulePhase === 'testing';
  const inputsValid = ruleInputs.every(s => s.trim() !== '' && !isNaN(parseFloat(s)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col gap-5"
    >
      <p className="text-gray-100 text-base leading-relaxed whitespace-pre-line">{text}</p>

      {/* History */}
      {ruleTriples.length > 0 && (
        <div className="flex flex-col gap-1">
          {ruleTriples.map((tr, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-gray-300 font-mono">
                {tr.numbers.join(' – ')}
              </span>
              <span className={tr.fits ? 'text-emerald-400' : 'text-red-400'}>
                {tr.fits ? (isHe ? 'תואם ✓' : 'Fits ✓') : (isHe ? 'לא תואם ✗' : "Doesn't fit ✗")}
              </span>
            </div>
          ))}
        </div>
      )}

      {lastFeedback && rulePhase === 'testing' && (
        <div className={`text-sm font-semibold ${lastFeedback.includes('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
          {lastFeedback}
        </div>
      )}

      {rulePhase === 'testing' && (
        <>
          {canTest && (
            <div className="flex items-center gap-2">
              {[0, 1, 2].map(i => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  value={ruleInputs[i]}
                  onChange={e => {
                    const next = [...ruleInputs];
                    next[i] = e.target.value;
                    setRuleInputs(next);
                  }}
                  placeholder={`#${i + 1}`}
                  className="w-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-center focus:outline-none focus:border-emerald-400"
                />
              ))}
              <button
                onClick={onTestTriple}
                disabled={!inputsValid}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors touch-manipulation ${
                  inputsValid
                    ? 'bg-blue-500 hover:bg-blue-400 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {t.testTriple}
              </button>
            </div>
          )}

          <p className="text-gray-500 text-xs">
            {isHe
              ? `${ruleTriples.length}/5 סדרות נבדקו`
              : `${ruleTriples.length}/5 sequences tested`}
          </p>

          <button
            onClick={() => setRulePhase('guessing')}
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold rounded-xl transition-colors touch-manipulation"
          >
            {t.readyGuess}
          </button>
        </>
      )}

      {rulePhase === 'guessing' && (
        <>
          <p className="text-gray-300 text-sm font-semibold">{t.guessRule}:</p>
          <input
            type="text"
            value={ruleGuess}
            onChange={e => setRuleGuess(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ruleGuess.trim() && onSubmitGuess()}
            placeholder={isHe ? 'הכלל הוא...' : 'The rule is...'}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400"
            autoFocus
          />
          <SubmitButton disabled={!ruleGuess.trim()} onClick={onSubmitGuess} label={t.submitGuess} />
        </>
      )}
    </motion.div>
  );
}

interface AnchoringScreen1Props {
  block: AnchoringBlock;
  group: Group;
  language: Language;
  isHe: boolean;
  anchorResponse: string | null;
  setAnchorResponse: (v: string | null) => void;
  onSubmit: () => void;
  t: Record<string, string>;
}

function AnchoringScreen1({ block, group, language, isHe, anchorResponse, setAnchorResponse, onSubmit, t }: AnchoringScreen1Props) {
  const text = getQuestionText(block.screen1, group, language);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col gap-6"
    >
      <p className="text-gray-100 text-base leading-relaxed whitespace-pre-line">{text}</p>
      <div className="flex flex-col gap-3">
        {block.screen1.options!.map(opt => (
          <button
            key={opt.value}
            onClick={() => setAnchorResponse(opt.value)}
            className={`w-full text-start px-4 py-3 rounded-xl border transition-colors touch-manipulation ${
              anchorResponse === opt.value
                ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-400'
            }`}
          >
            {opt[language]}
          </button>
        ))}
      </div>
      <SubmitButton disabled={anchorResponse === null} onClick={onSubmit} label={t.submit} />
    </motion.div>
  );
}

interface MultiplicationScreen1Props {
  block: AnchoringBlock;
  group: Group;
  language: Language;
  isHe: boolean;
  onView: () => void;
  t: Record<string, string>;
}

function MultiplicationScreen1({ block, group, language, isHe, onView, t }: MultiplicationScreen1Props) {
  const instructions = isHe
    ? 'עוד רגע תוצג סדרת כפל למשך 5 שניות. נסו להעריך את התוצאה בראש.'
    : 'A multiplication sequence will appear for 5 seconds. Try to estimate the result in your head.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col gap-6 items-center"
    >
      <p className="text-gray-300 text-sm text-center">{instructions}</p>
      <button
        onClick={onView}
        className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation"
      >
        {isHe ? 'מוכנים? לחצו להתחלה' : 'Ready? Click to start'}
      </button>
    </motion.div>
  );
}

function MultiplicationTimerScreen({ block, group, language, isHe }: {
  block: AnchoringBlock; group: Group; language: Language; isHe: boolean;
}) {
  const [countdown, setCountdown] = useState(5);
  const text = getQuestionText(block.screen1, group, language);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col gap-6 items-center"
    >
      <p className="text-gray-100 text-xl font-bold leading-relaxed whitespace-pre-line text-center">{text}</p>
      <span className="text-gray-400 text-2xl font-mono tabular-nums">{countdown}</span>
    </motion.div>
  );
}

interface AnchoringScreen2Props {
  block: AnchoringBlock;
  language: Language;
  isHe: boolean;
  numberInput: string;
  setNumberInput: (v: string) => void;
  onSubmit: () => void;
  t: Record<string, string>;
}

function AnchoringScreen2({ block, language, isHe, numberInput, setNumberInput, onSubmit, t }: AnchoringScreen2Props) {
  const text = block.screen2.text?.[language] ?? '';
  const unit = block.screen2.unit?.[language] ?? '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col gap-6"
    >
      <p className="text-gray-100 text-base leading-relaxed">{text}</p>
      <div className="flex items-center gap-3">
        <input
          type="text"
          inputMode="numeric"
          value={numberInput}
          onChange={e => setNumberInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && numberInput.trim() && onSubmit()}
          placeholder={isHe ? 'הזינו מספר' : 'Enter a number'}
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400 transition-colors text-center text-lg"
          autoFocus
        />
        {unit && <span className="text-gray-400 text-sm">{unit}</span>}
      </div>
      <SubmitButton disabled={!numberInput.trim()} onClick={onSubmit} label={t.submit} />
    </motion.div>
  );
}

function SubmitButton({ disabled, onClick, label }: { disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); if (!disabled) onClick(); }}
      disabled={disabled}
      className={`w-full py-3.5 rounded-xl font-bold text-lg transition-colors touch-manipulation ${
        disabled
          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
          : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg'
      }`}
    >
      {label}
    </button>
  );
}
