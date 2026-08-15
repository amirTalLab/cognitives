'use client';

// Renders one Display against the current trial's values.
//
// Every variant here corresponds to something the sixteen hand-written experiments
// actually put on screen. Shapes are inline SVG rather than image files so a generated
// experiment never needs an asset sourced, shipped or pathed.

import { useMemo } from 'react';
import type { Display } from './schema';
import { resolve, seededRandom } from './trials';

type Values = Record<string, unknown>;

/** Seed for anything drawn during render. Injected by the runner, one per trial. */
export const SEED_KEY = '__seed';

/**
 * Where image files are served from. Injected by the runner from the definition's manifest.
 *
 * Carried in `values` rather than threaded as a prop because displays nest — pair, stack,
 * array and positioned all recurse — and `values` is already the channel the runner uses
 * for exactly this (see SEED_KEY above).
 */
export const ASSET_BASE_KEY = '__assetBase';

/**
 * Turns a manifest filename into a URL.
 *
 * Anything already addressable is left alone, so a definition can point straight at
 * "/faces/c2_1_1.jpg" — the images this site has served for years — without an upload.
 */
function assetUrl(src: string, base: unknown): string {
  if (!src || /^(https?:|data:|blob:|\/)/.test(src)) return src;
  return `${String(base ?? '')}${src}`;
}

const COLORS: Record<string, string> = {
  red: '#ef4444', green: '#22c55e', blue: '#3b82f6', yellow: '#eab308',
  purple: '#a78bfa', white: '#f8fafc', black: '#0f172a',
};

function color(value: string | undefined): string {
  if (!value) return '#f8fafc';
  return COLORS[value] ?? value;
}

/** Spiky "kiki" outline — alternating outer and inner radii. */
function starPoints(cx: number, cy: number, outer: number, inner: number, spikes: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(' ');
}

/** Rounded "bouba" outline — hand-tuned so it reads as organic, not as a circle. */
const BLOB_PATH =
  'M100,18 C137,18 158,42 166,72 C174,102 186,128 166,152 C146,176 118,182 96,180 ' +
  'C68,178 40,168 26,142 C12,116 20,86 32,62 C44,38 68,18 100,18 Z';

function ShapeView({ node, values }: { node: Extract<Display, { kind: 'shape' }>; values: Values }) {
  const shape = resolve(node.shape, values) ?? 'circle';
  const size = Number(resolve(node.size, values) ?? 120);
  const fill = color(resolve(node.color, values) as string | undefined);
  const rotation = Number(resolve(node.rotation, values) ?? 0);
  const points = Number(resolve(node.points, values) ?? 7);

  return (
    <svg viewBox="0 0 200 200" width={size} height={size}
      style={{ transform: `rotate(${rotation}deg)`, display: 'block' }} aria-hidden>
      {shape === 'blob' && <path d={BLOB_PATH} fill={fill} />}
      {shape === 'star' && <polygon points={starPoints(100, 100, 92, 38, points)} fill={fill} />}
      {shape === 'circle' && <circle cx={100} cy={100} r={80} fill={fill} />}
      {shape === 'square' && <rect x={30} y={30} width={140} height={140} fill={fill} />}
      {shape === 'arrow' && <polygon points="20,100 120,30 120,75 180,75 180,125 120,125 120,170" fill={fill} />}
      {shape === 'line' && <rect x={20} y={92} width={160} height={16} fill={fill} />}
    </svg>
  );
}

/**
 * Lays items out at non-overlapping random positions.
 *
 * Memoised on the trial's values so a re-render (a state change elsewhere) does not
 * reshuffle the array mid-trial — which would be a visible glitch during a timed display.
 */
