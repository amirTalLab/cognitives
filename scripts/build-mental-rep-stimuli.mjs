// Builds the mental-representation stimuli from the hand-built originals.
//
//   node scripts/build-mental-rep-stimuli.mjs
//
// Writes:
//   public/mental-rep/figure_<n>_<angle>[_m].svg   64 block figures
//   public/mental-rep/island-map-<lang>.svg         2 maps
//   lib/experiment-runtime/stimuli/mental-rep-stimuli.ts
//
// The geometry is PORTED, not redrawn. Every number here comes from
// components/mental-rep/BlockFigure.tsx, components/mental-rep/IslandMap.tsx and
// lib/mental-rep/{rotation,scanning}.ts, because a figure redrawn by eye would be a
// different stimulus wearing the same name — and mental rotation is a paradigm where the
// exact shape of the object is the independent variable.
//
// The runtime shows stimuli declaratively (`{ kind: 'image', src }`), so what the React
// components drew at run time has to exist as files. Flattening them here rather than
// teaching the runtime to draw isometric cubes is deliberate: a display kind that could
// render Shepard-Metzler figures would be a display kind only this experiment could use.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_SVG = join(ROOT, 'public', 'mental-rep');
mkdirSync(OUT_SVG, { recursive: true });

// ─── Block figures (components/mental-rep/BlockFigure.tsx) ────────────────────

const FIGURE_CONFIGS = {
  figure_1: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 1, 1], [2, 1, 2]],
  figure_2: [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 2, 0], [1, 2, 1], [2, 2, 1]],
  figure_3: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1], [2, 1, 1], [2, 2, 1]],
  figure_4: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 2, 1], [1, 2, 2]],
  figure_5: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [2, 0, 1]],
  figure_6: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [2, 0, 1], [2, 1, 1], [2, 1, 2]],
  figure_7: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 2, 1], [1, 2, 1], [1, 2, 2]],
  figure_8: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [2, 1, 1], [3, 1, 1]],
};

const CUBE_COLORS = { top: '#4A90D9', left: '#2E5B8A', right: '#1E3D5C' };
const ROTATION_ANGLES = [0, 60, 120, 180];
const SIZE = 200;

/**
 * The drawing for one figure, in coordinates centred on the axis it rotates about, together
 * with how far it reaches from that centre.
 *
 * Kept separate from the SVG wrapper because the frame cannot be chosen one figure at a
 * time. A figure that is drawn to fit its own extent is drawn at its own scale, and scale
 * is the one thing that must not vary here: the participant is asked whether two figures
 * are the same shape, and two drawings of the same shape at different sizes are a different
 * question. So every figure gets the same frame, large enough for the one that reaches
 * furthest — see FRAME below.
 */
function figureBody(figureId, rotation, isMirror) {
  const cubeSize = SIZE / 6;
  const config = FIGURE_CONFIGS[figureId];

  const rotatePoint = (x, y, z, angle) => {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Around the vertical (Y) axis, as the original does.
    return [x * cos - z * sin, y, x * sin + z * cos];
  };

  const projectToIsometric = (x, y, z) => [
    (x - z) * cubeSize * 0.866,
    (x + z) * cubeSize * 0.5 - y * cubeSize,
  ];

  let cubes = config.map(([x, y, z]) => {
    const centeredX = x - 1;
    const centeredY = y - 1;
    const centeredZ = z - 0.5;
    const [mx, my, mz] = isMirror
      ? [-centeredX, centeredY, centeredZ]
      : [centeredX, centeredY, centeredZ];
    const [rx, ry, rz] = rotatePoint(mx, my, mz, rotation);
    return { x: rx, y: ry, z: rz };
  });

  // Painter's algorithm: far cubes first, so near ones draw over them.
  cubes = cubes.sort((a, b) => (a.x + a.z - a.y) - (b.x + b.z - b.y));

  const faces = ({ x, y, z }) => {
    const s = cubeSize;
    const h = s * 0.5;
    const w = s * 0.866;
    const [cx, cy] = projectToIsometric(x, y, z);
    return {
      top: [[cx, cy - s], [cx + w, cy - h], [cx, cy], [cx - w, cy - h]],
      left: [[cx - w, cy - h], [cx, cy], [cx, cy + s], [cx - w, cy + h]],
      right: [[cx + w, cy - h], [cx + w, cy + h], [cx, cy + s], [cx, cy]],
    };
  };

  const round = n => Math.round(n * 100) / 100;
  let reach = 0;
  const polygon = (points, fill) => {
    // Half the stroke sits outside the polygon, so the ink reaches half a pixel further
    // than the geometry does.
    for (const [x, y] of points) reach = Math.max(reach, Math.abs(x) + 0.5, Math.abs(y) + 0.5);
    return `<polygon points="${points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')}" `
      + `fill="${fill}" stroke="#1a1a1a" stroke-width="1"/>`;
  };

  const body = cubes.map(cube => {
    const f = faces(cube);
    return `<g>${polygon(f.top, CUBE_COLORS.top)}${polygon(f.left, CUBE_COLORS.left)}`
      + `${polygon(f.right, CUBE_COLORS.right)}</g>`;
  }).join('');

  return { body, reach };
}

