# Build a New Cognitive Experiment

Use this file at the start of a new conversation to guide building a complete experiment for the cognitives-xi.vercel.app site.

---

## Overview

Builds a complete, deployable cognitive psychology experiment for **cognitives-xi.vercel.app** — a Next.js + Supabase site for a Hebrew-language university Cognitive Processes course.

**Tech stack:** Next.js 15 App Router · TypeScript strict · Tailwind CSS · Framer Motion · Recharts · Supabase · Lucide React · Vercel

**Project root:** `I:\My Drive\code\claudeCode\playin\`

---

## Step 0 — Collect required inputs

Before writing any code, confirm you have all of these:

| Input | Description | Example |
|---|---|---|
| **URL slug** | The path after the domain | `/mentalRep`, `/stroopLight` |
| **Category** | Which field of cognition | PERCEPTION · ATTENTION · LANGUAGE · EXECUTIVE CONTROL · IMAGINATION · MEMORY · LEARNING · CONSCIOUSNESS · DECISION MAKING · THINKING · CATEGORIZATION · HUMOR · CREATIVITY |
| **Design description** | What the experiment measures and why | "Tests holistic face processing via misaligned composite faces" |
| **Conditions** | List of experimental conditions | word / pseudoword / single-letter |
| **Trial structure** | Phases shown per trial, what appears in each, timing (ms) | fixation 500ms → stimulus 200ms → mask 500ms → response |
| **Trial counts & ordering** | How many per condition, block/random | 20 per condition, fully randomized |
| **Teacher charts** | What to aggregate and how | Bar: accuracy by condition; Scatter: individual vs. group mean |

If any are missing, ask before writing code.

---

## Step 1 — Read the existing codebase first

Read these files before writing anything. They are your templates — adapt them, don't start from scratch.

```
app/page.tsx                              # Homepage EXPERIMENTS + CATEGORIES arrays
app/wordSuperiority/page.tsx              # Landing page pattern
app/wordSuperiority/practice/page.tsx     # Practice page (phase machine, RTL, feedback)
app/wordSuperiority/experiment/page.tsx   # Experiment page (Supabase save, timing)
app/wordSuperiority/thanks/page.tsx       # Thanks/results page
app/wordSuperiority/teacher/page.tsx      # Teacher dashboard (Reveal, SEM, pagination)
lib/word-superiority/stimuli.ts           # Stimuli generation, constants, shuffle
types/word-superiority.ts                 # Type definition pattern
```

For image-based experiments, also read:
```
app/CompositeFace/experiment/page.tsx     # Image preloading, CSS composite display
lib/composite-face/stimuli.ts             # preloadAllFaces() pattern
components/composite-face/FaceDisplay.tsx # position:absolute overlay pattern
```

---

## Step 2 — Files to create

```
types/[slug-kebab].ts                 # TypeScript interfaces (Condition, Trial, TrialResult)
lib/[slug-kebab]/stimuli.ts           # Stimuli generation, timing constants, shuffle
app/[slug]/page.tsx                   # Landing page (instructions, name input, begin)
app/[slug]/practice/page.tsx          # Practice trials with per-trial feedback
app/[slug]/experiment/page.tsx        # Main experiment (saves to Supabase)
app/[slug]/thanks/page.tsx            # Individual results summary
app/[slug]/teacher/page.tsx           # Teacher dashboard
supabase-[slug-kebab].sql             # SQL schema — user runs this in Supabase manually
```

Also **edit** `app/page.tsx` to register the experiment.

---

## Step 3 — Visual and UX conventions

### Theme (always use these)
- Background: `bg-[#0f172a]` dark navy
- Cards: `bg-card border border-border rounded-xl`
- Primary accent: `text-emerald-400` / `bg-emerald-400`
- Muted text: `text-muted` or `text-gray-400`
- Stimuli font: `fontFamily: 'monospace'`

### Phone-compatible layout
- Experiment/practice pages: `style={{ height: '100dvh' }}` (not `min-h-screen`) — prevents iOS address bar resize issues
- Touch buttons: `touch-manipulation` class, minimum 44×44px (`w-20 h-20` for response buttons)
- No hover-only interactions for core task responses

### Language (Hebrew default, English toggle)
- Store `'he'` or `'en'` in `sessionStorage` as `[key]_language`; read on every page
- Default: Hebrew
- Toggle button in the UI (top-right area)
- Hebrew text containers: `dir="rtl"` attribute
- **RTL flex rows**: use `style={{ flexDirection: 'row', direction: 'rtl' }}` — **never** `row-reverse`, it gets cancelled by an ancestor `dir="rtl"` and produces the opposite of what you want

### Session data (stored at landing page, read on all pages)
```typescript
const KEY = 'exp'; // short key prefix unique to this experiment
sessionStorage.setItem(`${KEY}_name`, name.trim());
sessionStorage.setItem(`${KEY}_language`, language);
sessionStorage.setItem(`${KEY}_session_id`, crypto.randomUUID());
```

---

## Step 4 — Page specifications

### Landing page
- Brief bilingual instructions (Hebrew primary)
- Name input (`<input type="text" required>`) — store in sessionStorage
- Language toggle (he ↔ en)
- Begin button → navigate to `./practice`

### Practice page
- 4–8 trials with identical structure to main experiment
- After each response: show feedback (correct/incorrect, reveal correct answer if wrong)
- "Next" / "המשך" button to advance after feedback
- Progress bar at top
- After last practice trial → navigate to `./experiment`
- Do not write practice data to Supabase (or write with `is_practice: true`)

### Experiment page
- Phase state machine driving stimulus presentation
- Progress bar at top
- On each completed trial: insert one row to Supabase
- After last trial → navigate to `./thanks`

### Thanks page
- Read session results from Supabase (by session_id) or pass via sessionStorage
- Show individual accuracy / RT / per-condition breakdown
- Bilingual
- No password, no teacher-level data

### Teacher page
- Password gate (same hash as site: `5f63c8759a4968d6e814db98e85f7658554882b44213d85f3a3b15480f47e69f`)
- **Always use paginated Supabase queries** — the server silently caps at 1000 rows (see Critical Patterns). Every teacher page must use the `fetchAllRows` pagination loop; never use a plain `.select()` without `.range()`.
- One `ChartCard` per requested chart, each with its own Reveal button
- SEM error bars on all bar charts
- Axes and chart shell always visible; only data series hide/reveal
- Offer CSV download of raw data

---

## Step 5 — Critical patterns

### Phase state machine — timing

```typescript
type Phase = 'fixation' | 'stimulus' | 'mask' | 'response' | 'feedback';
// Adapt phases to the experiment design (some may not need mask or feedback)

useEffect(() => {
  if (!trial || phase === 'response' || phase === 'feedback') return;
  const durations: Record<string, number> = {
    fixation: FIXATION_MS,
    stimulus: DISPLAY_MS,
    mask: MASK_MS,
  };
  const next: Record<string, Phase> = {
    fixation: 'stimulus',
    stimulus: 'mask',
    mask: 'response',
  };
  const timer = setTimeout(() => setPhase(next[phase] as Phase), durations[phase]);
  return () => clearTimeout(timer);
}, [phase, trial]);
```

**CRITICAL:** Never wrap timed phases (fixation / stimulus / mask) in `<AnimatePresence>`. Its exit animation (~300ms) will silently eat brief stimuli. Only use `AnimatePresence` around response and feedback phases.

### Supabase pagination — CRITICAL

The Supabase server silently caps responses at 1000 rows regardless of `.limit()`. Always paginate:

```typescript
async function fetchAllRows(): Promise<MyRow[]> {
  const rows: MyRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('table_name')
      .select('*')
      .eq('is_practice', false)
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as MyRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}
```

### ChartCard with Reveal button

```tsx
function ChartCard({ title, children }: {
  title: string;
  children: (revealed: boolean) => React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-200">{title}</h3>
        <button
          onClick={() => setRevealed(r => !r)}
          className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-emerald-400 hover:text-emerald-400 transition-colors"
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {children(revealed)}
    </div>
  );
}
```

Inside the chart, conditionally render data series based on `revealed`:

```tsx
<ChartCard title="Accuracy by Condition">
  {(revealed) => (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="condition" stroke="#9ca3af" />
        <YAxis stroke="#9ca3af" domain={[0, 100]}
          label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
        <Legend verticalAlign="top" />  {/* top prevents overlap with axis labels */}
        {revealed && (
          <Bar dataKey="mean" fill="#34d399" name="Accuracy (%)">
            <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
          </Bar>
        )}
      </BarChart>
    </ResponsiveContainer>
  )}
</ChartCard>
```

### SEM calculation (always per-participant means first)

```typescript
function sem(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}
// Compute per-participant means first, then call sem() on that array — not on raw trials.
```

### Scatter diagonal line (chance or perfect-performance reference)

```tsx
{/* Two-point Scatter series with line prop — NOT a Customized component */}
<Scatter
  data={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
  line={{ stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '6 4' }}
  shape={(() => <></>) as any}
  legendType="none"
/>
```

### Progress bar

```tsx
<div className="flex-shrink-0 h-6">
  <div className="h-1.5 bg-gray-800">
    <motion.div
      className="h-full bg-emerald-500"
      animate={{ width: `${(idx / TOTAL) * 100}%` }}
      transition={{ duration: 0.4 }}
    />
  </div>
</div>
```

### Image preloading (experiments with images)

```typescript
function preloadImages(urls: string[]) {
  urls.forEach(url => { const img = new Image(); img.src = url; });
}
// Call on mount, before any timed stimulus presentation:
useEffect(() => { preloadImages(getAllImageUrls()); }, []);
```

### CSS overlay / composite image display

```tsx
{/* Stack two image halves with optional horizontal offset for misalignment */}
<div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
  <div style={{ position: 'absolute', top: 0, left: 0, width: SIZE, height: TOP_H, overflow: 'hidden' }}>
    <img src={topSrc} style={{ width: SIZE, height: SIZE, objectFit: 'cover', display: 'block' }} />
  </div>
  <div style={{ position: 'absolute', top: TOP_H, left: OFFSET, width: SIZE, height: BOTTOM_H, overflow: 'hidden' }}>
    <img src={bottomSrc} style={{ width: SIZE, height: SIZE, objectFit: 'cover', display: 'block', marginTop: -TOP_H }} />
  </div>
</div>
{/* OFFSET=0 for aligned, >0 for misaligned. Use left:OFFSET not marginLeft — marginLeft shifts container width */}
```

---

## Step 6 — SQL schema template

Create `supabase-[slug-kebab].sql` in the project root:

```sql
CREATE TABLE IF NOT EXISTS [experiment]_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  trial_index      int,
  condition        text,
  -- Add experiment-specific columns (stimulus shown, response given, etc.)
  is_correct       boolean,
  reaction_time_ms int,
  is_practice      boolean default false
);

ALTER TABLE [experiment]_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON [experiment]_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON [experiment]_results FOR SELECT USING (true);
```

Remind the user to **run this SQL in the Supabase SQL editor** before testing data collection.

---

## Step 7 — Register on the homepage

In `app/page.tsx`, add to the `EXPERIMENTS` array:

```typescript
{
  id: '[slug]',
  title: 'Experiment Title',
  titleHe: 'כותרת הניסוי',
  icon: SomeLucideIcon,   // import from 'lucide-react'
  color: 'text-[color]-400',
},
```

Add the slug to the matching entry in `CATEGORIES`:

```typescript
{ name: 'MEMORY', nameHe: 'זיכרון', ids: ['drm', '[slug]'] },
```

---

## Step 8 — Finish

1. Verify TypeScript compiles: `npx tsc --noEmit` from the project root
2. Commit all new/changed files with a clear message
3. Push — triggers Vercel deployment automatically
4. Tell the user: "Run `supabase-[slug-kebab].sql` in the Supabase SQL editor to create the results table."

---

## Known gotchas

| Symptom | Root cause | Fix |
|---|---|---|
| Brief stimulus never visible | `AnimatePresence mode="wait"` exit animation eats it | Remove `AnimatePresence` from all timed phases |
| Only 14–15 participants in teacher page | Supabase server 1000-row cap silently overrides `.limit()` | Use `.range(from, from+999)` pagination loop |
| Scatter diagonal invisible | `Customized` component can't access axis scales reliably | Use two-point `<Scatter data={[{x:0,y:0},{x:100,y:100}]} line={...}>` |
| Legend overlaps Y-axis label | Default legend renders below, overlaps content | Add `verticalAlign="top"` to `<Legend>` |
| RTL flex boxes in wrong order | `flexDirection:'row-reverse'` cancelled by ancestor `dir="rtl"` | Use `flexDirection:'row', direction:'rtl'` on the container |
| Images appear out of sync during brief display | Async load during timed window | `preloadImages()` on mount before any trials start |
| Image misalignment shifts the whole card | `marginLeft` changes container width | Use `position:absolute; left:OFFSET` inside `position:relative` container |
| Scatter shows no data | Guard `data.length < 2` blocking single-participant datasets | Change guard to `data.length === 0` |
| CSV download TypeScript error | Union type not assignable to `Record<string,unknown>` | Cast as `r as unknown as Record<string, unknown>` |
