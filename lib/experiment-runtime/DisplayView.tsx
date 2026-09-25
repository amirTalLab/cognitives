'use client';

// Renders one Display against the current trial's values.
//
// Every variant here corresponds to something the sixteen hand-written experiments
// actually put on screen. Shapes are inline SVG rather than image files so a generated
// experiment never needs an asset sourced, shipped or pathed.

import { useEffect, useMemo, useState } from 'react';
import type { Display } from './schema';
import { lookup, resolve, seededRandom } from './trials';

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
 * Which language the run is in, for a display that carries both.
 *
 * Instructions, buttons and feedback have taken `{ en, he }` from the start, because a
 * participant reads those. A display did not, on the assumption that what it shows is a
 * stimulus — and a stimulus should not be translated. But a task whose QUESTION is on screen
 * breaks that: ensemble perception asks "what was the average circle size?" beside the
 * scale, and a Hebrew run that asks it in English is not the same experiment.
 */
export const LANGUAGE_KEY = '__language';

/**
 * How far a `positioned` item sits from the centre.
 *
 * Capped in viewport units as well as pixels, because a flat 180px runs off a phone: at
 * 375px wide the centre is 187px, so a box at +180 spans past the right edge and part of it
 * is simply not there. In serial reaction time the box IS the answer, so a participant
 * cannot press what they cannot see.
 *
 * Exported because the RESPONSE buttons are laid out to the same geometry — if the two
 * drifted apart, a button would sit somewhere other than the stimulus it answers for, and
 * the task would quietly get harder for everyone.
 */
