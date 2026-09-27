// What the homepage lists, and therefore what is live for a class.
//
// Shared rather than private to the homepage because it is the answer to "which experiments
// exist" for more than one page: /create's edit list reads it to decide what a lecturer can
// edit. Keeping two copies of that answer is how a ported experiment ends up runnable but
// not editable, or editable but not linked.
//
// `href` is set for experiments built as definitions, which live under /run/{slug} rather
// than having a route of their own. It is also the marker that an experiment has MOVED to
// the definition runtime: anything with one is editable, anything without is still a
// hand-built page.

import type { ElementType } from 'react';
import {
  Beaker, Brain, BrainCog, BarChart2, Shapes, Target, Search, Users, Type,
  Timer, GitFork, List, BookOpen, Lightbulb, Sparkles, Eye,
} from 'lucide-react';

// `href` is set for experiments built as definitions, which all live under /run/{slug}
// rather than having a route of their own. Without it a generated experiment gets a card
// that 404s.
export type Exp = { id: string; title: string; titleHe: string; icon: ElementType; color: string; href?: string };

export const EXPERIMENTS: Exp[] = [
  // Ported. app/summaryStats/ still serves its own rows at /summaryStats/teacher.
  { id: 'summaryStats',    title: 'Ensemble Perception',     titleHe: 'תפיסת מכלול',        icon: BarChart2, color: 'text-orange-400', href: '/run/summaryStats' },
  // Ported. app/CompositeFace/ still serves its own rows at /CompositeFace/teacher.
  { id: 'CompositeFace',   title: 'Composite Face Task',     titleHe: 'משימת פנים מורכבות', icon: Users,     color: 'text-pink-400', href: '/run/CompositeFace' },
  // Ported. app/wordSuperiority/ still serves its own table at /wordSuperiority/teacher.
  { id: 'wordSuperiority', title: 'Word Superiority Effect', titleHe: 'אפקט עליונות המילה', icon: Type,      color: 'text-teal-400', href: '/run/wordSuperiority' },
  // Ported. app/visualSearch/ still serves its own rows at /visualSearch/teacher.
  { id: 'visualSearch',    title: 'Visual Search',           titleHe: 'חיפוש חזותי',        icon: Search,    color: 'text-rose-400', href: '/run/visualSearch' },
  // Ported to the definition runtime. The hand-built pages are still on disk and still
  // serve the 46 rows in posner_results at /posnerCueing/teacher; this card points at the
  // ported one, which is where new runs go.
  { id: 'posnerCueing',    title: 'Spatial Cueing',          titleHe: 'הכוונה מרחבית',      icon: Target,    color: 'text-amber-400', href: '/run/posnerCueing' },
  // Ported. app/bouba-kiki/ still serves its own table at /bouba-kiki/teacher.
  { id: 'bouba-kiki',      title: 'Bouba-Kiki Effect',       titleHe: 'אפקט בובה-קיקי',    icon: Shapes,    color: 'text-indigo-400', href: '/run/bouba-kiki' },
  // Ported. app/stroop/ still serves its own 112 rows at /stroop/teacher; new runs go here.
  { id: 'stroop',          title: 'Stroop Effect',           titleHe: 'אפקט סטרופ',         icon: Brain,     color: 'text-emerald-400', href: '/run/stroop' },
  // Ported. app/mentalRep/ still serves its own rows at /mentalRep/teacher.
  { id: 'mentalRep',       title: 'Mental Representation',   titleHe: 'ייצוג מנטלי',        icon: BrainCog,  color: 'text-cyan-400', href: '/run/mentalRep' },
  // Ported. app/drm/ still serves its own rows at /drm/teacher; new runs go here.
  { id: 'drm',             title: 'Memory (DRM)',             titleHe: 'זיכרון (DRM)',        icon: Beaker,    color: 'text-emerald-400', href: '/run/drm' },
  // Ported. app/srt/ still serves its own rows at /srt/teacher.
  { id: 'srt',             title: 'Serial Reaction Time',   titleHe: 'זמן תגובה סדרתי',    icon: Timer,     color: 'text-lime-400', href: '/run/srt' },
  // Ported. app/twoStepTask/ still serves its own rows at /twoStepTask/teacher.
  { id: 'twoStepTask',     title: 'Two-Step Task',          titleHe: 'משימת שני השלבים',    icon: GitFork,   color: 'text-violet-400', href: '/run/twoStepTask' },
  // Ported. app/serialOrder/ still serves its own rows at /serialOrder/teacher.
  { id: 'serialOrder',     title: 'Serial Position',        titleHe: 'זיכרון סדרתי',        icon: List,      color: 'text-sky-400', href: '/run/serialOrder' },
  // Ported. app/testingEffect/ still serves its own rows at /testingEffect/teacher.
  { id: 'testingEffect',   title: 'Testing Effect',         titleHe: 'אפקט הבחינה',         icon: BookOpen,  color: 'text-blue-400', href: '/run/testingEffect' },
  // Ported. app/logics/ still serves its own rows at /logics/teacher.
  { id: 'logics',          title: 'Reasoning Biases',       titleHe: 'הטיות בחשיבה',         icon: Lightbulb, color: 'text-yellow-400', href: '/run/logics' },
  // Ported. app/creativity/ still serves its own rows at /creativity/teacher.
  { id: 'creativity',      title: 'Creativity Battery',     titleHe: 'סוללת יצירתיות',       icon: Sparkles,  color: 'text-emerald-400', href: '/run/creativity' },
  // Ported. app/bRMS/ still serves its own rows at /bRMS/teacher.
  { id: 'bRMS',             title: 'bRMS Emotion',           titleHe: 'bRMS רגש',              icon: Eye,       color: 'text-purple-400', href: '/run/bRMS' },
  // The card used to point at /run/flankerLetterTask, which exists nowhere — not published,
  // not built in — so it showed students "No experiment named". It now runs the built-in
  // Eriksen flanker; publishing a definition under this slug replaces it.
  { id: 'flanker', title: 'Flanker Letter Identification: Effects of Noise Letters', titleHe: 'משימת זיהוי אות מוקפת ברעש (אפקט הפלנקר)', icon: Shapes, color: 'text-purple-400', href: '/run/flanker' },
  { id: 'lexicalDecisionPairs', title: 'Word Pair Lexical Decision (Yes/No Task)', titleHe: 'משימת החלטה לקסיקלית בזוגות מילים (כן/לא)', icon: Shapes, color: 'text-purple-400', href: '/run/lexicalDecisionPairs' },
];

