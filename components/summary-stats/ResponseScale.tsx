'use client';

import React, { useState } from 'react';
import { StimulusType } from '@/types/summary-stats';
import { SingleItemDisplay } from './ArrayDisplay';
import { sliderToValue, STAT_LABELS } from '@/lib/summary-stats/stimuli';

interface ResponseScaleProps {
  stimulusType: StimulusType;
  onConfirm: (value: number) => void;
  language: 'en' | 'he';
  previewSize?: number;
}

export default function ResponseScale({
  stimulusType,
  onConfirm,
  language,
  previewSize = 180,
}: ResponseScaleProps) {
  const [sliderPos, setSliderPos] = useState(50);
  const currentValue = sliderToValue(sliderPos, stimulusType);
  const label = STAT_LABELS[stimulusType][language];

  const unitLabels: Record<StimulusType, { low: string; high: string }> = {
    'circles':      { low: language === 'he' ? 'קטן' : 'Small', high: language === 'he' ? 'גדול' : 'Large' },
    'line-lengths': { low: language === 'he' ? 'קצר' : 'Short',  high: language === 'he' ? 'ארוך' : 'Long'  },
  };

  const confirmLabel = language === 'he' ? 'אישור' : 'Confirm';

  return (
    <div className={`flex flex-col items-center gap-5 ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <p className="text-lg font-semibold text-gray-200 text-center px-4">{label}</p>

      <SingleItemDisplay value={currentValue} stimulusType={stimulusType} size={previewSize} color="#f97316" />

      <div className="w-full max-w-sm px-4">
        <style>{`
          .ss-slider::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:#f97316;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);}
          .ss-slider::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:#f97316;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);}
          .ss-slider::-webkit-slider-runnable-track{height:14px;border-radius:7px;background:#374151;}
          .ss-slider::-moz-range-track{height:14px;border-radius:7px;background:#374151;}
        `}</style>
        <div className="flex justify-between text-xs text-gray-400 mb-1" style={{ direction: 'ltr' }}>
          <span>{unitLabels[stimulusType].low}</span>
          <span>{unitLabels[stimulusType].high}</span>
        </div>
        <input
          type="range" min={0} max={100} value={sliderPos}
          onChange={e => setSliderPos(Number(e.target.value))}
          className="ss-slider w-full appearance-none cursor-pointer"
          style={{ direction: 'ltr', height: '14px', borderRadius: '7px', background: '#374151' }}
        />
      </div>

      <button
        onPointerDown={e => { e.preventDefault(); onConfirm(currentValue); }}
        className="px-10 py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-lg transition-colors shadow-lg touch-manipulation"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// EnsembleFeedback – comparison shown during practice
// ──────────────────────────────────────────────

interface EnsembleFeedbackProps {
  stimulusType: StimulusType;
  trueValue: number;
  responseValue: number;
  language: 'en' | 'he';
  onNext: () => void;
}

export function EnsembleFeedback({ stimulusType, trueValue, responseValue, language, onNext }: EnsembleFeedbackProps) {
  const t = language === 'he'
    ? { yourAnswer: 'התשובה שלך', trueValue: 'ערך אמיתי', next: 'ניסוי הבא' }
    : { yourAnswer: 'Your answer', trueValue: 'True value', next: 'Next Trial' };

  return (
    <div className={`flex flex-col items-center gap-5 ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <div className="flex gap-6 items-center">
        <div className="flex flex-col items-center gap-2">
          <p className="text-gray-400 text-xs">{t.yourAnswer}</p>
          <SingleItemDisplay value={responseValue} stimulusType={stimulusType} size={130} color="#fb923c" />
        </div>
        <div className="text-2xl text-gray-500">vs</div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-gray-400 text-xs">{t.trueValue}</p>
          <SingleItemDisplay value={trueValue} stimulusType={stimulusType} size={130} color="#34d399" />
        </div>
      </div>
      <button
        onPointerDown={e => { e.preventDefault(); onNext(); }}
        className="px-8 py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation"
      >
        {t.next}
      </button>
    </div>
  );
}
