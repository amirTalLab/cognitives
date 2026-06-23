// Mock data for 15 participants to preview teacher dashboard charts

interface MockAUTRow {
  session_id: string; participant_name: string; language: string;
  object_index: number; object_name: string; use_index: number;
  use_text: string; time_in_task_ms: number; is_practice: boolean;
  created_at: string;
}
interface MockCircleRow {
  session_id: string; participant_name: string; language: string;
  circle_index: number; label: string; drawing_data: string;
  response_time_ms: number; time_in_task_ms: number; is_practice: boolean;
  created_at: string;
}
interface MockRATRow {
  session_id: string; participant_name: string; language: string;
  triplet_index: number; triplet_words: string; response: string | null;
  is_correct: boolean; skipped: boolean; response_time_ms: number;
  is_practice: boolean; created_at: string;
}

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai', 'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const OBJECT_USES: Record<string, { common: string[]; rare: string[] }> = {
  Brick: {
    common: ['doorstop', 'weapon', 'hammer', 'building block', 'paperweight', 'bookend', 'step stool', 'decoration', 'anchor', 'grinding surface', 'throw it', 'construction material'],
    rare: ['pillow', 'cheese board', 'musical instrument', 'workout weight', 'phone stand', 'canvas', 'pet rock house', 'ruler', 'ice scraper', 'heat pack', 'table leg', 'measuring unit', 'art piece', 'fish tank decor', 'fence post'],
  },
  Paperclip: {
    common: ['bookmark', 'lock pick', 'earring', 'reset button', 'fish hook', 'scratch tool', 'zipper pull', 'wire', 'paper fastener', 'hook', 'hold things together'],
    rare: ['antenna', 'nose ring', 'sundial hand', 'catapult arm', 'mini sculpture', 'drain unblocker', 'toothpick', 'hair pin', 'needle', 'stylus', 'tension wrench', 'bracelet link', 'spring', 'staple replacement'],
  },
  Newspaper: {
    common: ['wrapping paper', 'hat', 'fire starter', 'fly swatter', 'cleaning windows', 'insulation', 'paper airplane', 'reading material', 'gift wrap', 'packing material', 'umbrella'],
    rare: ['blindfold', 'funnel', 'megaphone', 'kite', 'papier-mache', 'origami', 'shoe insole', 'wallpaper', 'sun visor', 'plate', 'toilet paper', 'rope when twisted', 'mulch', 'cat toy'],
  },
  'Tin can': {
    common: ['pencil holder', 'planter', 'drum', 'cookie cutter', 'candle holder', 'cup', 'phone', 'storage container', 'vase', 'scoop', 'bell'],
    rare: ['robot head', 'telescope', 'crown', 'fishing reel', 'megaphone', 'bird feeder', 'lantern', 'stilt', 'periscope', 'rain gauge', 'antenna', 'wind chime', 'kaleidoscope', 'bowling pin'],
  },
};

const CIRCLE_LABELS: { common: string[]; rare: string[] } = {
  common: ['sun', 'face', 'clock', 'ball', 'wheel', 'eye', 'pizza', 'moon', 'smiley', 'earth', 'orange', 'donut', 'coin', 'button', 'plate', 'tire', 'ring', 'CD', 'cookie', 'snowman'],
  rare: ['portal', 'atom', 'cyclops', 'vinyl record', 'gong', 'compass', 'petri dish', 'disco ball', 'mandala', 'hamster wheel', 'dream catcher', 'eyeball', 'pomegranate', 'bubble', 'dartboard', 'magnifying glass', 'yoyo', 'pancake', 'steering wheel', 'bagel', 'lollipop', 'peace sign', 'yin yang', 'olympic ring', 'hula hoop', 'oreo', 'emoji', 'radar', 'life saver'],
};

