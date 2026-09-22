// Word-superiority stimuli, extracted verbatim from lib/word-superiority/stimuli.ts.
//
// A copy rather than an import: that module pulls its types through the "@/" alias, which
// Node cannot resolve when the offline suites load these files directly. Produced by
// script and never retyped — a transposed Hebrew letter here would be invisible and wrong.
//
// Each pair differs at index 2: the third letter, which is third from the right when the
// word is read RTL.

export interface WsPair { letter1: string; letter2: string; word1: string; word2: string; }

export const WS_WORD_PAIRS: WsPair[] = [
  { letter1: 'ד', letter2: 'ר', word1: 'אחד', word2: 'אחר' },
  { letter1: 'ד', letter2: 'ר', word1: 'כבד', word2: 'כבר' },
  { letter1: 'ד', letter2: 'ר', word1: 'עוד', word2: 'עור' },
  { letter1: 'ד', letter2: 'ר', word1: 'עבד', word2: 'עבר' },
  { letter1: 'ח', letter2: 'ה', word1: 'לוח', word2: 'לוה' },
  { letter1: 'ח', letter2: 'ה', word1: 'פרח', word2: 'פרה' },
  { letter1: 'ח', letter2: 'ה', word1: 'נוח', word2: 'נוה' },
  { letter1: 'ב', letter2: 'ך', word1: 'ערב', word2: 'ערך' },
  { letter1: 'ב', letter2: 'ך', word1: 'חשב', word2: 'חשך' },
  { letter1: 'ת', letter2: 'ח', word1: 'שבת', word2: 'שבח' },
  { letter1: 'ר', letter2: 'ק', word1: 'ספר', word2: 'ספק' },
  { letter1: 'ג', letter2: 'ז', word1: 'ארג', word2: 'ארז' },
  { letter1: 'ר', letter2: 'נ', word1: 'מורה', word2: 'מונה' },
  { letter1: 'ת', letter2: 'נ', word1: 'כיתה', word2: 'כינה' },
  { letter1: 'ט', letter2: 'ד', word1: 'חיטה', word2: 'חידה' },
  { letter1: 'ט', letter2: 'ל', word1: 'מיטה', word2: 'מילה' },
  { letter1: 'ב', letter2: 'ל', word1: 'חובה', word2: 'חולה' },
  { letter1: 'ר', letter2: 'פ', word1: 'קורה', word2: 'קופה' },
  { letter1: 'מ', letter2: 'כ', word1: 'שומר', word2: 'שוכר' },
  { letter1: 'מ', letter2: 'ח', word1: 'דומה', word2: 'דוחה' },
  { letter1: 'מ', letter2: 'נ', word1: 'קומה', word2: 'קונה' },
  { letter1: 'ט', letter2: 'ח', word1: 'שיטה', word2: 'שיחה' },
  { letter1: 'נ', letter2: 'ד', word1: 'צינה', word2: 'צידה' },
  { letter1: 'ר', letter2: 'נ', word1: 'שורה', word2: 'שונה' },
];

export const WS_NONWORD_PAIRS: WsPair[] = [
  { letter1: 'ד', letter2: 'ר', word1: 'כודג', word2: 'כורג' },
  { letter1: 'ד', letter2: 'ר', word1: 'תידצ', word2: 'תירצ' },
  { letter1: 'ד', letter2: 'ר', word1: 'לודט', word2: 'לורט' },
  { letter1: 'ד', letter2: 'ר', word1: 'נידג', word2: 'נירג' },
  { letter1: 'ח', letter2: 'ה', word1: 'פוחס', word2: 'פוהס' },
  { letter1: 'ח', letter2: 'ה', word1: 'זיחג', word2: 'זיהג' },
  { letter1: 'ח', letter2: 'ה', word1: 'תוחק', word2: 'תוהק' },
  { letter1: 'ב', letter2: 'ך', word1: 'זולב', word2: 'זולך' },
  { letter1: 'ב', letter2: 'ך', word1: 'תירב', word2: 'תירך' },
  { letter1: 'ת', letter2: 'ח', word1: 'כיתג', word2: 'כיחג' },
  { letter1: 'ר', letter2: 'ק', word1: 'נירג', word2: 'ניקג' },
  { letter1: 'ג', letter2: 'ז', word1: 'תוגק', word2: 'תוזק' },
  { letter1: 'ר', letter2: 'נ', word1: 'טורק', word2: 'טונק' },
  { letter1: 'ת', letter2: 'נ', word1: 'ליתג', word2: 'לינג' },
  { letter1: 'ט', letter2: 'ד', word1: 'זיטק', word2: 'זידק' },
  { letter1: 'ט', letter2: 'ל', word1: 'ריטג', word2: 'רילג' },
  { letter1: 'ב', letter2: 'ל', word1: 'זובק', word2: 'זולק' },
  { letter1: 'ר', letter2: 'פ', word1: 'לורג', word2: 'לופג' },
  { letter1: 'מ', letter2: 'כ', word1: 'גומש', word2: 'גוכש' },
  { letter1: 'מ', letter2: 'ח', word1: 'תומק', word2: 'תוחק' },
  { letter1: 'מ', letter2: 'נ', word1: 'פומג', word2: 'פונג' },
  { letter1: 'ט', letter2: 'ח', word1: 'ניטס', word2: 'ניחס' },
  { letter1: 'נ', letter2: 'ד', word1: 'לינג', word2: 'לידג' },
  { letter1: 'ר', letter2: 'נ', word1: 'פורק', word2: 'פונק' },
];
