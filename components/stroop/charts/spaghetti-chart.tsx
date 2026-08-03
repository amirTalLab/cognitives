'use client';

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { TrialResult, WORDS } from '@/types/stroop';

interface SpaghettiChartProps {
  results: TrialResult[];
}

interface WordComparison {
  word: string;
  congruent: number | null;
  incongruent: number | null;
}

function processData(results: TrialResult[]): WordComparison[] {
  return WORDS.map((word) => {
    const congruentTrials = results.filter(
      (r) => r.word_text === word && r.is_congruent && r.is_correct
    );
    const incongruentTrials = results.filter(
      (r) => r.word_text === word && !r.is_congruent && r.is_correct
    );

    const congruentAvg =
      congruentTrials.length > 0
        ? congruentTrials.reduce((sum, r) => sum + r.reaction_time_ms, 0) / congruentTrials.length
        : null;

    const incongruentAvg =
      incongruentTrials.length > 0
        ? incongruentTrials.reduce((sum, r) => sum + r.reaction_time_ms, 0) / incongruentTrials.length
        : null;

    return {
      word: word.charAt(0).toUpperCase() + word.slice(1),
      congruent: congruentAvg ? Math.round(congruentAvg) : null,
      incongruent: incongruentAvg ? Math.round(incongruentAvg) : null,
    };
  });
}

export function SpaghettiChart({ results }: SpaghettiChartProps) {
  const data = processData(results);

  // Transform for line chart - each word becomes a line connecting congruent to incongruent
  const lineData = [
    { condition: 'Congruent', ...Object.fromEntries(data.map((d) => [d.word, d.congruent])) },
    { condition: 'Incongruent', ...Object.fromEntries(data.map((d) => [d.word, d.incongruent])) },
  ];

  // Calculate if effect is consistent
  const effectsConsistent = data.every(
    (d) => d.congruent !== null && d.incongruent !== null && d.incongruent > d.congruent
  );

  return (
    <div className="w-full">
      <p className="text-sm text-muted mb-4">
        Lines connect the average reaction time for each word from congruent to incongruent conditions.
        {effectsConsistent ? (
          <span className="text-emerald-400"> All lines slope upward, showing a consistent Stroop Effect across words.</span>
        ) : (
          <span className="text-amber-400"> Some words show different patterns - the effect varies by word.</span>
        )}
      </p>
      <div className="h-80 md:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={lineData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="condition"
              stroke="#71717a"
              tick={{ fill: '#71717a' }}
            />
            <YAxis
              stroke="#71717a"
              tick={{ fill: '#71717a' }}
              label={{
                value: 'Reaction Time (ms)',
                angle: -90,
                position: 'insideLeft',
                fill: '#71717a',
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                color: '#fafafa',
              }}
              formatter={(value, name) => [`${value}ms`, String(name)]}
            />
            <Line
              type="linear"
              dataKey="Red"
              stroke="#f43f5e"
              strokeWidth={3}
              dot={{ fill: '#f43f5e', strokeWidth: 0, r: 6 }}
              connectNulls
            />
            <Line
              type="linear"
              dataKey="Green"
              stroke="#34d399"
              strokeWidth={3}
              dot={{ fill: '#34d399', strokeWidth: 0, r: 6 }}
              connectNulls
            />
            <Line
              type="linear"
              dataKey="Yellow"
              stroke="#fbbf24"
              strokeWidth={3}
              dot={{ fill: '#fbbf24', strokeWidth: 0, r: 6 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f43f5e' }} />
          <span className="text-muted">Red</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#34d399' }} />
          <span className="text-muted">Green</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
          <span className="text-muted">Yellow</span>
        </div>
      </div>
    </div>
  );
}
