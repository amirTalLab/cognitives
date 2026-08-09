'use client';

import { useEffect, useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, RefreshCw, BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TrialResult } from '@/types/stroop';
import { getLanguageGroup, LANGUAGE_GROUPS, type LanguageGroup } from '@/lib/stroop/language-groups';
import { LanguageGroupBarChart } from '@/components/stroop/charts/language-group-bar-chart';
import { IndividualScatterChart } from '@/components/stroop/charts/individual-scatter-chart';
import { TeacherSpeedAccuracyChart } from '@/components/stroop/charts/teacher-speed-accuracy-chart';
import { verifyPassword } from '@/lib/auth';
import { generateMockData } from '@/lib/stroop/mock-data';

interface AggregateData {
  languageGroup: LanguageGroup;
  congruentMean: number;
  congruentSEM: number;
  incongruentMean: number;
  incongruentSEM: number;
  congruentCount: number;
  incongruentCount: number;
}

interface SubjectData {
  sessionId: string;
  participantName?: string;
  congruentMean: number;
  incongruentMean: number;
  accuracy: number;
  languageGroup: LanguageGroup;
}

export default function TeacherDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allResults, setAllResults] = useState<TrialResult[]>([]);
  const [aggregateData, setAggregateData] = useState<AggregateData[]>([]);
  const [subjectData, setSubjectData] = useState<SubjectData[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalTrials, setTotalTrials] = useState(0);
  const [useMock, setUseMock] = useState(false);

  // ── Password gate ──────────────────────────────────────────────────────────
  const [authed, setAuthed]   = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('ss_teacher_authed') === '1') setAuthed(true);
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await verifyPassword(pwInput);
    if (ok) {
      sessionStorage.setItem('ss_teacher_authed', '1');
      setAuthed(true);
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  // Supabase enforces a server-side max of 1000 rows per request.
  // Paginate in batches until we get a partial page (end of data).
  const fetchAllRows = async (): Promise<TrialResult[]> => {
    const PAGE = 1000;
    const all: TrialResult[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('stroop_results')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (data) all.push(...(data as TrialResult[]));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = useMock ? generateMockData() : await fetchAllRows();

      if (!data || data.length === 0) {
        setError('No data available yet. Waiting for participants to complete the experiment.');
        setLoading(false);
        return;
      }

      setAllResults(data);
      setTotalTrials(data.length);

      // Get unique sessions
      const uniqueSessions = new Set<string>(data.map((r: TrialResult) => r.session_id));
      setTotalSessions(uniqueSessions.size);

      // Calculate aggregate data per language group
      const aggregates: AggregateData[] = LANGUAGE_GROUPS.map((group) => {
        const groupResults = data.filter((r: TrialResult) => getLanguageGroup(r.word_text) === group);

        const congruentResults = groupResults.filter((r: TrialResult) => r.is_congruent && r.is_correct);
        const incongruentResults = groupResults.filter((r: TrialResult) => !r.is_congruent && r.is_correct);

        const congruentMean =
          congruentResults.length > 0
            ? congruentResults.reduce((sum: number, r: TrialResult) => sum + r.reaction_time_ms, 0) / congruentResults.length
            : 0;

        const incongruentMean =
          incongruentResults.length > 0
            ? incongruentResults.reduce((sum: number, r: TrialResult) => sum + r.reaction_time_ms, 0) / incongruentResults.length
            : 0;

        // Calculate SEM (Standard Error of the Mean)
        const calculateSEM = (results: TrialResult[], mean: number) => {
          if (results.length <= 1) return 0;
          const variance =
            results.reduce((sum: number, r: TrialResult) => sum + Math.pow(r.reaction_time_ms - mean, 2), 0) / results.length;
          const sd = Math.sqrt(variance);
          return sd / Math.sqrt(results.length);
        };

        const congruentSEM = calculateSEM(congruentResults, congruentMean);
        const incongruentSEM = calculateSEM(incongruentResults, incongruentMean);

        return {
          languageGroup: group,
          congruentMean,
          congruentSEM,
          incongruentMean,
          incongruentSEM,
          congruentCount: congruentResults.length,
          incongruentCount: incongruentResults.length,
        };
      });

      setAggregateData(aggregates);

      // Calculate per-subject data for scatter plot
      const subjects: SubjectData[] = [];
      uniqueSessions.forEach((sessionId) => {
        const sessionResults = data.filter((r: TrialResult) => r.session_id === sessionId);
        const participantName = sessionResults[0]?.participant_name;
        console.log('Session:', sessionId.substring(0, 8), 'Participant name:', participantName);

        // Calculate per language group for this subject
        LANGUAGE_GROUPS.forEach((group) => {
          const groupResults = sessionResults.filter((r: TrialResult) => getLanguageGroup(r.word_text) === group);

          if (groupResults.length === 0) return;

          const congruentResults = groupResults.filter((r: TrialResult) => r.is_congruent);
          const incongruentResults = groupResults.filter((r: TrialResult) => !r.is_congruent);

          const congruentMean =
            congruentResults.length > 0
              ? congruentResults.reduce((sum: number, r: TrialResult) => sum + r.reaction_time_ms, 0) / congruentResults.length
              : 0;

          const incongruentMean =
            incongruentResults.length > 0
              ? incongruentResults.reduce((sum: number, r: TrialResult) => sum + r.reaction_time_ms, 0) / incongruentResults.length
              : 0;

          const correctCount = groupResults.filter((r: TrialResult) => r.is_correct).length;
          const accuracy = groupResults.length > 0 ? (correctCount / groupResults.length) * 100 : 0;

          subjects.push({
            sessionId,
            participantName,
            congruentMean,
            incongruentMean,
            accuracy,
            languageGroup: group,
          });
        });
      });

      setSubjectData(subjects);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, useMock]);

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <GraduationCap className="w-10 h-10 text-emerald-400" />
          <h1 className="text-xl font-bold">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              autoFocus
              className={`w-full px-4 py-3 rounded-lg border bg-zinc-800 text-white outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-border focus:border-emerald-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit"
              className="w-full py-3 bg-emerald-400 hover:bg-emerald-300 text-zinc-900 font-bold rounded-lg transition-colors">
              Enter
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="inline-block mb-4"
          >
            <RefreshCw className="w-8 h-8 text-emerald-400" />
          </motion.div>
          <p className="text-muted">Loading data...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-10 h-10 text-emerald-400" />
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Teacher Dashboard</h1>
              <p className="text-muted mt-1">
                Aggregate Stroop Effect Results
                {useMock && <span className="text-amber-400 ml-2">(mock data)</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUseMock(v => !v)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                useMock
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'bg-zinc-800 border-border text-muted hover:bg-zinc-700'
              }`}
            >
              {useMock ? 'Mock Data ON' : 'Mock Data'}
            </button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchData}
              disabled={useMock}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-400 text-zinc-900
                         font-semibold rounded-lg hover:bg-emerald-300 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Data
            </motion.button>
          </div>
        </div>

        {/* Stats Cards */}
        {!error && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-medium text-muted">Total Participants</h3>
              </div>
              <p className="text-3xl font-bold">{totalSessions}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-medium text-muted">Total Trials</h3>
              </div>
              <p className="text-3xl font-bold">{totalTrials}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-medium text-muted">Data Points</h3>
              </div>
              <p className="text-3xl font-bold">{allResults.length}</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-card border border-yellow-500/50 rounded-xl p-8 mb-8 text-center">
            <p className="text-yellow-400 mb-4">{error}</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchData}
              className="px-4 py-2 bg-emerald-400 text-zinc-900 font-semibold rounded-lg
                         hover:bg-emerald-300 transition-colors"
            >
              Retry
            </motion.button>
          </div>
        )}

        {/* Charts */}
        {!error && aggregateData.length > 0 && (
          <div className="space-y-8">
            {/* Bar Chart with SEM */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-2">Reaction Time by Language Group</h2>
              <p className="text-muted mb-6">
                Mean reaction times with Standard Error of Mean (SEM) error bars.
                Compares congruent vs incongruent trials across language groups.
              </p>
              <LanguageGroupBarChart data={aggregateData} />
            </div>

            {/* Individual Scatter Plot */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-2">Individual Subject Averages</h2>
              <p className="text-muted mb-6">
                Each point represents one participant&apos;s average reaction time for congruent vs incongruent trials
                within each language group.
              </p>
              <IndividualScatterChart data={subjectData} />
            </div>

            {/* Speed-Accuracy Tradeoff */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-2">Speed-Accuracy Tradeoff</h2>
              <p className="text-muted mb-6">
                Relationship between reaction time and accuracy for each participant across language groups.
                Points higher and to the left indicate faster and more accurate performance.
              </p>
              <TeacherSpeedAccuracyChart data={subjectData} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
