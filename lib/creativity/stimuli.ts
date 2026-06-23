import { AUTObject, RATTriplet } from '@/types/creativity';

export const AUT_OBJECTS: AUTObject[] = [
  { index: 0, nameEn: 'Brick',     nameHe: 'לבנה' },
  { index: 1, nameEn: 'Paperclip', nameHe: 'מהדק נייר' },
  { index: 2, nameEn: 'Newspaper', nameHe: 'עיתון' },
  { index: 3, nameEn: 'Tin can',   nameHe: 'פחית שימורים' },
];

export const AUT_TIME_PER_OBJECT_MS = 1 * 60 * 1000; // 1 minute
export const CIRCLES_TOTAL = 30;
export const CIRCLES_TIME_MS = 4 * 60 * 1000; // 4 minutes
export const RAT_TIME_MS = 5 * 60 * 1000; // 5 minutes

export const RAT_TRIPLETS: RATTriplet[] = [
  { index: 0,  words: ['COTTAGE', 'SWISS', 'CAKE'],        solution: 'CHEESE' },
  { index: 1,  words: ['CREAM', 'SKATE', 'WATER'],         solution: 'ICE' },
  { index: 2,  words: ['LOSER', 'THROAT', 'SPOT'],          solution: 'SORE' },
  { index: 3,  words: ['SHOW', 'LIFE', 'ROW'],              solution: 'BOAT' },
  { index: 4,  words: ['NIGHT', 'WRIST', 'STOP'],           solution: 'WATCH' },
  { index: 5,  words: ['DUCK', 'FOLD', 'DOLLAR'],           solution: 'BILL' },
  { index: 6,  words: ['RIVER', 'NOTE', 'ACCOUNT'],         solution: 'BANK' },
  { index: 7,  words: ['PRINT', 'BERRY', 'BIRD'],           solution: 'BLUE' },
  { index: 8,  words: ['DREAM', 'BREAK', 'LIGHT'],          solution: 'DAY' },
  { index: 9,  words: ['FISH', 'MINE', 'RUSH'],             solution: 'GOLD' },
  { index: 10, words: ['POLITICAL', 'SURPRISE', 'LINE'],    solution: 'PARTY' },
  { index: 11, words: ['MEASURE', 'WORM', 'VIDEO'],         solution: 'TAPE' },
  { index: 12, words: ['FALLING', 'ACTOR', 'DUST'],         solution: 'STAR' },
  { index: 13, words: ['BROKEN', 'CLEAR', 'EYE'],           solution: 'GLASS' },
  { index: 14, words: ['WIDOW', 'BITE', 'MONKEY'],          solution: 'SPIDER' },
];

export const RAT_TRIPLETS_HE: RATTriplet[] = [
  { index: 0,  words: ['חברתי', 'דם', 'סיר'],          solution: 'לחץ' },
  { index: 1,  words: ['מחשב', 'עשן', 'מגע'],          solution: 'מסך' },
  { index: 2,  words: ['שוודי', 'סול', 'בית'],          solution: 'מפתח' },
  { index: 3,  words: ['עבודה', 'כתיבה', 'ערוך'],       solution: 'שולחן' },
  { index: 4,  words: ['בית', 'שחורה', 'שולחן'],        solution: 'עבודה' },
  { index: 5,  words: ['גלגלים', 'חשמלי', 'מלכות'],     solution: 'כיסא' },
  { index: 6,  words: ['הצלה', 'מזלות', 'שיניים'],      solution: 'גלגל' },
  { index: 7,  words: ['לכת', 'נולד', 'ים'],            solution: 'כוכב' },
  { index: 8,  words: ['ים', 'הרע', 'רבים'],            solution: 'לשון' },
  { index: 9,  words: ['תעופה', 'קרב', 'ראייה'],        solution: 'שדה' },
  { index: 10, words: ['שדה', 'מגע', 'דו'],             solution: 'קרב' },
  { index: 11, words: ['ראווה', 'הזדמנויות', 'זמן'],    solution: 'חלון' },
  { index: 12, words: ['הולך', 'שביל', 'פרשת'],         solution: 'דרך' },
  { index: 13, words: ['קצר', 'זיכרון', 'רוח'],         solution: 'טווח' },
  { index: 14, words: ['חתול', 'ספר', 'מזל'],           solution: 'שחור' },
];

export function checkRATAnswer(answer: string, solution: string): boolean {
  const a = answer.trim().toLowerCase();
  const s = solution.toLowerCase();
  if (a === s) return true;
  if (a === s + 's' || a + 's' === s) return true;
  if (a === s + 'es' || a + 'es' === s) return true;
  return false;
}

export function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