export const CATEGORIES = [
  { name: 'PERCEPTION',        nameHe: 'תפיסה',         ids: ['summaryStats', 'CompositeFace', 'wordSuperiority'] },
  { name: 'ATTENTION',         nameHe: 'קשב',           ids: ['visualSearch', 'posnerCueing', 'flanker'] },
  // boubaKikiDemo was a /create demo sitting beside the real bouba-kiki in this row, which
  // made it unclear which card was which. Its card is gone; the experiment itself is
  // untouched and still reachable at /boubaKikiDemo and /run/boubaKikiDemo.
  { name: 'LANGUAGE',          nameHe: 'שפה',           ids: ['bouba-kiki', 'lexicalDecisionPairs'] },
  { name: 'EXECUTIVE CONTROL', nameHe: 'בקרה ניהולית', ids: ['stroop'] },
  { name: 'IMAGINATION',       nameHe: 'דמיון',         ids: ['mentalRep'] },
  { name: 'MEMORY',            nameHe: 'זיכרון',        ids: ['drm', 'serialOrder', 'testingEffect'] },
  { name: 'LEARNING',          nameHe: 'למידה',         ids: ['srt', 'twoStepTask'] },
  { name: 'CONSCIOUSNESS',     nameHe: 'תודעה',         ids: ['bRMS'] },
  { name: 'DECISION MAKING',   nameHe: 'קבלת החלטות',  ids: [] },
  { name: 'REASONING',         nameHe: 'חשיבה',         ids: ['logics'] },
  { name: 'CATEGORIZATION',    nameHe: 'קטגוריזציה',   ids: [] },
  { name: 'HUMOR',             nameHe: 'הומור',         ids: [] },
  { name: 'CREATIVITY',        nameHe: 'יצירתיות',     ids: ['creativity'] },
];

