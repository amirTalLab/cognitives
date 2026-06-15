import { QuestionDef, QuestionUnit, AnchoringBlock, Group } from '@/types/logics';

// ── Availability (Set 1) — all SHARED ────────────────────────────────────────

const Q_A1: QuestionDef = {
  code: 'Q-A1',
  type: 'multiple-choice',
  split: false,
  text: {
    en: 'From a group of 10 people: are there more ways to form a committee of 2 people, or a committee of 8 people?',
    he: 'מתוך קבוצה של 10 אנשים: האם יש יותר דרכים לבחור ועדה של 2 אנשים, או ועדה של 8 אנשים?',
  },
  options: [
    { en: 'More committees of 2', he: 'יותר ועדות של 2', value: 'more-2' },
    { en: 'More committees of 8', he: 'יותר ועדות של 8', value: 'more-8' },
    { en: 'Exactly the same number', he: 'בדיוק אותו מספר', value: 'same' },
  ],
};

const Q_A2: QuestionDef = {
  code: 'Q-A2',
  type: 'multiple-choice',
  split: false,
  text: {
    en: 'What causes more deaths per year — murder or suicide?',
    he: 'מה גורם ליותר מקרי מוות בשנה — רצח או התאבדות?',
  },
  options: [
    { en: 'Murder', he: 'רצח', value: 'murder' },
    { en: 'Suicide', he: 'התאבדות', value: 'suicide' },
  ],
};

const Q_A3: QuestionDef = {
  code: 'Q-A3',
  type: 'multiple-choice',
  split: false,
  text: {
    en: 'What kills more people per year — dog attacks or shark attacks?',
    he: 'מה גורם ליותר מקרי מוות בשנה — תקיפות של כלבים או תקיפות של כרישים?',
  },
  options: [
    { en: 'Dog attacks', he: 'תקיפות של כלבים', value: 'dogs' },
    { en: 'Shark attacks', he: 'תקיפות של כרישים', value: 'sharks' },
  ],
};

const Q_A4: QuestionDef = {
  code: 'Q-A4',
  type: 'multiple-choice',
  split: false,
  text: {
    en: 'In English text: are there more words that START with the letter K, or words with K as their THIRD letter?',
    he: 'באנגלית: האם יש יותר מילים שמתחילות באות K, או מילים שבהן K היא האות השלישית?',
  },
  options: [
    { en: 'Start with K', he: 'מתחילות ב-K', value: 'start-k' },
    { en: 'K is the third letter', he: 'K היא האות השלישית', value: 'third-k' },
  ],
};

// ── Representativeness (Set 2) — all SHARED ──────────────────────────────────

const Q_R1: QuestionDef = {
  code: 'Q-R1',
  type: 'multiple-choice',
  split: false,
  text: {
    en: 'A fair coin is flipped 6 times (H = heads, T = tails). Which sequence of results is MORE likely to occur?\n\n1) H-T-H-T-T-H\n2) H-H-H-T-T-T\n3) Both equally likely',
    he: 'מטילים מטבע הוגן 6 פעמים (ע=עץ, פ=פלי). איזו סדרת תוצאות סבירה יותר להופיע?\n\n1) ע-פ-ע-פ-פ-ע\n2) ע-ע-ע-פ-פ-פ\n3) שתי הסדרות סבירות באותה מידה',
  },
  options: [
    { en: 'Sequence 1 (the mixed-looking one)', he: 'סדרה 1 (הסדרה המעורבת)', value: 'mixed' },
    { en: 'Sequence 2 (the blocky one)', he: 'סדרה 2 (הסדרה המקובצת)', value: 'blocky' },
    { en: 'Both equally likely', he: 'שתיהן סבירות באותה מידה', value: 'equal' },
  ],
};

const Q_R2: QuestionDef = {
  code: 'Q-R2',
  type: 'multiple-choice',
  split: false,
  text: {
    en: 'Linda is 31, single, outspoken and very bright. She majored in philosophy. As a student she was deeply concerned with discrimination and social justice, and joined anti-nuclear demonstrations.\n\nWhich is more probable?',
    he: 'לינדה בת 31, רווקה, חדה וכנה מאוד. בתואר הראשון למדה פילוסופיה. כסטודנטית עסקה רבות בנושאי אפליה וצדק חברתי, והשתתפה בהפגנות נגד נשק גרעיני.\n\nמה סביר יותר?',
  },
  options: [
    { en: 'Linda is a bank teller', he: 'לינדה היא פקידת בנק', value: 'teller' },
    { en: 'Linda is a bank teller and is active in the feminist movement', he: 'לינדה היא פקידת בנק ופעילה בתנועה הפמיניסטית', value: 'teller-feminist' },
  ],
};