const RAT_SOLUTIONS = ['לחץ', 'מסך', 'מפתח', 'שולחן', 'עבודה', 'כיסא', 'גלגל', 'כוכב', 'לשון', 'שדה', 'קרב', 'חלון', 'דרך', 'טווח', 'שחור'];
const RAT_WORDS = [
  'חברתי / דם / סיר', 'מחשב / עשן / מגע', 'שוודי / סול / בית',
  'עבודה / כתיבה / ערוך', 'בית / שחורה / שולחן', 'גלגלים / חשמלי / מלכות',
  'הצלה / מזלות / שיניים', 'לכת / נולד / ים', 'ים / הרע / רבים',
  'תעופה / קרב / ראייה', 'שדה / מגע / דו', 'ראווה / הזדמנויות / זמן',
  'הולך / שביל / פרשת', 'קצר / זיכרון / רוח', 'חתול / ספר / מזל',
];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

function pick<T>(arr: T[], count: number, rng: () => number): T[] {
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function mockCircleSvg(label: string): string {
  const safe = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1e293b"/><circle cx="100" cy="100" r="94" fill="none" stroke="#475569" stroke-width="2"/><text x="100" y="108" text-anchor="middle" fill="#cbd5e1" font-size="14" font-family="sans-serif">${safe}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function generateMockData() {
  const autRows: MockAUTRow[] = [];
  const circleRows: MockCircleRow[] = [];
  const ratRows: MockRATRow[] = [];

  const objects = [
    { index: 0, name: 'Brick' },
    { index: 1, name: 'Paperclip' },
    { index: 2, name: 'Newspaper' },
    { index: 3, name: 'Tin can' },
  ];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 42);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];

    // AUT: 5–14 uses per object
    for (const obj of objects) {
      const pool = OBJECT_USES[obj.name];
      const numCommon = 3 + Math.floor(rng() * 5);
      const numRare = Math.floor(rng() * 4);
      const uses = [
        ...pick(pool.common, numCommon, rng),
        ...pick(pool.rare, numRare, rng),
      ];
      uses.forEach((use, i) => {
        autRows.push({
          session_id: sid, participant_name: name, language: 'he',
          object_index: obj.index, object_name: obj.name,
          use_index: i, use_text: use,
          time_in_task_ms: Math.floor(10000 + rng() * 110000),
          is_practice: false, created_at: '2026-06-20T10:00:00Z',
        });
      });
    }

    // Circles: 8–25 completed
    const numCircles = 8 + Math.floor(rng() * 18);
    const numCommonLabels = Math.floor(numCircles * 0.6);
    const numRareLabels = numCircles - numCommonLabels;
    const labels = [
      ...pick(CIRCLE_LABELS.common, numCommonLabels, rng),
      ...pick(CIRCLE_LABELS.rare, numRareLabels, rng),
    ];
    labels.forEach((label, i) => {
      circleRows.push({
        session_id: sid, participant_name: name, language: 'he',
        circle_index: i, label,
        drawing_data: mockCircleSvg(label),
        response_time_ms: Math.floor(3000 + rng() * 15000),
        time_in_task_ms: Math.floor(i * 15000 + rng() * 10000),
        is_practice: false, created_at: '2026-06-20T10:00:00Z',
      });
    });

    // RAT: attempt all 15, solve 3–12
    const solveChance = 0.25 + rng() * 0.55;
    for (let t = 0; t < 15; t++) {
      const skipped = rng() < 0.12;
      const solved = !skipped && rng() < solveChance;
      ratRows.push({
        session_id: sid, participant_name: name, language: 'he',
        triplet_index: t, triplet_words: RAT_WORDS[t],
        response: skipped ? null : (solved ? RAT_SOLUTIONS[t] : 'wrong'),
        is_correct: solved, skipped,
        response_time_ms: Math.floor(4000 + rng() * 25000),
        is_practice: false, created_at: '2026-06-20T10:00:00Z',
      });
    }
  }

  return { autRows, circleRows, ratRows };
}