/** One figure, drawn in the shared frame. */
function figureSvg(body, half) {
  const round = n => Math.round(n * 100) / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" `
    + `viewBox="${round(-half)} ${round(-half)} ${round(half * 2)} ${round(half * 2)}">`
    + `${body}</svg>`;
}

const figureFile = (figureId, angle, mirror) =>
  `${figureId}_${angle}${mirror ? '_m' : ''}.svg`;

// Every figure first, then the frame, then the files. The frame is the furthest any of the
// 64 reaches from its centre — a figure drawn with the origin a sixth of the way down a
// 200px box, which is what this used to do, has its lower cubes outside the box and cut off
// by it. 54 of the 64 were clipped that way, most of them at the bottom; a shape with a
// corner sliced off is a different shape, which is the judgement being asked for.
const drawings = [];
for (const figureId of Object.keys(FIGURE_CONFIGS)) {
  for (const angle of ROTATION_ANGLES) {
    for (const mirror of [false, true]) {
      drawings.push({ file: figureFile(figureId, angle, mirror), ...figureBody(figureId, angle, mirror) });
    }
  }
}

const FRAME = Math.ceil(Math.max(...drawings.map(d => d.reach)));
for (const { file, body } of drawings) writeFileSync(join(OUT_SVG, file), figureSvg(body, FRAME));
const figureCount = drawings.length;

// ─── The island map (components/mental-rep/IslandMap.tsx) ─────────────────────

const LANDMARKS = [
  { id: 'hut', name: 'Hut', nameHe: 'צריף', x: 15, y: 25 },
  { id: 'tree', name: 'Tree', nameHe: 'עץ', x: 40, y: 15 },
  { id: 'well', name: 'Well', nameHe: 'באר', x: 75, y: 20 },
  { id: 'rock', name: 'Rock', nameHe: 'סלע', x: 25, y: 55 },
  { id: 'lake', name: 'Lake', nameHe: 'אגם', x: 55, y: 50 },
  { id: 'beach', name: 'Beach', nameHe: 'חוף', x: 85, y: 60 },
  { id: 'cave', name: 'Cave', nameHe: 'מערה', x: 45, y: 80 },
];

const MAP_W = 600;
const MAP_H = 450;