const Q_R3: QuestionDef = {
  code: 'Q-R3',
  type: 'multiple-choice',
  split: false,
  text: {
    en: 'A fair coin has landed on HEADS 5 times in a row. On the next flip, what is more likely?',
    he: 'מטבע הוגן נחת על "עץ" 5 פעמים ברציפות. בהטלה הבאה, מה סביר יותר?',
  },
  options: [
    { en: 'Heads', he: 'עץ', value: 'heads' },
    { en: 'Tails', he: 'פלי', value: 'tails' },
    { en: 'Both equally likely', he: 'שתיהן סבירות באותה מידה', value: 'equal' },
  ],
};

// ── Confirmation (Set 3) ─────────────────────────────────────────────────────

const Q_WASON_A: QuestionDef = {
  code: 'Q-WASON-A',
  type: 'multi-select',
  split: false,
  text: {
    en: 'Four cards are on the table. Each has a number on one side and a letter on the other.\n\nThe cards show:  E   K   4   7\n\nThe rule: "If a card has a vowel (like E) on one side, then it has an even number on the other side."\n\nWhich card(s) — and only those — must you turn over to test whether the rule holds?',
    he: 'ארבעה קלפים מונחים על השולחן. לכל קלף מספר בצד אחד ואות בצד השני.\n\nהקלפים מראים:  E   K   4   7\n\nהכלל: "אם לקלף יש תנועה (אות כמו E) בצד אחד, אז יש לו מספר זוגי בצד השני."\n\nאילו קלפים (ורק הם) יש להפוך כדי לבדוק אם הכלל נכון?',
  },
  multiSelectNote: { en: '(select all that apply)', he: '(ניתן לבחור יותר מאחד)' },
  options: [
    { en: 'E', he: 'E', value: 'E' },
    { en: 'K', he: 'K', value: 'K' },
    { en: '4', he: '4', value: '4' },
    { en: '7', he: '7', value: '7' },
  ],
};

const Q_WASON_B: QuestionDef = {
  code: 'Q-WASON-B',
  type: 'multi-select',
  split: false,
  text: {
    en: 'You are a bar inspector making sure no one under 18 is drinking alcohol. You enter a bar and see four people:\n\n• One is drinking beer\n• Another is drinking cola\n• One you know is 22 years old but you cannot see what they are drinking\n• One you know is 16 years old but you cannot see what they are drinking\n\nWhich people will you approach and check?',
    he: 'אתם פקחים בבר ועליכם לוודא שאיש מתחת לגיל 18 אינו שותה אלכוהול. אתם נכנסים לבר ורואים ארבעה אנשים:\n\n• אחד שותה בירה\n• אחר שותה קולה\n• אחד ידוע לכם שהוא בן 22 אך אינכם רואים מה הוא שותה\n• אחד ידוע לכם שהוא בן 16 אך אינכם רואים מה הוא שותה\n\nלאילו אנשים תיגשו לבדוק?',
  },
  multiSelectNote: { en: '(select all that apply)', he: '(ניתן לבחור יותר מאחד)' },
  options: [
    { en: 'The person drinking beer', he: 'האדם ששותה בירה', value: 'beer' },
    { en: 'The person drinking cola', he: 'האדם ששותה קולה', value: 'cola' },
    { en: 'The 22-year-old', he: 'בן ה-22', value: '22yo' },
    { en: 'The 16-year-old', he: 'בן ה-16', value: '16yo' },
  ],
};

const Q_RULE: QuestionDef = {
  code: 'Q-RULE',
  type: 'interactive-rule',
  split: false,
  text: {
    en: 'I have a rule in mind that applies to sequences of three numbers. The sequence 2–4–6 fits the rule.\n\nTo discover the rule, propose your own three-number sequences and I will tell you whether each one fits.\n\nWhen you are confident, state the rule.',
    he: 'חשבתי על כלל שחל על סדרות של שלושה מספרים. הסדרה 2–4–6 תואמת את הכלל.\n\nכדי לגלות את הכלל, הציעו סדרות משלכם של שלושה מספרים ואומר לכל אחת אם היא תואמת.\n\nכשתהיו בטוחים — נסחו את הכלל.',
  },
};

