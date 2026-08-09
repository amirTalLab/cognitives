---
name: new-cognitive-experiment
description: "Builds a complete, deployable cognitive psychology experiment for the cognitives Next.js site used in a university Cognitive Processes course. Use this skill whenever the user wants to add a new experiment, task, or study to the cognitives site — even if they just say 'create an experiment about X', 'add a new task at /url', 'I want a Stroop-like experiment', or 'build a [topic] study for the site'. Usually invoked by the experiment-from-paper skill with an already-extracted design spec. The skill handles every page — landing, practice, experiment, thanks, and teacher dashboard."
---

# Build a New Cognitive Experiment

## Overview

This skill builds a complete, deployable cognitive psychology experiment for the
**cognitives** site — a Next.js + Supabase site for a Hebrew-language university
Cognitive Processes course.

**Tech stack:** Next.js 16 App Router · TypeScript strict · Tailwind CSS · Framer Motion · Recharts · Supabase · Lucide React · Vercel

**Project root:** the Next.js repo you are currently working in (this project).

---

## Step 0 — Collect required inputs

Before writing any code, confirm you have all of these. (When invoked by
`experiment-from-paper`, these arrive as the extracted design spec — still confirm the
inferred fields.)

| Input | Description | Example |
|---|---|---|
| **URL slug** | The path after the domain | `/mentalRep`, `/boubaKiki` |
| **Category** | Which field of cognition | PERCEPTION · ATTENTION · LANGUAGE · EXECUTIVE CONTROL · IMAGINATION · MEMORY · LEARNING · CONSCIOUSNESS · DECISION MAKING · THINKING · CATEGORIZATION · HUMOR · CREATIVITY |
| **Design description** | What the experiment measures and why | "Tests holistic face processing via misaligned composite faces" |
| **Conditions** | List of experimental conditions | word / pseudoword / single-letter |
| **Trial structure** | Phases shown per trial, what appears in each, timing (ms) | fixation 500ms → stimulus 200ms → mask 500ms → response |
| **Trial counts & ordering** | How many per condition, block/random | 20 per condition, fully randomized |
| **Teacher charts** | What to aggregate and how | Bar: accuracy by condition; Scatter: individual vs. group mean |

If any are missing, ask before writing code.

---

## Step 1 — Read the existing codebase first

Read these files before writing anything. They are your templates — adapt them, don't
start from scratch.

```
app/page.tsx                              # Homepage EXPERIMENTS + CATEGORIES arrays
app/wordSuperiority/page.tsx              # Landing page pattern
app/wordSuperiority/practice/page.tsx     # Practice page (phase machine, RTL, feedback)
app/wordSuperiority/experiment/page.tsx   # Experiment page (Supabase save, timing)
app/wordSuperiority/thanks/page.tsx       # Thanks/results page
app/bRMS/teacher/page.tsx                 # Teacher dashboard — the GOLD-STANDARD look
lib/word-superiority/stimuli.ts           # Stimuli generation, constants, shuffle
lib/bRMS-emotion/mock-data.ts             # Mock-data generator pattern (seeded)
types/word-superiority.ts                 # Type definition pattern
```

For image-based experiments, also read:
```
app/CompositeFace/experiment/page.tsx     # Image preloading, CSS composite display
lib/composite-face/stimuli.ts             # preloadAllFaces() pattern
```

---

## Step 2 — Files to create

```
types/[slug-kebab].ts                 # TypeScript interfaces (Condition, Trial, TrialResult)
lib/[slug-kebab]/stimuli.ts           # Stimuli generation, timing constants, shuffle
lib/[slug-kebab]/mock-data.ts         # Seeded mock-data generator for the teacher dashboard
app/[slug]/page.tsx                   # Landing page (instructions, name input, begin)
app/[slug]/practice/page.tsx          # Practice trials with per-trial feedback
app/[slug]/experiment/page.tsx        # Main experiment (saves to Supabase)
app/[slug]/thanks/page.tsx            # Individual results summary
app/[slug]/teacher/page.tsx           # Teacher dashboard
supabase/schemas/[slug-kebab].sql     # SQL schema — user runs this in Supabase manually
```

Also **edit** `app/page.tsx` to register the experiment.

Prefer self-contained stimuli (inline **SVG** shapes, generated tones) over binary image
assets when the paradigm allows — it avoids shipping/pathing image files.

---

## Step 3 — Visual and UX conventions (current standard)

### Theme (always use these — this is the bRMS/purple standard the whole site now shares)
- Background: `bg-[#0f172a]` dark slate
- Cards: `bg-gray-900 border border-gray-700 rounded-2xl` (design tokens `bg-card`/`border-border` are also acceptable — they render the same dark card)
- Primary accent: `text-purple-400` / `bg-purple-500` (chrome, icons, primary single-series bars/dots `#a78bfa`)
- Mock-data accent: `amber` (`bg-amber-500/20 border-amber-400 text-amber-400`) — reserved for the Mock Data toggle + "(mock data)" badge
- Muted text: `text-gray-400`
- Stimuli font: `fontFamily: 'monospace'`

### Teacher-dashboard header (match every existing dashboard exactly)
Compact, left-aligned header — **not** a big centered title:
- Left: icon `w-7 h-7 text-purple-400` + `h1 text-2xl` title + a purple counts line underneath (`{n} participants · {m} trials`), with an amber `(mock data)` badge when mock is on.
- Right (in a `flex gap-3 flex-wrap ml-auto` group): **Mock Data** toggle, **Refresh**, **Download CSV**, **Home** — each `px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600`. `ml-auto` keeps them right-aligned when they wrap under a long title.

