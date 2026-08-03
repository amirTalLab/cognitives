'use client';

import React from 'react';

interface BlockFigureProps {
  figureId: string;
  rotation: number; // 0, 60, 120, or 180 degrees
  isMirror?: boolean; // For "different" trials
  size?: number;
}

// Define 8 different block configurations
// Each configuration is a series of connected cube positions
// Format: array of [x, y, z] positions for each cube

const FIGURE_CONFIGS: { [key: string]: number[][] } = {
  figure_1: [
    [0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 1, 1], [2, 1, 2],
  ],
  figure_2: [
    [0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 2, 0], [1, 2, 1], [2, 2, 1],
  ],
  figure_3: [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1], [2, 1, 1], [2, 2, 1],
  ],
  figure_4: [
    [0, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 2, 1], [1, 2, 2],
  ],
  figure_5: [
    [0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [2, 0, 1],
  ],
  figure_6: [
    [0, 0, 0], [1, 0, 0], [1, 0, 1], [2, 0, 1], [2, 1, 1], [2, 1, 2],
  ],
  figure_7: [
    [0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 2, 1], [1, 2, 1], [1, 2, 2],
  ],
  figure_8: [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [2, 1, 1], [3, 1, 1],
  ],
};

// Colors for the 3D effect
const CUBE_COLORS = {
  top: '#4A90D9',    // Light blue
  left: '#2E5B8A',   // Medium blue
  right: '#1E3D5C',  // Dark blue
};

export default function BlockFigure({
  figureId,
  rotation,
  isMirror = false,
  size = 200,
}: BlockFigureProps) {
  const cubeSize = size / 6; // Base cube size
  const config = FIGURE_CONFIGS[figureId] || FIGURE_CONFIGS.figure_1;

  // Apply rotation transformation
  const rotatePoint = (x: number, y: number, z: number, angle: number): [number, number, number] => {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Rotate around Y axis (vertical)
    const newX = x * cos - z * sin;
    const newZ = x * sin + z * cos;

    return [newX, y, newZ];
  };

  // Apply mirror transformation (flip X)
  const mirrorPoint = (x: number, y: number, z: number): [number, number, number] => {
    return [-x, y, z];
  };

  // Project 3D to 2D isometric
  const projectToIsometric = (x: number, y: number, z: number): [number, number] => {
    const isoX = (x - z) * cubeSize * 0.866; // cos(30°) ≈ 0.866
    const isoY = (x + z) * cubeSize * 0.5 - y * cubeSize; // sin(30°) = 0.5
    return [isoX, isoY];
  };

  // Transform all cubes
  let transformedCubes = config.map(([x, y, z]) => {
    // Center the figure
    const centeredX = x - 1;
    const centeredY = y - 1;
    const centeredZ = z - 0.5;

    // Apply mirror if needed
    const [mx, my, mz] = isMirror
      ? mirrorPoint(centeredX, centeredY, centeredZ)
      : [centeredX, centeredY, centeredZ];

    // Apply rotation
    const [rx, ry, rz] = rotatePoint(mx, my, mz, rotation);

    return { x: rx, y: ry, z: rz };
  });

  // Sort cubes by depth for proper rendering (painter's algorithm)
  transformedCubes = transformedCubes.sort((a, b) => {
    const depthA = a.x + a.z - a.y;
    const depthB = b.x + b.z - b.y;
    return depthA - depthB;
  });

  // Generate isometric cube paths
  const generateCubePath = (x: number, y: number, z: number) => {
    const s = cubeSize;
    const h = s * 0.5;
    const w = s * 0.866;

    // Project center
    const [cx, cy] = projectToIsometric(x, y, z);

    // Cube vertices in isometric projection
    const top = [
      [cx, cy - s],           // top
      [cx + w, cy - h],       // top-right
      [cx, cy],               // center
      [cx - w, cy - h],       // top-left
    ];

    const left = [
      [cx - w, cy - h],       // top-left
      [cx, cy],               // center
      [cx, cy + s],           // bottom
      [cx - w, cy + h],       // bottom-left
    ];

    const right = [
      [cx + w, cy - h],       // top-right
      [cx + w, cy + h],       // bottom-right
      [cx, cy + s],           // bottom
      [cx, cy],               // center
    ];

    return { top, left, right };
  };

  // Center offset for SVG
  const centerX = size / 2;
  const centerY = size / 2 + cubeSize;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${centerX}, ${centerY})`}>
        {transformedCubes.map((cube, index) => {
          const paths = generateCubePath(cube.x, cube.y, cube.z);

          return (
            <g key={index}>
              {/* Top face */}
              <polygon
                points={paths.top.map(([x, y]) => `${x},${y}`).join(' ')}
                fill={CUBE_COLORS.top}
                stroke="#1a1a1a"
                strokeWidth="1"
              />
              {/* Left face */}
              <polygon
                points={paths.left.map(([x, y]) => `${x},${y}`).join(' ')}
                fill={CUBE_COLORS.left}
                stroke="#1a1a1a"
                strokeWidth="1"
              />
              {/* Right face */}
              <polygon
                points={paths.right.map(([x, y]) => `${x},${y}`).join(' ')}
                fill={CUBE_COLORS.right}
                stroke="#1a1a1a"
                strokeWidth="1"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