// ── Anchoring (Set 4) — all SPLIT, two-part blocks ──────────────────────────

const ANCH_1: AnchoringBlock = {
  code: 'Q-ANCH-1',
  screen1: {
    code: 'Q-ANCH-1-s1',
    type: 'higher-lower',
    split: true,
    textA: {
      en: 'Is the population of Turkey higher or lower than 20 million?',
      he: 'האם אוכלוסיית טורקיה גדולה או קטנה מ-20 מיליון?',
    },
    textB: {
      en: 'Is the population of Turkey higher or lower than 100 million?',
      he: 'האם אוכלוסיית טורקיה גדולה או קטנה מ-100 מיליון?',
    },
    options: [
      { en: 'Higher', he: 'גדולה יותר', value: 'higher' },
      { en: 'Lower', he: 'קטנה יותר', value: 'lower' },
    ],
  },
  screen2: {
    code: 'Q-ANCH-1-s2',
    type: 'free-number',
    split: false,
    text: {
      en: 'What is the size of the population, in your estimate?',
      he: 'מה גודל האוכלוסייה, להערכתך?',
    },
    unit: { en: 'millions', he: 'מיליונים' },
  },
};

const ANCH_2: AnchoringBlock = {
  code: 'Q-ANCH-2',
  screen1: {
    code: 'Q-ANCH-2-s1',
    type: 'higher-lower',
    split: true,
    textA: {
      en: 'Is the percentage of African countries that are UN members higher or lower than 10%?',
      he: 'האם אחוז מדינות אפריקה שחברות באו"ם גדול או קטן מ-10%?',
    },
    textB: {
      en: 'Is the percentage of African countries that are UN members higher or lower than 65%?',
      he: 'האם אחוז מדינות אפריקה שחברות באו"ם גדול או קטן מ-65%?',
    },
    options: [
      { en: 'Higher', he: 'גדול יותר', value: 'higher' },
      { en: 'Lower', he: 'קטן יותר', value: 'lower' },
    ],
  },
  screen2: {
    code: 'Q-ANCH-2-s2',
    type: 'free-number',
    split: false,
    text: {
      en: 'What is the percentage, in your estimate?',
      he: 'מהו האחוז, להערכתך?',
    },
    unit: { en: '%', he: '%' },
  },
};

const ANCH_3: AnchoringBlock = {
  code: 'Q-ANCH-3',
  screen1: {
    code: 'Q-ANCH-3-s1',
    type: 'multiplication-estimate',
    split: true,
    textA: {
      en: 'Quickly estimate (no calculating!) the result of:\n\n1 × 2 × 3 × 4 × 5 × 6 × 7 × 8',
      he: 'העריכו במהירות (ללא חישוב!) את התוצאה של:\n\n1 × 2 × 3 × 4 × 5 × 6 × 7 × 8',
    },
    textB: {
      en: 'Quickly estimate (no calculating!) the result of:\n\n8 × 7 × 6 × 5 × 4 × 3 × 2 × 1',
      he: 'העריכו במהירות (ללא חישוב!) את התוצאה של:\n\n8 × 7 × 6 × 5 × 4 × 3 × 2 × 1',
    },
  },
  screen2: {
    code: 'Q-ANCH-3-s2',
    type: 'free-number',
    split: false,
    text: {
      en: 'Enter your estimate:',
      he: 'הזינו את ההערכה שלכם:',
    },
    unit: { en: '', he: '' },
  },
};

// ── Framing (Set 5) — all SPLIT ─────────────────────────────────────────────

const Q_FRAME_1: QuestionDef = {
  code: 'Q-FRAME-1',
  type: 'likert',
  split: true,
  textA: {
    en: 'A medical treatment has a 90% survival rate. How willing would you be to undergo it?',
    he: 'לטיפול רפואי יש שיעור הישרדות של 90%. עד כמה תהיו מוכנים לעבור אותו?',
  },
  textB: {
    en: 'A medical treatment has a 10% mortality rate. How willing would you be to undergo it?',
    he: 'לטיפול רפואי יש שיעור תמותה של 10%. עד כמה תהיו מוכנים לעבור אותו?',
  },
  likertRange: 5,
  likertMin: { en: 'Not at all willing', he: 'כלל לא מוכן' },
  likertMax: { en: 'Very willing', he: 'מוכן מאוד' },
};