### Phone-compatible layout
- Experiment/practice pages: `style={{ height: '100dvh' }}` (not `min-h-screen`) — prevents iOS address-bar resize issues
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
- Password gate (same hash as site: `5f63c8759a4968d6e814db98e85f7658554882b44213d85f3a3b15480f47e69f`), via `verifyPassword` from `@/lib/auth`; persist login in `sessionStorage` as `ss_teacher_authed` (the shared key)
- Header per the standard above (Mock Data / Refresh / Download CSV / Home)
- **Mock Data toggle** wired to a seeded `lib/[slug]/mock-data.ts` generator that reproduces the paper's expected effect, so a lecturer can demo with no participants
- Fetch all non-practice rows with **paginated Supabase queries** (see Critical Patterns)
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
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-200">{title}</h3>
        <button
          onClick={() => setRevealed(r => !r)}
          className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-purple-400 hover:text-purple-400 transition-colors"
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
        <YAxis stroke="#9ca3af" domain={[0, 100]} label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
        <Legend verticalAlign="top" />  {/* top prevents overlap with axis labels */}
        {revealed && (
          <Bar dataKey="mean" fill="#a78bfa" name="Accuracy (%)">
            <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
          </Bar>
        )}
      </BarChart>
    </ResponsiveContainer>
  )}
</ChartCard>
```

### Mock-data generator (seeded, faithful to the paper's effect)

```typescript
// lib/[slug]/mock-data.ts — deterministic; must reproduce the expected effect so the
// dashboard renders the textbook result with zero real participants.
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
export function generateMockData(): TrialResult[] { /* per-participant loop, effect baked in */ }
```

### SEM calculation (always per-participant means first)

```typescript
function sem(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}
// Usage: first compute per-participant means, then call sem() on that array.
```

### Scatter diagonal line (for chance or perfect-performance reference)

```tsx
{/* Render as a two-point Scatter series with line prop — NOT a Customized component */}
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
      className="h-full bg-purple-500"
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
useEffect(() => { preloadImages(getAllImageUrls()); }, []);
```

### CSS overlay / composite image display

```tsx
<div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
  <div style={{ position: 'absolute', top: 0, left: 0, width: SIZE, height: TOP_H, overflow: 'hidden' }}>
    <img src={topSrc} style={{ width: SIZE, height: SIZE, objectFit: 'cover', display: 'block' }} />
  </div>
  <div style={{ position: 'absolute', top: TOP_H, left: OFFSET, width: SIZE, height: BOTTOM_H, overflow: 'hidden' }}>
    <img src={bottomSrc} style={{ width: SIZE, height: SIZE, objectFit: 'cover', display: 'block', marginTop: -TOP_H }} />
  </div>
</div>
{/* OFFSET=0 for aligned, >0 for misaligned. Use left:OFFSET, NOT marginLeft (which shifts container width) */}
```

---

## Step 6 — SQL schema template

Create `supabase/schemas/[slug-kebab].sql`:

```sql
CREATE TABLE IF NOT EXISTS [experiment]_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  trial_index      int,
  condition        text,
  -- Add experiment-specific columns (stimulus, response, etc.)
  is_correct       boolean,
  reaction_time_ms int,
  is_practice      boolean default false
);

ALTER TABLE [experiment]_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON [experiment]_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON [experiment]_results FOR SELECT USING (true);
```

Remind the user: **run this SQL in the Supabase SQL editor** before testing data collection.

---

## Step 7 — Register on the homepage

In `app/page.tsx`, add to the `EXPERIMENTS` array:

```typescript
{
  id: '[slug]',
  title: 'Experiment Title',
  titleHe: 'כותרת הניסוי',
  icon: SomeLucideIcon,   // import from 'lucide-react'
  color: 'text-purple-400',
},
```

Add the slug to the matching entry in `CATEGORIES`:

```typescript
{ name: 'MEMORY', nameHe: 'זיכרון', ids: ['drm', '[slug]'] },
```

---

## Step 8 — Finish

1. Verify TypeScript compiles: `npx tsc --noEmit` (from project root) and `npx eslint <files>`
2. `npm run build` to confirm the whole site still builds
3. Commit all new/changed files with a clear message
4. Tell the user: "Run `supabase/schemas/[slug-kebab].sql` in the Supabase SQL editor to create the results table."

---

## Known gotchas (avoid these)

| Symptom | Root cause | Fix |
|---|---|---|
| Brief stimulus never visible | `AnimatePresence mode="wait"` exit eats it | Remove `AnimatePresence` from all timed phases |
| Only 14–15 participants in teacher page | Supabase server 1000-row cap silently overrides `.limit()` | Use `.range(from, from+999)` pagination loop |
| Scatter diagonal invisible | `Customized` component can't access axis scales reliably | Use two-point `<Scatter data={[{x:0,y:0},{x:100,y:100}]} line={...}>` |
| Legend overlaps axis label | Default legend renders below, overlaps content | Add `verticalAlign="top"` to `<Legend>` |
| RTL flex boxes in wrong order | `flexDirection:'row-reverse'` cancelled by ancestor `dir="rtl"` | Use `flexDirection:'row', direction:'rtl'` on the container |
| Images appear out of sync during brief display | Async load during timed window | `preloadImages()` on mount before any trials start |
| Header buttons wrap left under a long title | flex-wrap drops them below-left | Add `ml-auto` to the button group |
| Scatter shows no data | Guard `data.length < 2` blocking single-participant datasets | Change guard to `data.length === 0` |
| CSV download TypeScript error | Union type not assignable to `Record<string,unknown>` | Cast: `r as unknown as Record<string, unknown>` |