/** Slugs that run on the definition runtime — the experiments that have moved to /run. */
export const RUN_SLUGS: string[] = EXPERIMENTS
  .filter(e => e.href?.startsWith('/run/'))
  .map(e => e.href!.slice('/run/'.length));

/**
 * Published experiments deliberately kept off the homepage.
 *
 * A DENY list, where the homepage used to be an allow list. That is the whole change: a
 * published experiment is live at its own URL whether or not it has a card, so the default
 * has to be that it shows — a card missing from the homepage does not protect anyone, it
 * only means the lecturer who made it cannot find it again.
 *
 * These three are abandoned drafts and one /create demo. boubaKikiDemo sat beside the real
 * bouba-kiki in the LANGUAGE row and made it unclear which card was which. They stay
 * runnable at their URLs; `npm run exp:unpublish <slug>` retires one for good, which is the
 * real way to remove an experiment rather than hiding its card.
 */
export const HIDDEN_SLUGS = new Set(['boubaKikiDemo', 'kanizsaWordPrime', 'kanizsaWordPriming']);

/** The shape the homepage needs from a published row. */
export type PublishedCard = { slug: string; title: string; titleHe?: string; category: string };

export type Catalogue = {
  experiments: Exp[];
  categories: { name: string; nameHe: string; ids: string[] }[];
};

/** Anything published that has no curated card yet, so it is findable rather than lost. */
const OTHER = { name: 'OTHER', nameHe: 'נוספים', ids: [] as string[] };

/**
 * The homepage list: the curated catalogue, plus whatever else is published.
 *
 * Publishing from the deployed site writes a database row and nothing else — it cannot add
 * a card, because this file is source and Vercel's filesystem is read-only at runtime. So
 * an experiment published from the live site used to run at its URL and appear nowhere,
 * with the wizard reporting success. Merging the rows in here is what closes that: the
 * catalogue below stays the curated order, and anything published beyond it is appended to
 * the category it declared.
 *
 * Pure, and separate from the page, so the merge can be tested without a browser.
 */
export function catalogue(published: PublishedCard[] = []): Catalogue {
  const curated = new Set(EXPERIMENTS.map(e => e.id));
  const extra = published.filter(p => !curated.has(p.slug) && !HIDDEN_SLUGS.has(p.slug));

  const experiments: Exp[] = [
    ...EXPERIMENTS,
    ...extra.map(p => ({
      id: p.slug,
      title: p.title || p.slug,
      // Falls back to the English title rather than the slug: a lecturer reading a Hebrew
      // page recognises "Working Memory Load", not "wmLoadAssociation".
      titleHe: p.titleHe || p.title || p.slug,
      icon: Shapes,
      color: 'text-purple-400',
      href: `/run/${p.slug}`,
    })),
  ];

  const bucket = (category: string) =>
    CATEGORIES.find(c => c.name.toUpperCase() === category.trim().toUpperCase())?.name ?? OTHER.name;

  const categories = [...CATEGORIES, OTHER].map(cat => ({
    name: cat.name,
    nameHe: cat.nameHe,
    ids: [...cat.ids, ...extra.filter(p => bucket(p.category) === cat.name).map(p => p.slug)],
  }));

  // An empty OTHER row would be a heading with nothing under it on every normal visit.
  return { experiments, categories: categories.filter(c => c.name !== OTHER.name || c.ids.length > 0) };
}