function mapSvg(language) {
  const sx = x => (x / 100) * MAP_W;
  const sy = y => (y / 100) * MAP_H;

  const marker = ({ id, x, y }) => {
    const cx = sx(x);
    const cy = sy(y);
    switch (id) {
      case 'hut':
        return `<polygon points="${cx},${cy - 15} ${cx - 12},${cy} ${cx + 12},${cy}" fill="#8B4513" stroke="#5D3A1A" stroke-width="1"/>`
          + `<rect x="${cx - 8}" y="${cy}" width="16" height="12" fill="#DEB887" stroke="#5D3A1A" stroke-width="1"/>`;
      case 'tree':
        return `<rect x="${cx - 3}" y="${cy}" width="6" height="15" fill="#8B4513" stroke="#5D3A1A" stroke-width="1"/>`
          + `<polygon points="${cx},${cy - 20} ${cx - 15},${cy + 5} ${cx + 15},${cy + 5}" fill="#228B22" stroke="#006400" stroke-width="1"/>`;
      case 'well':
        return `<circle cx="${cx}" cy="${cy}" r="12" fill="#4169E1" stroke="#696969" stroke-width="3"/>`
          + `<circle cx="${cx}" cy="${cy}" r="8" fill="#00008B"/>`;
      case 'rock':
        return `<polygon points="${cx - 10},${cy + 8} ${cx - 12},${cy - 3} ${cx - 5},${cy - 10} ${cx + 5},${cy - 8} ${cx + 12},${cy} ${cx + 8},${cy + 8}" fill="#808080" stroke="#505050" stroke-width="2"/>`;
      case 'lake':
        return `<circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="#00CED1" stroke-width="2"/>`
          + `<path d="M ${cx - 8} ${cy} Q ${cx - 4} ${cy - 5}, ${cx} ${cy} Q ${cx + 4} ${cy + 5}, ${cx + 8} ${cy}" fill="none" stroke="#00CED1" stroke-width="2"/>`;
      case 'beach':
        return `<line x1="${cx}" y1="${cy - 15}" x2="${cx}" y2="${cy + 10}" stroke="#8B4513" stroke-width="2"/>`
          + `<path d="M ${cx - 15} ${cy - 5} Q ${cx} ${cy - 25}, ${cx + 15} ${cy - 5}" fill="#FF6347" stroke="#FF4500" stroke-width="1"/>`;
      case 'cave':
        return `<ellipse cx="${cx}" cy="${cy}" rx="15" ry="12" fill="#2F4F4F" stroke="#1C1C1C" stroke-width="2"/>`
          + `<ellipse cx="${cx}" cy="${cy + 2}" rx="10" ry="8" fill="#0D0D0D"/>`;
      default:
        return '';
    }
  };

  const label = lm => {
    const text = language === 'he' ? lm.nameHe : lm.name;
    return `<text x="${sx(lm.x)}" y="${sy(lm.y) + 30}" text-anchor="middle" fill="#000000" `
      + `font-size="14" font-family="sans-serif">${text}</text>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}">`
    + '<defs>'
    + '<linearGradient id="islandGradient" x1="0%" y1="0%" x2="100%" y2="100%">'
    + '<stop offset="0%" stop-color="#90EE90"/><stop offset="50%" stop-color="#228B22"/><stop offset="100%" stop-color="#006400"/></linearGradient>'
    + '<linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">'
    + '<stop offset="0%" stop-color="#87CEEB"/><stop offset="100%" stop-color="#4169E1"/></linearGradient>'
    + '<linearGradient id="lakeGradient" x1="0%" y1="0%" x2="0%" y2="100%">'
    + '<stop offset="0%" stop-color="#00CED1"/><stop offset="100%" stop-color="#008B8B"/></linearGradient>'
    + '<linearGradient id="beachGradient" x1="0%" y1="0%" x2="100%" y2="0%">'
    + '<stop offset="0%" stop-color="#F4A460"/><stop offset="100%" stop-color="#DEB887"/></linearGradient>'
    + '</defs>'
    + `<rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" fill="url(#waterGradient)"/>`
    + `<path d="M ${sx(5)} ${sy(40)} Q ${sx(10)} ${sy(10)}, ${sx(40)} ${sy(5)} `
    + `Q ${sx(70)} ${sy(2)}, ${sx(90)} ${sy(25)} Q ${sx(98)} ${sy(50)}, ${sx(92)} ${sy(70)} `
    + `Q ${sx(85)} ${sy(90)}, ${sx(55)} ${sy(95)} Q ${sx(25)} ${sy(98)}, ${sx(10)} ${sy(75)} `
    + `Q ${sx(2)} ${sy(55)}, ${sx(5)} ${sy(40)} Z" fill="url(#islandGradient)" stroke="#228B22" stroke-width="2"/>`
    + `<ellipse cx="${sx(85)}" cy="${sy(60)}" rx="${sx(8)}" ry="${sy(12)}" fill="url(#beachGradient)"/>`
    + `<ellipse cx="${sx(55)}" cy="${sy(50)}" rx="${sx(10)}" ry="${sy(8)}" fill="url(#lakeGradient)" stroke="#008B8B" stroke-width="1"/>`
    + LANDMARKS.map(lm => `<g>${marker(lm)}${label(lm)}</g>`).join('')
    + '</svg>';
}

for (const language of ['en', 'he']) {
  writeFileSync(join(OUT_SVG, `island-map-${language}.svg`), mapSvg(language));
}

// ─── Rotation trial bank (lib/mental-rep/rotation.ts) ─────────────────────────
//
// The original enumerates every figure x leftAngle x rightAngle combination, groups them by
// (rotation difference, same/different), and takes five per cell for forty trials. A
// definition cannot enumerate, so the cells are banked here and the definition samples five
// from each with `fromEach` — which keeps what the original's shuffle was for: no two
// participants get the same forty pairings.

const rotationCells = {};
for (const figureId of Object.keys(FIGURE_CONFIGS)) {
  for (const leftAngle of ROTATION_ANGLES) {
    for (const rightAngle of ROTATION_ANGLES) {
      // The original's condition: differing angles, or the 0-0 pair that gives difference 0.
      if (leftAngle !== rightAngle || leftAngle === 0) {
        let diff = Math.abs(rightAngle - leftAngle);
        if (diff > 180) diff = 360 - diff;
        for (const isSame of [true, false]) {
          const key = `rot${diff}${isSame ? 'Same' : 'Diff'}`;
          (rotationCells[key] ??= []).push({
            left: `/mental-rep/${figureFile(figureId, leftAngle, false)}`,
            // A "different" trial is the MIRROR of the same figure, which is what makes it
            // hard: a mirror image cannot be rotated into its twin, so the only way to know
            // is to try.
            right: `/mental-rep/${figureFile(figureId, rightAngle, !isSame)}`,
            figure: figureId,
            angle: diff,
            answer: isSame ? 'same' : 'different',
          });
        }
      }
    }
  }
}

// ─── Scanning trial bank (lib/mental-rep/scanning.ts) ─────────────────────────

const pairs = [];
for (const from of LANDMARKS) {
  for (const to of LANDMARKS) {
    if (from.id === to.id) continue;
    const distance = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    pairs.push({ from, to, distance });
  }
}
pairs.sort((a, b) => a.distance - b.distance);

const tercile = Math.floor(pairs.length / 3);
const BANDS = [
  ['scanShort', pairs.slice(0, tercile)],
  ['scanMedium', pairs.slice(tercile, tercile * 2)],
  ['scanLong', pairs.slice(tercile * 2)],
];

const scanCells = {};
for (const [name, band] of BANDS) {
  scanCells[name] = band.map(p => ({
    fromName: p.from.name,
    fromNameHe: p.from.nameHe,
    toName: p.to.name,
    toNameHe: p.to.nameHe,
    // Raw distance drives the correlation; the rounded one gives a line chart real units
    // on its x axis instead of bin numbers.
    distance: Math.round(p.distance * 10) / 10,
    distanceBin: Math.round(p.distance / 10) * 10,
    band: name.replace('scan', '').toLowerCase(),
  }));
}

// ─── Emit ─────────────────────────────────────────────────────────────────────

const literal = rows => rows.map(r => `  ${JSON.stringify(r)},`).join('\n');

const out = `// Mental-representation stimuli.
//
// GENERATED by scripts/build-mental-rep-stimuli.mjs — do not edit by hand.
//
// Ported from lib/mental-rep/rotation.ts, lib/mental-rep/scanning.ts and the two renderers
// in components/mental-rep/. The figures themselves live in public/mental-rep/ as ${figureCount}
// SVG files, one per figure x rotation x mirror, because the runtime shows images rather
// than drawing isometric cubes.

export interface RotationPair {
  /** Left-hand figure, always unmirrored. */
  left: string;
  /** Right-hand figure: the mirror of the same figure on a "different" trial. */
  right: string;
  figure: string;
  /** Rotation difference in degrees — the independent variable. */
  angle: number;
  answer: 'same' | 'different';
}

export interface ScanPair {
  fromName: string;
  fromNameHe: string;
  toName: string;
  toNameHe: string;
  /** Map units between the two landmarks — the independent variable. */
  distance: number;
  /** The same distance to the nearest 10, so a chart can group by it. */
  distanceBin: number;
  band: string;
}

export const MR_ISLAND_MAP = { en: '/mental-rep/island-map-en.svg', he: '/mental-rep/island-map-he.svg' };

${Object.entries(rotationCells).map(([name, rows]) =>
  `export const MR_${name.replace(/([A-Z])/g, '_$1').toUpperCase()}: RotationPair[] = [\n${literal(rows)}\n];`,
).join('\n\n')}

${Object.entries(scanCells).map(([name, rows]) =>
  `export const MR_${name.replace(/([A-Z])/g, '_$1').toUpperCase()}: ScanPair[] = [\n${literal(rows)}\n];`,
).join('\n\n')}
`;

writeFileSync(join(ROOT, 'lib', 'experiment-runtime', 'stimuli', 'mental-rep-stimuli.ts'), out);

console.log(`${figureCount} figures + 2 maps -> public/mental-rep/`);
for (const [name, rows] of Object.entries(rotationCells)) console.log(`  ${name}: ${rows.length}`);
for (const [name, rows] of Object.entries(scanCells)) console.log(`  ${name}: ${rows.length}`);
