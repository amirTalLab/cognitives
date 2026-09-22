// Bouba-kiki shapes, converted from components/bouba-kiki/ShapeDisplay.tsx by script.
//
// The component draws each as an <ellipse>, <circle>, <polygon> or <path>; every form is
// one path here so the runtime needs a single display kind. Converted mechanically and
// never retyped — a moved coordinate would change the stimulus of an experiment whose
// whole subject is the shape.
//
// All twelve are drawn in a 0 0 200 200 viewBox.

export interface BkShape { id: string; d: string; }

export const BK_ROUNDED: BkShape[] = [
  { id: 'rounded_01.png', d: 'M 20 100 A 80 60 0 1 0 180 100 A 80 60 0 1 0 20 100 Z' },
  { id: 'rounded_02.png', d: 'M 30 100 A 70 70 0 1 0 170 100 A 70 70 0 1 0 30 100 Z' },
  { id: 'rounded_03.png', d: 'M 100 30 Q 160 50, 160 100 Q 160 150, 100 170 Q 40 150, 40 100 Q 40 50, 100 30 Z' },
  { id: 'rounded_04.png', d: 'M 100 40 C 140 40, 150 70, 150 100 C 150 130, 140 160, 100 160 C 60 160, 50 130, 50 100 C 50 70, 60 40, 100 40 Z' },
  { id: 'rounded_05.png', d: 'M 40 100 A 60 80 0 1 0 160 100 A 60 80 0 1 0 40 100 Z' },
  { id: 'rounded_06.png', d: 'M 100 30 Q 150 30, 170 80 Q 170 120, 120 160 Q 80 160, 30 120 Q 30 80, 50 30 Q 70 30, 100 30 Z' },
];

export const BK_SPIKY: BkShape[] = [
  { id: 'spiky_01.png', d: 'M 100 20 L 130 80 L 190 80 L 140 120 L 160 180 L 100 140 L 40 180 L 60 120 L 10 80 L 70 80 Z' },
  { id: 'spiky_02.png', d: 'M 100 30 L 120 90 L 180 90 L 130 130 L 150 190 L 100 150 L 50 190 L 70 130 L 20 90 L 80 90 Z' },
  { id: 'spiky_03.png', d: 'M 100 20 L 120 70 L 170 60 L 130 100 L 180 130 L 120 130 L 130 180 L 100 140 L 70 180 L 80 130 L 20 130 L 70 100 L 30 60 L 80 70 Z' },
  { id: 'spiky_04.png', d: 'M 100 10 L 110 60 L 160 40 L 120 80 L 170 100 L 120 120 L 140 170 L 100 130 L 60 170 L 80 120 L 30 100 L 80 80 L 40 40 L 90 60 Z' },
  { id: 'spiky_05.png', d: 'M 100 30 L 115 75 L 165 75 L 125 105 L 140 150 L 100 120 L 60 150 L 75 105 L 35 75 L 85 75 Z' },
  { id: 'spiky_06.png', d: 'M 100 25 L 108 65 L 145 55 L 115 85 L 155 105 L 115 125 L 125 165 L 100 135 L 75 165 L 85 125 L 45 105 L 85 85 L 55 55 L 92 65 Z' },
];