export const POSITIONED_OFFSET = 'min(180px, 32vw)';

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
  const area = node.area ?? { width: 600, height: 400 };
  const seed = Number(values[SEED_KEY] ?? 1);

  // How much room there is to draw in. Measured rather than assumed: the array's own size is
  // in pixels chosen for a laptop, and a phone has neither the width nor the height.
  // Two thirds of the height, so the response buttons below are on screen with it.
  const [room, setRoom] = useState({ width: area.width, height: area.height });
  useEffect(() => {
    const measure = () => setRoom({
      width: Math.max(120, window.innerWidth - 32),
      height: Math.max(120, window.innerHeight * 0.62),
    });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // One flat list of what to draw. `groups` is the general form — a conjunction search holds
  // three kinds at once — and the older target-and-distractor pair is the two-group case of
  // the same thing, kept working so no existing experiment changes.
  const drawn = useMemo(() => {
    // An array whose members differ from one another in a way the TRIAL specifies: one item
    // per element of a list, each carrying its own values. Ensemble perception is the case —
    // the question is what the average of these particular sizes was, so the sizes cannot be
    // a repeated constant.
    if (node.from) {
      const list = lookup(node.from.replace(/^\{|\}$/g, ''), values);
      if (Array.isArray(list)) {
        const as = node.as ?? 'each';
        return list.map(element => ({
          item: node.item,
          rotation: 0,
          values: { ...values, [as]: element },
        }));
      }
    }

    const spec = node.groups
      ?? [
        { count: node.count, item: node.item },
        { count: node.distractorCount ?? 0, item: node.distractor ?? node.item },
      ];
    // Seeded apart from the layout, so adding an item cannot reshuffle every rotation.
    const spin = seededRandom(seed * 7 + 13);
    const out: { item: Display; rotation: number }[] = [];
    for (const group of spec) {
      const n = Math.max(0, Math.round(Number(resolve(group.count, values) ?? 0)));
      const turns = 'rotate' in group ? group.rotate : undefined;
      for (let i = 0; i < n; i++) {
        out.push({
          item: group.item,
          rotation: turns?.length ? turns[Math.floor(spin() * turns.length)] : 0,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the node is a constant of the definition
  }, [node, values, seed]);

  const targets = drawn.length;
  const distractors = 0;

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

  // Scaled to whatever room there is, as ONE piece. The area is designed in pixels — 600 by
  // 500 for a search array — which is wider than a phone, so items fell off the side and the
  // page scrolled to reach them. A participant who has to scroll to see the array is not
  // doing a visual search.
  //
  // Scaling the whole thing rather than repositioning keeps the layout exactly as designed:
  // the gaps between items stay proportional, so nothing crowds or overlaps that did not
  // before. Never above 1 — a small array is not blown up to fill a desktop.
  const scale = Math.min(1, room.width / area.width, room.height / area.height);

  return (
    <div style={{
      // The footprint AFTER scaling, so the layout around it reserves the right space.
      width: area.width * scale,
      height: area.height * scale,
      maxWidth: '100%',
    }}>
    <div style={{
      position: 'relative',
      width: area.width,
      height: area.height,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
    }}>
      {positions.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: p.x, top: p.y,
          // The rotation rides on the wrapper, so any item kind can be turned — a letter as
          // easily as a shape — without every display variant growing its own rotation.
          transform: `translate(-50%, -50%) rotate(${drawn[i]?.rotation ?? 0}deg)`,
        }}>
          {/* An element-driven array gives each item its own values; every other array
              shares the trial's. */}
          <DisplayView node={drawn[i]?.item ?? node.item}
            values={(drawn[i] as { values?: Values })?.values ?? values} />
        </div>
      ))}
    </div>
    </div>
  );
}

export function DisplayView({ node, values }: { node: Display; values: Values }) {
  switch (node.kind) {
    // A different display depending on the trial, for a block interleaving two tasks. The
    // fallback is deliberate: a case that does not exist would otherwise be a blank screen
    // mid-experiment, and the validator catches the missing case before anyone runs it.
    case 'switch': {
      const chosen = String(lookup(node.by, values));
      const branch = node.cases[chosen] ?? Object.values(node.cases)[0];
      return branch ? <DisplayView node={branch} values={values} /> : <div />;
    }

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
      // `textHe` only where the text is something the participant READS — a question, an
      // instruction beside the scale. A stimulus word is not translated, which is why this
      // is opt-in rather than a required pair.
      const rtl = values[LANGUAGE_KEY] === 'he';
      const source = rtl && node.textHe !== undefined ? node.textHe : node.text;
      const text = resolve(source, values) ?? '';
      // A stimulus must never run off the screen. The size a definition asks for is what it
      // gets on a laptop; on a phone the longest Hebrew colour word at 96px is wider than
      // the display, and half of it would simply be missing — which a participant reads as
      // part of the task rather than as a fault.
      //
      // Scaled by the number of characters, taking a character as roughly 0.6em, against 92%
      // of the viewport. `min` means this only ever makes text smaller.
      const asked = Number(resolve(node.size, values) ?? 40);
      const chars = Math.max(1, String(text).length);
      // 86vw, not 100: the runner pads the stage by 24px a side, so the space a stimulus
      // actually has is narrower than the window. 0.68em per character rather than 0.6,
      // because these are capitals — AMARILLO at 8 characters was the one that overflowed.
      const fitted = `min(${asked}px, ${(86 / (chars * 0.68)).toFixed(2)}vw)`;
      // ONE WORD STAYS ON ONE LINE. A stimulus broken across two lines is not the stimulus:
      // the eye reads it in two fixations instead of one, which is the thing being timed.
      // Only text with a space in it may wrap, which is instructions rather than stimuli.
      const oneWord = !/\s/.test(String(text));
      // Direction follows the CONTENT, not the run's language. A string of neutral
      // characters — "_ _ ? _", marking which position is being asked about — has no
      // direction of its own, so it takes the surrounding one and silently mirrors on a
      // Hebrew run: the marker would point at the second letter while the question is about
      // the third, and nothing on screen would say so.
      // An explicit direction wins, for text whose content cannot decide — a marker made of
      // underscores and a question mark has no direction of its own and would otherwise take
      // the one around it, pointing at the letter from the wrong end.
      const hebrew = /[֐-׿]/.test(String(text));
      return (
        <div
          className="select-none"
          dir={node.dir ?? (hebrew ? 'rtl' : 'ltr')}
          style={{
            fontSize: fitted,
            maxWidth: '86vw',
            // Only text with a space in it may wrap.
            overflowWrap: oneWord ? undefined : 'break-word',
            textAlign: 'center',
            color: color(resolve(node.color, values) as string | undefined),
            fontFamily: node.font === 'mono' ? 'monospace' : undefined,
            // HTML collapses runs of spaces, so "H   H" renders as "H H" and any stimulus
            // built from alignment — a compound letter, a grid, a matrix — comes out
            // silently wrong. Asking for mono IS the request for alignment to be kept.
            //
            // `nowrap` for a single word, so a stimulus is never split across two lines: the
            // size above is what keeps it on the screen, not wrapping.
            whiteSpace: node.font === 'mono' ? 'pre' : oneWord ? 'nowrap' : undefined,
          }}
        >
          {String(text)}
        </div>
      );
    }

    case 'shape':
      return <ShapeView node={node} values={values} />;

    case 'svgPath': {
      const size = Number(resolve(node.size, values) ?? 200);
      const d = String(resolve(node.d, values) ?? '');
      // Only the path data is used. Nothing here is markup, so a definition — which may
      // have come from the /create page — cannot put anything of its own into the page.
      // Light by default: these sit on the runtime's dark surface, where the original's
      // near-black fill on a white card would be invisible.
      const fill = color(resolve(node.color, values) as string | undefined) || '#e5e7eb';
      return (
        <svg width={size} height={size} viewBox={node.viewBox ?? '0 0 200 200'}
          xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d={d} fill={fill} />
        </svg>
      );
    }

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
          // The asked-for size on a laptop, and no more than the screen allows on a phone.
          // Two 200px figures side by side are 448px with their gap, which is wider than a
          // phone — half of the right-hand one was simply not there. Height is capped too,
          // or a tall stimulus is cut off at the bottom with the buttons below it.
          style={{
            transform: `rotate(${rotation}deg)`,
            display: 'block',
            objectFit: 'contain',
            maxWidth: '100%',
            maxHeight: '55vh',
            height: 'auto',
          }}
        />
      );
    }

    // Two pictures cut at the same height and joined flush. Both halves are absolutely
    // placed inside a fixed square, so the composite occupies exactly the space a whole
    // image would — a container that grew with the offset would move the face on screen and
    // give the misalignment away before anyone looked at it.
    case 'composite': {
      const size = Number(resolve(node.size, values) ?? 240);
      const cut = Number(resolve(node.cut, values) ?? 0.55);
      const offset = Math.round(size * Number(resolve(node.offset, values) ?? 0));
      const topH = Math.round(size * cut);
      const src = (v: unknown) => assetUrl(String(resolve(v as string, values) ?? ''), values[ASSET_BASE_KEY]);
      const whole: React.CSSProperties = {
        width: size, height: size, objectFit: 'cover', display: 'block',
      };
      return (
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, userSelect: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: size, height: topH, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- src is data-driven */}
            <img src={src(node.top)} alt="" draggable={false} style={whole} />
          </div>
          {/* The lower half is what slides; pulled up by the cut so its own image lines up. */}
          <div style={{
            position: 'absolute', top: topH, left: offset,
            width: size, height: size - topH, overflow: 'hidden',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- src is data-driven */}
            <img src={src(node.bottom)} alt="" draggable={false} style={{ ...whole, marginTop: -topH }} />
          </div>
        </div>
      );
    }

    case 'pair':
      return (
        // Bounded to the screen, and the gap shrinks with it: a pair of figures at their
        // full size is wider than a phone, and the right-hand one went off the edge.
        <div className="flex items-center justify-center"
          style={{ gap: `min(${node.gap ?? 40}px, 6vw)`, maxWidth: '100%', width: '100%' }}>
          {/* Each half in a box that is allowed to shrink. A flex item defaults to
              `min-width: auto`, which is its intrinsic width — so two 200px figures simply
              refuse to fit a 375px screen and the right-hand one goes over the edge. */}
          {[node.left, node.right].map((half, i) => (
            <div key={i} style={{ minWidth: 0, flex: '0 1 auto', display: 'flex', justifyContent: 'center' }}>
              <DisplayView node={half} values={values} />
            </div>
          ))}
        </div>
      );

    case 'stack':
      return (
        <div className="flex flex-col items-center gap-4">
          {node.items.map((item, i) => <DisplayView key={i} node={item} values={values} />)}
        </div>
      );

    case 'row':
      return (
        // Explicitly left-to-right: "left box" must mean the left of the screen even when an
        // ancestor sets dir="rtl" for a Hebrew run.
        <div className="flex items-center justify-center"
          style={{ gap: `min(${node.gap ?? 40}px, 6vw)`, direction: 'ltr' }}>
          {node.items.map((item, i) => <DisplayView key={i} node={item} values={values} />)}
        </div>
      );

    case 'frame': {
      const size = Number(resolve(node.size, values) ?? 120);
      const border = resolve(node.color, values) as string | undefined;
      const thickness = Number(resolve(node.thickness, values) ?? 2);
      return (
        // Capped by viewport width so two boxes and a cue still fit side by side on a phone.
        <div style={{
          width: `min(${size}px, 22vw)`, height: `min(${size}px, 22vw)`, flexShrink: 0,
          border: `${thickness}px solid ${border ? color(border) : '#71717a'}`, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
        }}>
          {node.content && <DisplayView node={node.content} values={values} />}
        </div>
      );
    }

    case 'array':
      return <ArrayView node={node} values={values} />;

    case 'positioned': {
      const at = resolve(node.at, values) ?? 'center';
      const offset = POSITIONED_OFFSET;
      const style: React.CSSProperties = { position: 'absolute' };
      if (at === 'left') { style.left = `calc(50% - ${offset})`; style.top = '50%'; }
      else if (at === 'right') { style.left = `calc(50% + ${offset})`; style.top = '50%'; }
      else if (at === 'top') { style.left = '50%'; style.top = `calc(50% - ${offset})`; }
      else if (at === 'bottom') { style.left = '50%'; style.top = `calc(50% + ${offset})`; }
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
