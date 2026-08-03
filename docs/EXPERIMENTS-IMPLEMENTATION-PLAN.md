# 7 New Cognitive Psychology Experiments - Implementation Plan

**Status:** Ready to implement
**Approach:** Sequential implementation (one experiment at a time)
**Estimated Total Time:** 15-20 hours

---

## Implementation Progress Tracker

### Experiment 1: CRT-Biases ❌ Not Started
- [ ] Create type definitions (`types/crt-biases.ts`)
- [ ] Create utility functions (`lib/crt-biases/questions.ts`)
- [ ] Build intro page (`app/crt-biases/page.tsx`)
- [ ] Build experiment page (`app/crt-biases/experiment/page.tsx`)
- [ ] Build results page (`app/crt-biases/results/page.tsx`)
- [ ] Build teacher dashboard (`app/crt-biases/teacher/page.tsx`)
- [ ] Build thanks page (`app/crt-biases/thanks/page.tsx`)
- [ ] Create Supabase schema (`supabase-crt-biases-schema.sql`)
- [ ] Test locally end-to-end
- [ ] Register on home page (`app/page.tsx`)
- [ ] Push to cloud and verify deployment

### Experiment 2: Free Association ❌ Not Started
- [ ] Create type definitions
- [ ] Create utility functions (cue word list)
- [ ] Build intro page
- [ ] Build experiment page
- [ ] Build results page
- [ ] Build teacher dashboard
- [ ] Build thanks page
- [ ] Create Supabase schema
- [ ] Test locally end-to-end
- [ ] Register on home page
- [ ] Push to cloud and verify deployment

### Experiment 3: Bouba-Kiki ❌ Not Started
- [ ] Create type definitions
- [ ] Create utility functions
- [ ] **Create shape images** (6 rounded + 6 spiky)
- [ ] Build intro page
- [ ] Build experiment page
- [ ] Build results page
- [ ] Build teacher dashboard
- [ ] Build thanks page
- [ ] Create Supabase schema
- [ ] Test locally end-to-end
- [ ] Register on home page
- [ ] Push to cloud and verify deployment

### Experiment 4: Mental Scanning ❌ Not Started
- [ ] Create type definitions
- [ ] Create utility functions (distance calculations)
- [ ] **Create island map image** with 7 landmarks
- [ ] Build intro page
- [ ] Build study phase (map memorization)
- [ ] Build test phase (landmark queries)
- [ ] Build results page
- [ ] Build teacher dashboard
- [ ] Build thanks page
- [ ] Create Supabase schema
- [ ] Test locally end-to-end
- [ ] Register on home page
- [ ] Push to cloud and verify deployment

### Experiment 5: Visual Statistical Learning ❌ Not Started
- [ ] Create type definitions
- [ ] Create utility functions (triplet generation)
- [ ] **Create 12 shape images**
- [ ] Build intro page
- [ ] Build familiarization phase (5 min stream)
- [ ] Build test phase (2AFC)
- [ ] Build results page
- [ ] Build teacher dashboard
- [ ] Build thanks page
- [ ] Create Supabase schema
- [ ] Test locally end-to-end
- [ ] Register on home page
- [ ] Push to cloud and verify deployment

### Experiment 6: Mental Rotation ❌ Not Started
- [ ] Create type definitions
- [ ] Create utility functions
- [ ] **Find/create Shepard-Metzler stimuli** (40 images)
- [ ] Build intro page
- [ ] Build practice phase (5 trials with feedback)
- [ ] Build main experiment (40 trials)
- [ ] Build results page
- [ ] Build teacher dashboard
- [ ] Build thanks page
- [ ] Create Supabase schema
- [ ] Test locally end-to-end
- [ ] Register on home page
- [ ] Push to cloud and verify deployment

### Experiment 7: Serial Reaction Time ❌ Not Started
- [ ] Create type definitions
- [ ] Create utility functions (sequence generation)
- [ ] Build intro page
- [ ] Build experiment page (600 trials, 6 blocks)
- [ ] Build results page
- [ ] Build teacher dashboard
- [ ] Build thanks page
- [ ] Create Supabase schema
- [ ] Test locally end-to-end
- [ ] Register on home page
- [ ] Push to cloud and verify deployment

---

## Quick Reference: Experiment Specifications

### 1. CRT-Biases
- **Route:** `/crt-biases`
- **Color:** `amber`
- **Icon:** `Brain`
- **Structure:** 3 parts (CRT questions, framing scenarios, anchoring)
- **Assets:** None needed (text-based)
- **Key Feature:** Demonstrates cognitive biases and System 1/System 2 thinking

### 2. Free Association
- **Route:** `/free-association`
- **Color:** `violet`
- **Icon:** `Network`
- **Structure:** 60 cue words, text input responses
- **Assets:** None needed (text-based)
- **Key Feature:** Measures associative fluency and RT

### 3. Bouba-Kiki
- **Route:** `/bouba-kiki`
- **Color:** `indigo`
- **Icon:** `Shapes`
- **Structure:** 12 trials (2AFC), 4 control questions
- **Assets:** 12 shape images (6 rounded, 6 spiky)
- **Key Feature:** Cross-modal sound symbolism (text display, no audio)

### 4. Mental Scanning
- **Route:** `/mental-scanning`
- **Color:** `cyan`
- **Icon:** `Map`
- **Structure:** Study phase (30s map), 21 test trials
- **Assets:** 1 island map with 7 landmarks
- **Key Feature:** RT increases linearly with mental distance

