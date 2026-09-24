// Hand-built experiments, ported to definitions.
//
// round-trips.ts showed the schema could express three live experiments in outline, and
// simplified each to do it. These are meant to REPLACE the hand-built pages, so they match
// them in everything but look: the same trials, practice block, timings, responses,
// feedback, what is saved, the thank-you screen, and the numbers on the dashboard. What
// still differs is listed under `simplifications`, where a lecturer can judge it.
//
// Each port uses the slug of the page it replaces. The hand-built route keeps running at
// /{slug} until the homepage is switched to /run/{slug}; sharing the slug means one lock
// covers both, and nothing else has to be renamed on the day of the switch.
//
// ONE FILE PER EXPERIMENT, under ports/. They were a single file until it reached nine
// hundred lines, at which point it was also the file every port had to be written in — so
// two of them could not be worked on at once without colliding. A port touches its own file
// and this list, and nothing else.

export { POSNER_CUEING } from './ports/posner-cueing';
export { STROOP_PORT } from './ports/stroop';
export { WORD_SUPERIORITY_PORT } from './ports/word-superiority';
export { BOUBA_KIKI_PORT } from './ports/bouba-kiki';
export { DRM_PORT } from './ports/drm';
export { SERIAL_ORDER_PORT } from './ports/serial-order';
export { SRT_PORT } from './ports/srt';
export { COMPOSITE_FACE_PORT } from './ports/composite-face';
export { VISUAL_SEARCH_PORT } from './ports/visual-search';
export { MENTAL_REP_PORT } from './ports/mental-rep';
export { SUMMARY_STATS_PORT } from './ports/summary-stats';
export { LOGICS_PORT } from './ports/logics';
export { CREATIVITY_PORT } from './ports/creativity';

import { POSNER_CUEING } from './ports/posner-cueing';
import { STROOP_PORT } from './ports/stroop';
import { WORD_SUPERIORITY_PORT } from './ports/word-superiority';
import { BOUBA_KIKI_PORT } from './ports/bouba-kiki';
import { DRM_PORT } from './ports/drm';
import { SERIAL_ORDER_PORT } from './ports/serial-order';
import { SRT_PORT } from './ports/srt';
import { COMPOSITE_FACE_PORT } from './ports/composite-face';
import { VISUAL_SEARCH_PORT } from './ports/visual-search';
import { MENTAL_REP_PORT } from './ports/mental-rep';
import { SUMMARY_STATS_PORT } from './ports/summary-stats';
import { LOGICS_PORT } from './ports/logics';
import { CREATIVITY_PORT } from './ports/creativity';

export const PORTS = [POSNER_CUEING, STROOP_PORT, WORD_SUPERIORITY_PORT, BOUBA_KIKI_PORT, DRM_PORT, SERIAL_ORDER_PORT, SRT_PORT, COMPOSITE_FACE_PORT, VISUAL_SEARCH_PORT, MENTAL_REP_PORT, SUMMARY_STATS_PORT, LOGICS_PORT, CREATIVITY_PORT];