function ArrayView({ node, values }: { node: Extract<Display, { kind: 'array' }>; values: Values }) {
  const targets = Number(resolve(node.count, values) ?? 0);
  const distractors = Number(resolve(node.distractorCount, values) ?? 0);
  const area = node.area ?? { width: 600, height: 400 };

  const seed = Number(values[SEED_KEY] ?? 1);
  const positions = useMemo(() => {
    const rng = seededRandom(seed);
    const total = targets + distractors;
    const placed: { x: number; y: number }[] = [];
    const minGap = 44;
    let guard = 0;
    while (placed.length < total && guard < total * 200) {
      guard++;
      const p = { x: rng() * (area.width - 40) + 20, y: rng() * (area.height - 40) + 20 };
      if (placed.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= minGap)) placed.push(p);
    }
    // If the box is too crowded to keep them apart, fall back to a grid rather than loop.
    while (placed.length < total) {
      const i = placed.length;
      placed.push({ x: 20 + (i % 10) * 56, y: 20 + Math.floor(i / 10) * 56 });
    }
    return placed;
  }, [targets, distractors, area.width, area.height, seed]);

  return (
    <div style={{ position: 'relative', width: area.width, height: area.height, maxWidth: '100%' }}>
      {positions.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}>
          <DisplayView node={i < targets ? node.item : (node.distractor ?? node.item)} values={values} />
        </div>
      ))}
    </div>
  );
}

export function DisplayView({ node, values }: { node: Display; values: Values }) {
  switch (node.kind) {
    case 'blank':
      return <div />;

    case 'fixation':
      return <div className="text-4xl text-gray-500 select-none">{node.symbol ?? '+'}</div>;

    case 'mask':
      return (
        <div className="text-4xl text-gray-400 select-none" style={{ fontFamily: 'monospace' }}>
          {node.pattern ?? '####'}
        </div>
      );

    case 'text': {
      const text = resolve(node.text, values) ?? '';
      return (
        <div
          className="select-none"
          style={{
            fontSize: Number(resolve(node.size, values) ?? 40),
            color: color(resolve(node.color, values) as string | undefined),
            fontFamily: node.font === 'mono' ? 'monospace' : undefined,
            // HTML collapses runs of spaces, so "H   H" renders as "H H" and any stimulus
            // built from alignment — a compound letter, a grid, a matrix — comes out
            // silently wrong. Asking for mono IS the request for alignment to be kept;
            // proportional text stays wrappable, which instructions need.
            whiteSpace: node.font === 'mono' ? 'pre' : undefined,
          }}
        >
          {String(text)}
        </div>
      );
    }

    case 'shape':
      return <ShapeView node={node} values={values} />;

    case 'image': {
      const size = Number(resolve(node.size, values) ?? 180);
      const rotation = Number(resolve(node.rotation, values) ?? 0);
      return (
        // eslint-disable-next-line @next/next/no-img-element -- src is data-driven, so next/image cannot optimise it
        <img
          src={assetUrl(String(resolve(node.src, values) ?? ''), values[ASSET_BASE_KEY])}
          alt=""
          width={size}
          height={size}
          style={{ transform: `rotate(${rotation}deg)`, display: 'block', objectFit: 'contain' }}
        />
      );
    }

    case 'pair':
      return (
        <div className="flex items-center" style={{ gap: node.gap ?? 40 }}>
          <DisplayView node={node.left} values={values} />
          <DisplayView node={node.right} values={values} />
        </div>
      );

    case 'stack':
      return (
        <div className="flex flex-col items-center gap-4">
          {node.items.map((item, i) => <DisplayView key={i} node={item} values={values} />)}
        </div>
      );

    case 'array':
      return <ArrayView node={node} values={values} />;

    case 'positioned': {
      const at = resolve(node.at, values) ?? 'center';
      const offset = 180;
      const style: React.CSSProperties = { position: 'absolute' };
      if (at === 'left') { style.left = `calc(50% - ${offset}px)`; style.top = '50%'; }
      else if (at === 'right') { style.left = `calc(50% + ${offset}px)`; style.top = '50%'; }
      else if (at === 'top') { style.left = '50%'; style.top = `calc(50% - ${offset}px)`; }
      else if (at === 'bottom') { style.left = '50%'; style.top = `calc(50% + ${offset}px)`; }
      else { style.left = '50%'; style.top = '50%'; }
      style.transform = 'translate(-50%, -50%)';

      return (
        <div style={{ position: 'relative', width: '100%', height: 400 }}>
          {/* Fixation stays visible so the eyes have somewhere to be during cueing. */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
            <div className="text-3xl text-gray-600 select-none">+</div>
          </div>
          <div style={style}>
            <DisplayView node={node.content} values={values} />
          </div>
        </div>
      );
    }
  }
}