### 5. Visual Statistical Learning
- **Route:** `/vsl`
- **Color:** `teal`
- **Icon:** `Eye`
- **Structure:** Familiarization (5 min), test (24 trials 2AFC)
- **Assets:** 12 geometric shapes
- **Key Feature:** Implicit learning of triplet sequences

### 6. Mental Rotation
- **Route:** `/mental-rotation`
- **Color:** `blue`
- **Icon:** `RotateCw`
- **Structure:** Practice (5 trials), main (40 trials)
- **Assets:** 40 Shepard-Metzler 3D figures
- **Key Feature:** RT increases linearly with rotation angle

### 7. Serial Reaction Time
- **Route:** `/srt`
- **Color:** `rose`
- **Icon:** `Zap`
- **Structure:** 6 blocks × 100 trials = 600 total (~8 minutes)
- **Assets:** None needed
- **Key Feature:** Implicit sequence learning (RT decreases over blocks)

---

## File Structure Template

For each experiment (`{exp-name}`):

```
app/{exp-name}/
├── page.tsx              # Intro/consent
├── experiment/page.tsx   # Main trials (or study/test for multi-phase)
├── results/page.tsx      # Individual results + charts
├── teacher/page.tsx      # Teacher dashboard
└── thanks/page.tsx       # Completion

types/{exp-name}.ts       # TypeScript interfaces

lib/{exp-name}/
├── experiment.ts         # Trial generation
└── utils.ts              # Helper functions

public/{exp-name}/        # Assets (if needed)
└── ...images...

supabase-{exp-name}-schema.sql  # Database schema
```

---

## Asset Creation Checklist

### Bouba-Kiki Shapes
- [ ] 6 rounded shapes (smooth, curved, organic)
- [ ] 6 spiky shapes (angular, sharp, jagged)
- Format: PNG, 300×300px, transparent background
- Location: `/public/bouba-kiki/shapes/`

### Mental Scanning Map
- [ ] Island illustration with 7 labeled landmarks
- Landmarks: Hut, Tree, Well, Rock, Lake, Beach, Cave
- Format: PNG, 800×600px
- Location: `/public/mental-scanning/island-map.png`

### VSL Shapes
- [ ] 12 simple geometric shapes (circle, square, triangle, star, etc.)
- Format: PNG, 200×200px, transparent background
- Location: `/public/vsl/shapes/shape_01.png` through `shape_12.png`

### Mental Rotation Figures
- [ ] Find Shepard-Metzler dataset or create simplified versions
- 10 base figures × 4 angles (0°, 60°, 120°, 180°) = 40 images
- Format: PNG, 400×400px
- Location: `/public/mental-rotation/figure{N}_{angle}.png`

---

## Implementation Guidelines

### Starting a New Experiment:
1. Create folder structure in `app/{exp-name}/`
2. Create type definitions in `types/{exp-name}.ts`
3. Create utility functions in `lib/{exp-name}/`
4. Build pages in order: intro → experiment → results → teacher → thanks
5. Create Supabase schema and test locally
6. Register on home page
7. Push to cloud

### Testing Checklist:
- [ ] Intro page loads, session ID generates
- [ ] Experiment runs through all trials
- [ ] Data saves to Supabase correctly
- [ ] Results page calculates stats correctly
- [ ] Charts render properly
- [ ] Teacher dashboard aggregates data
- [ ] Mobile responsive
- [ ] Bilingual text displays correctly (RTL for Hebrew)

### Deployment:
```bash
git add .
git commit -m "Add {exp-name} experiment"
git push
```

Then verify at: `https://cognitives-xi.vercel.app/{exp-name}`

---

## Common Patterns to Reuse

### Session Management:
```typescript
const sessionId = uuidv4();
sessionStorage.setItem('{exp}_session_id', sessionId);
sessionStorage.setItem('{exp}_participant_name', name);
```

### Trial Loop:
```typescript
const [trials, setTrials] = useState<Trial[]>([]);
const [currentIndex, setCurrentIndex] = useState(0);
const [results, setResults] = useState<TrialResult[]>([]);

// Handle response, save to array
// If done: save to Supabase, navigate to results
```

### Supabase Insert:
```typescript
const { error } = await supabase.from('{exp}_results').insert(results);
if (error) console.error('Save failed:', error);
```

### Teacher Dashboard:
```typescript
const { data } = await supabase.from('{exp}_results').select('*');
const uniqueSessions = new Set(data.map(r => r.session_id));
// Aggregate and render charts
```

---

## User Decisions (Applied)

1. ✅ Mental Rotation: Use published Shepard-Metzler stimuli
2. ✅ SRT: Medium length (600 trials, 6 blocks, ~8 minutes)
3. ✅ Implementation: Sequential (one at a time)
4. ✅ Bouba-Kiki: Text display only (no audio)

---

## Next Steps

**To resume work:**
1. Start with CRT-Biases (simplest, text-based)
2. Follow the checklist for that experiment
3. Mark tasks complete as you go
4. Test locally before pushing
5. Move to next experiment

**Current Status:** Ready to begin implementation of Experiment 1 (CRT-Biases)

---

**Last Updated:** 2026-01-30
**Plan File Location:** `C:\Users\amiro\.claude\plans\wondrous-zooming-summit.md`
**Full Plan Location:** `I:\My Drive\code\claudeCode\playin\EXPERIMENTS-IMPLEMENTATION-PLAN.md`