const Q_FRAME_2: QuestionDef = {
  code: 'Q-FRAME-2',
  type: 'multiple-choice',
  split: true,
  textA: {
    en: 'A disease outbreak is expected to kill 600 people. Two programs are proposed:\n\nProgram 1 — 200 people will be saved for certain.\nProgram 2 — a 1/3 chance that 600 are saved and a 2/3 chance that no one is saved.\n\nWhich program do you prefer?',
    he: 'מתפרצת מחלה שצפויה להרוג 600 אנשים. מוצעות שתי תוכניות:\n\nתוכנית 1 — 200 אנשים יינצלו בוודאות.\nתוכנית 2 — סיכוי של שליש ש-600 יינצלו, וסיכוי של שני שליש שאיש לא יינצל.\n\nאיזו תוכנית אתם מעדיפים?',
  },
  textB: {
    en: 'A disease outbreak is expected to kill 600 people. Two programs are proposed:\n\nProgram 1 — 400 people will die for certain.\nProgram 2 — a 1/3 chance that no one dies and a 2/3 chance that 600 die.\n\nWhich program do you prefer?',
    he: 'מתפרצת מחלה שצפויה להרוג 600 אנשים. מוצעות שתי תוכניות:\n\nתוכנית 1 — 400 אנשים ימותו בוודאות.\nתוכנית 2 — סיכוי של שליש שאיש לא ימות, וסיכוי של שני שליש ש-600 ימותו.\n\nאיזו תוכנית אתם מעדיפים?',
  },
  options: [
    { en: 'Program 1 (certain)', he: 'תוכנית 1 (ודאית)', value: 'certain' },
    { en: 'Program 2 (gamble)', he: 'תוכנית 2 (הימור)', value: 'gamble' },
  ],
};

const Q_FRAME_3: QuestionDef = {
  code: 'Q-FRAME-3',
  type: 'likert',
  split: true,
  textA: {
    en: 'On the exam, most students passed. How well do you think the class did?',
    he: 'במבחן, רוב הסטודנטים עברו. עד כמה הכיתה הצליחה לדעתך?',
  },
  textB: {
    en: 'On the exam, some students failed. How well do you think the class did?',
    he: 'במבחן, חלק מהסטודנטים נכשלו. עד כמה הכיתה הצליחה לדעתך?',
  },
  likertRange: 5,
  likertMin: { en: 'Did poorly', he: 'הצליחה גרוע' },
  likertMax: { en: 'Did very well', he: 'הצליחה מצוין' },
};

const Q_FRAME_4: QuestionDef = {
  code: 'Q-FRAME-4',
  type: 'likert',
  split: true,
  textA: {
    en: 'The state gives a tax break to married couples. How fair does this policy seem?',
    he: 'המדינה מעניקה הקלת מס לזוגות נשואים. עד כמה המדיניות הוגנת בעיניכם?',
  },
  textB: {
    en: 'The state imposes an extra tax on single people. How fair does this policy seem?',
    he: 'המדינה מטילה מס נוסף על רווקים. עד כמה המדיניות הוגנת בעיניכם?',
  },
  likertRange: 5,
  likertMin: { en: 'Very unfair', he: 'לא הוגן בכלל' },
  likertMax: { en: 'Very fair', he: 'הוגן מאוד' },
};

// ── CRT (Set 6) — all SHARED, free-number entry ────────────────────────────

const Q_CRT_1: QuestionDef = {
  code: 'Q-CRT-1',
  type: 'free-number',
  split: false,
  text: {
    en: 'A bat and a ball cost ₪10.10 together. The bat costs ₪10 more than the ball.\n\nHow many agorot does the ball cost?',
    he: 'מחבט וכדור עולים יחד 10 שקלים ו-10 אגורות. המחבט עולה 10 שקלים יותר מהכדור.\n\nכמה אגורות עולה הכדור?',
  },
  unit: { en: 'agorot', he: 'אגורות' },
};

const Q_CRT_2: QuestionDef = {
  code: 'Q-CRT-2',
  type: 'free-number',
  split: false,
  text: {
    en: 'If 5 machines take 5 minutes to make 5 products, how long do 100 machines take to make 100 products?',
    he: 'אם ל-5 מכונות לוקח 5 דקות להכין 5 מוצרים, כמה זמן ייקח ל-100 מכונות להכין 100 מוצרים?',
  },
  unit: { en: 'minutes', he: 'דקות' },
};

