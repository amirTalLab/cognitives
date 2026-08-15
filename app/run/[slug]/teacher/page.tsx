'use client';

// The teacher dashboard for any definition-based experiment.
//
// One route for all of them. The route's only job is to find the definition and say where
// results come from; everything else is the shared Dashboard component.

import { use, useCallback, useEffect, useState } from 'react';
import { ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import { getDefinition } from '@/lib/experiment-runtime/registry';
import { Dashboard } from '@/lib/experiment-runtime/Dashboard';
import { fetchRows } from '@/lib/experiment-runtime/store';

export default function TeacherPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [def, setDef] = useState<ExperimentDefinition | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getDefinition(slug).then(d => { setDef(d); setChecked(true); });
  }, [slug]);

  const load = useCallback(() => fetchRows(slug), [slug]);

  if (!checked) return <main className="min-h-screen bg-[#0f172a]" />;

  if (!def) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6">
        <p className="text-gray-400">No experiment named &ldquo;{slug}&rdquo;.</p>
      </main>
    );
  }

  return <Dashboard definition={def} fetchRows={load} />;
}
