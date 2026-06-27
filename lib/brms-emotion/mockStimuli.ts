const SIZE = 256;

interface FaceParams {
  headRx: number;
  headRy: number;
  eyeY: number;
  eyeSpacing: number;
  eyeRx: number;
  eyeRy: number;
  noseLen: number;
}

const IDENTITIES: Record<string, FaceParams> = {
  mock_f01: { headRx: 90, headRy: 110, eyeY: 100, eyeSpacing: 34, eyeRx: 10, eyeRy: 7, noseLen: 18 },
  mock_f02: { headRx: 85, headRy: 108, eyeY: 98,  eyeSpacing: 30, eyeRx: 9,  eyeRy: 7, noseLen: 16 },
  mock_f03: { headRx: 88, headRy: 112, eyeY: 102, eyeSpacing: 36, eyeRx: 11, eyeRy: 6, noseLen: 20 },
  mock_f04: { headRx: 82, headRy: 106, eyeY: 96,  eyeSpacing: 32, eyeRx: 10, eyeRy: 8, noseLen: 15 },
  mock_m01: { headRx: 94, headRy: 114, eyeY: 104, eyeSpacing: 38, eyeRx: 11, eyeRy: 6, noseLen: 22 },
  mock_m02: { headRx: 92, headRy: 110, eyeY: 100, eyeSpacing: 36, eyeRx: 12, eyeRy: 7, noseLen: 20 },
  mock_m03: { headRx: 96, headRy: 116, eyeY: 106, eyeSpacing: 40, eyeRx: 10, eyeRy: 6, noseLen: 24 },
  mock_m04: { headRx: 90, headRy: 112, eyeY: 102, eyeSpacing: 34, eyeRx: 13, eyeRy: 7, noseLen: 19 },
};

type EmotionCode = 'AF' | 'HA' | 'NE';

