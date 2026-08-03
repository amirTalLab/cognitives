'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ZAxis,
  ReferenceLine,
} from 'recharts';
import { LanguageGroup } from '@/lib/stroop/language-groups';

interface SubjectData {
  sessionId: string;
  participantName?: string;
  congruentMean: number;
  incongruentMean: number;
  accuracy: number;
  languageGroup: LanguageGroup;
}

interface SpeedAccuracyChartProps {
  data: SubjectData[];
}

const LANGUAGE_GROUP_COLORS: Record<LanguageGroup, string> = {
  English: '#3b82f6',
  Hebrew: '#a855f7',
  Spanish: '#f59e0b',
  'Non-words': '#6b7280',
};

interface ScatterTooltipProps {
  active?: boolean;
  payload?: { payload: { participantName?: string; x: number; y: number } }[];
}

const CustomTooltip = ({ active, payload }: ScatterTooltipProps) => {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;

  return (
    <div
      style={{
        backgroundColor: '#18181b',
        border: '1px solid #27272a',
        borderRadius: '8px',
        padding: '8px 12px',
      }}
    >
      <p style={{ color: '#fafafa', marginBottom: '4px', fontWeight: 'bold' }}>
        {data.participantName || 'Unknown'}
      </p>
      <p style={{ color: '#fafafa', margin: '2px 0' }}>
        Mean RT: {data.x} ms
      </p>
      <p style={{ color: '#fafafa', margin: '2px 0' }}>
        Accuracy: {data.y}%
      </p>
    </div>
  );
};

export function TeacherSpeedAccuracyChart({ data }: SpeedAccuracyChartProps) {
  const groupedData = {
    English: data.filter((d) => d.languageGroup === 'English'),
    Hebrew: data.filter((d) => d.languageGroup === 'Hebrew'),
    Spanish: data.filter((d) => d.languageGroup === 'Spanish'),
    'Non-words': data.filter((d) => d.languageGroup === 'Non-words'),
  };

  const scatterData = (group: LanguageGroup) =>
    groupedData[group].map((d) => ({
      x: Math.round((d.congruentMean + d.incongruentMean) / 2),
      y: Math.round(d.accuracy * 10) / 10,
      name: group,
      participantName: d.participantName || d.sessionId.substring(0, 8),
    }));

  return (
    <ResponsiveContainer width="100%" height={500}>
      <ScatterChart
        margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          type="number"
          dataKey="x"
          name="Mean RT"
          stroke="#a1a1aa"
          tick={{ fill: '#a1a1aa' }}
          label={{ value: 'Mean Reaction Time (ms)', position: 'insideBottom', offset: -5, fill: '#a1a1aa' }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Accuracy"
          domain={[0, 100]}
          stroke="#a1a1aa"
          tick={{ fill: '#a1a1aa' }}
          label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', fill: '#a1a1aa' }}
        />
        <ZAxis range={[100, 100]} />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ strokeDasharray: '3 3' }}
        />
        <Legend
          wrapperStyle={{ color: '#a1a1aa' }}
        />
        <ReferenceLine y={90} stroke="#10b981" strokeDasharray="3 3" />
        <Scatter
          name="English"
          data={scatterData('English')}
          fill={LANGUAGE_GROUP_COLORS.English}
        />
        <Scatter
          name="Hebrew"
          data={scatterData('Hebrew')}
          fill={LANGUAGE_GROUP_COLORS.Hebrew}
        />
        <Scatter
          name="Spanish"
          data={scatterData('Spanish')}
          fill={LANGUAGE_GROUP_COLORS.Spanish}
        />
        <Scatter
          name="Non-words"
          data={scatterData('Non-words')}
          fill={LANGUAGE_GROUP_COLORS['Non-words']}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