const Q_CRT_3: QuestionDef = {
  code: 'Q-CRT-3',
  type: 'free-number',
  split: false,
  text: {
    en: 'A patch of grass doubles in area every day. It takes 48 days to cover the whole garden.\n\nHow many days to cover HALF the garden?',
    he: 'משטח דשא מכפיל את שטחו בכל יום. לוקח 48 יום לכסות את כל הגינה.\n\nכמה ימים ייקח לכסות חצי מהגינה?',
  },
  unit: { en: 'days', he: 'ימים' },
};

const Q_CRT_4: QuestionDef = {
  code: 'Q-CRT-4',
  type: 'free-number',
  split: false,
  text: {
    en: 'If you are in a race and you pass the person in second place, what place are you in?',
    he: 'אם אתם במירוץ ואתם עוקפים את האדם במקום השני, באיזה מקום אתם?',
  },
  unit: { en: '', he: '' },
};

const Q_CRT_5: QuestionDef = {
  code: 'Q-CRT-5',
  type: 'free-number',
  split: false,
  text: {
    en: 'A farmer had 15 sheep and all but 8 died. How many are left?',
    he: 'לחקלאי היו 15 כבשים וכולן פרט ל-8 מתו. כמה נותרו?',
  },
  unit: { en: '', he: '' },
};

const Q_CRT_6: QuestionDef = {
  code: 'Q-CRT-6',
  type: 'free-number',
  split: false,
  text: {
    en: 'There are 5 white and 5 black socks in a drawer. The room is dark.\n\nWhat is the least number of socks to pull out to be sure of a matching pair?',
    he: 'יש 5 גרביים לבנות ו-5 שחורות במגירה. החדר חשוך.\n\nכמה גרביים לכל הפחות צריך להוציא כדי להיות בטוח בזוג תואם?',
  },
  unit: { en: '', he: '' },
};

// ── Build question units for randomization ──────────────────────────────────

const SINGLE_QUESTIONS: QuestionDef[] = [
  Q_A1, Q_A2, Q_A3, Q_A4,
  Q_R1, Q_R2, Q_R3,
  Q_WASON_A, Q_WASON_B,
  Q_FRAME_1, Q_FRAME_2, Q_FRAME_3, Q_FRAME_4,
  Q_CRT_1, Q_CRT_2, Q_CRT_3, Q_CRT_4, Q_CRT_5, Q_CRT_6,
];

const ANCHORING_BLOCKS: AnchoringBlock[] = [ANCH_1, ANCH_2, ANCH_3];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildQuestionSequence(): QuestionUnit[] {
  const units: QuestionUnit[] = [];

  for (const q of SINGLE_QUESTIONS) {
    if (q.type === 'interactive-rule') {
      units.push({ type: 'interactive-rule', question: q });
    } else {
      units.push({ type: 'single', question: q });
    }
  }

  units.push({ type: 'interactive-rule', question: Q_RULE });

  for (const block of ANCHORING_BLOCKS) {
    if (block.code === 'Q-ANCH-3') {
      units.push({ type: 'multiplication-block', block });
    } else {
      units.push({ type: 'anchoring-block', block });
    }
  }

  return shuffle(units);
}

export function getQuestionText(q: QuestionDef, group: Group, lang: 'en' | 'he'): string {
  if (q.split && q.textA && q.textB) {
    return group === 'A' ? q.textA[lang] : q.textB[lang];
  }
  return q.text?.[lang] ?? '';
}

export function assignGroup(): Group {
  return Math.random() < 0.5 ? 'A' : 'B';
}

export function checkRuleFits(a: number, b: number, c: number): boolean {
  return a < b && b < c;
}

export { Q_RULE, ANCHORING_BLOCKS, SINGLE_QUESTIONS };

export const ALL_QUESTION_CODES = [
  'Q-A1', 'Q-A2', 'Q-A3', 'Q-A4',
  'Q-R1', 'Q-R2', 'Q-R3',
  'Q-WASON-A', 'Q-WASON-B', 'Q-RULE',
  'Q-ANCH-1-s1', 'Q-ANCH-1-s2',
  'Q-ANCH-2-s1', 'Q-ANCH-2-s2',
  'Q-ANCH-3-s1', 'Q-ANCH-3-s2',
  'Q-FRAME-1', 'Q-FRAME-2', 'Q-FRAME-3', 'Q-FRAME-4',
  'Q-CRT-1', 'Q-CRT-2', 'Q-CRT-3', 'Q-CRT-4', 'Q-CRT-5', 'Q-CRT-6',
];