function buildSvg(id: string, emotion: EmotionCode, inverted: boolean): string {
  const p = IDENTITIES[id];
  if (!p) throw new Error(`Unknown identity: ${id}`);

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const leftEyeX = cx - p.eyeSpacing;
  const rightEyeX = cx + p.eyeSpacing;
  const mouthY = cy + 40;

  let pupils = '';
  let brows = '';
  let mouth = '';

  const pupilR = 4;

  if (emotion === 'AF') {
    const wideEyeRx = p.eyeRx + 3;
    const wideEyeRy = p.eyeRy + 3;
    pupils = `
      <ellipse cx="${leftEyeX}" cy="${p.eyeY}" rx="${wideEyeRx}" ry="${wideEyeRy}" fill="none" stroke="#333" stroke-width="2.5"/>
      <circle cx="${leftEyeX}" cy="${p.eyeY}" r="${pupilR}" fill="#333"/>
      <ellipse cx="${rightEyeX}" cy="${p.eyeY}" rx="${wideEyeRx}" ry="${wideEyeRy}" fill="none" stroke="#333" stroke-width="2.5"/>
      <circle cx="${rightEyeX}" cy="${p.eyeY}" r="${pupilR}" fill="#333"/>`;
    const browY = p.eyeY - wideEyeRy - 8;
    brows = `
      <line x1="${leftEyeX - 14}" y1="${browY + 4}" x2="${leftEyeX + 14}" y2="${browY - 4}" stroke="#333" stroke-width="3" stroke-linecap="round"/>
      <line x1="${rightEyeX - 14}" y1="${browY - 4}" x2="${rightEyeX + 14}" y2="${browY + 4}" stroke="#333" stroke-width="3" stroke-linecap="round"/>`;
    mouth = `<ellipse cx="${cx}" cy="${mouthY}" rx="14" ry="10" fill="none" stroke="#333" stroke-width="2.5"/>`;
  } else if (emotion === 'HA') {
    pupils = `
      <ellipse cx="${leftEyeX}" cy="${p.eyeY}" rx="${p.eyeRx}" ry="${p.eyeRy}" fill="none" stroke="#333" stroke-width="2.5"/>
      <circle cx="${leftEyeX}" cy="${p.eyeY}" r="${pupilR}" fill="#333"/>
      <ellipse cx="${rightEyeX}" cy="${p.eyeY}" rx="${p.eyeRx}" ry="${p.eyeRy}" fill="none" stroke="#333" stroke-width="2.5"/>
      <circle cx="${rightEyeX}" cy="${p.eyeY}" r="${pupilR}" fill="#333"/>`;
    const browY = p.eyeY - p.eyeRy - 8;
    brows = `
      <line x1="${leftEyeX - 12}" y1="${browY}" x2="${leftEyeX + 12}" y2="${browY}" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="${rightEyeX - 12}" y1="${browY}" x2="${rightEyeX + 12}" y2="${browY}" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>`;
    mouth = `<path d="M ${cx - 20} ${mouthY - 4} Q ${cx} ${mouthY + 16} ${cx + 20} ${mouthY - 4}" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>`;
  } else {
    pupils = `
      <ellipse cx="${leftEyeX}" cy="${p.eyeY}" rx="${p.eyeRx}" ry="${p.eyeRy}" fill="none" stroke="#333" stroke-width="2.5"/>
      <circle cx="${leftEyeX}" cy="${p.eyeY}" r="${pupilR}" fill="#333"/>
      <ellipse cx="${rightEyeX}" cy="${p.eyeY}" rx="${p.eyeRx}" ry="${p.eyeRy}" fill="none" stroke="#333" stroke-width="2.5"/>
      <circle cx="${rightEyeX}" cy="${p.eyeY}" r="${pupilR}" fill="#333"/>`;
    const browY = p.eyeY - p.eyeRy - 8;
    brows = `
      <line x1="${leftEyeX - 12}" y1="${browY}" x2="${leftEyeX + 12}" y2="${browY}" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="${rightEyeX - 12}" y1="${browY}" x2="${rightEyeX + 12}" y2="${browY}" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>`;
    mouth = `<line x1="${cx - 16}" y1="${mouthY}" x2="${cx + 16}" y2="${mouthY}" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>`;
  }

  const nose = `<line x1="${cx}" y1="${cy + 8}" x2="${cx}" y2="${cy + 8 + p.noseLen}" stroke="#333" stroke-width="2" stroke-linecap="round"/>`;

  const rotation = inverted ? `transform="rotate(180 ${cx} ${cy})"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" preserveAspectRatio="none">
  <defs>
    <clipPath id="oval">
      <ellipse cx="${cx}" cy="${cy}" rx="${p.headRx}" ry="${p.headRy}"/>
    </clipPath>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="#b0b0b0"/>
  <g clip-path="url(#oval)" ${rotation}>
    <ellipse cx="${cx}" cy="${cy}" rx="${p.headRx}" ry="${p.headRy}" fill="#d4d4d4" stroke="#999" stroke-width="2"/>
    ${pupils}${brows}${nose}${mouth}
  </g>
</svg>`;
}

function svgToDataUri(svg: string): string {
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

export type EmotionKey = 'AF' | 'HA' | 'NE';
export type OrientationKey = 'up' | 'inv';

export const IDENTITY_IDS = Object.keys(IDENTITIES);

export function getMockImageUrl(identityId: string, emotion: EmotionKey, orientation: OrientationKey): string {
  return svgToDataUri(buildSvg(identityId, emotion, orientation === 'inv'));
}

export function getAllMockImageUrls(): string[] {
  const urls: string[] = [];
  const emotions: EmotionKey[] = ['AF', 'HA', 'NE'];
  const orientations: OrientationKey[] = ['up', 'inv'];
  for (const id of IDENTITY_IDS) {
    for (const em of emotions) {
      for (const ori of orientations) {
        urls.push(getMockImageUrl(id, em, ori));
      }
    }
  }
  return urls;
}
