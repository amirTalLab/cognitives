// Bouba-Kiki Experiment Logic
// Generate trials and utility functions

import { Trial } from '@/types/bouba-kiki';
import { STIMULI, CONFIG } from './stimuli';

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
/**
 * Generate main trials (2AFC: which shape matches the word?)
 */
export function generateMainTrials(): Trial[] {
  const trials: Trial[] = [];
  let trialId = 1;

  // Repeat words to reach desired trial count
  const totalWords = CONFIG.mainTrials;
  const wordsToUse = [];

  // Cycle through words to create 12 trials
  for (let i = 0; i < totalWords; i++) {
    wordsToUse.push(STIMULI.words[i % STIMULI.words.length]);
  }

  // Shuffle the word order
  const shuffledWords = shuffle(wordsToUse);

  // Sample shapes without replacement
  const roundedShapesPool = shuffle([...STIMULI.roundedShapes]);
  const spikyShapesPool = shuffle([...STIMULI.spikyShapes]);

  shuffledWords.forEach((wordObj, index) => {
    // Pick one rounded and one spiky shape
    const roundedShape = roundedShapesPool[index % roundedShapesPool.length];
    const spikyShape = spikyShapesPool[index % spikyShapesPool.length];

    // Randomly assign to left/right
    const roundedOnLeft = Math.random() < 0.5;

    trials.push({
      id: trialId++,
      word: wordObj.text,
      wordType: wordObj.type,
      leftShape: roundedOnLeft ? roundedShape : spikyShape,
      rightShape: roundedOnLeft ? spikyShape : roundedShape,
      leftShapeType: roundedOnLeft ? 'rounded' : 'spiky',
      rightShapeType: roundedOnLeft ? 'spiky' : 'rounded',
      isControl: false,
    });
  });

  return trials;
}

/**
 * Generate control trials (single shape: is this bouba or kiki?)
 */
export function generateControlTrials(): Trial[] {
  const trials: Trial[] = [];
  let trialId = 100; // Start at different ID to distinguish

  // 2 rounded, 2 spiky
  const shapesToUse = [
    { shape: STIMULI.roundedShapes[0], type: 'rounded' as const },
    { shape: STIMULI.roundedShapes[1], type: 'rounded' as const },
    { shape: STIMULI.spikyShapes[0], type: 'spiky' as const },
    { shape: STIMULI.spikyShapes[1], type: 'spiky' as const },
  ];

  shuffle(shapesToUse).forEach((shapeObj) => {
    // For control trials, we show single shape and ask "bouba or kiki?"
    // Store in leftShape, rightShape will be empty string
    trials.push({
      id: trialId++,
      word: 'CONTROL', // Special marker for control trials
      wordType: shapeObj.type, // Expected answer
      leftShape: shapeObj.shape,
      rightShape: '', // No second shape
      leftShapeType: shapeObj.type,
      rightShapeType: shapeObj.type, // Doesn't matter
      isControl: true,
    });
  });

  return trials;
}

/**
 * Generate all trials (main + control, shuffled)
 */
export function generateAllTrials(): Trial[] {
  const mainTrials = generateMainTrials();
  const controlTrials = generateControlTrials();

  // Combine and shuffle
  return shuffle([...mainTrials, ...controlTrials]);
}

/**
 * Check if response is correct based on conventional bouba-kiki mapping
 */
export function isResponseCorrect(trial: Trial, response: 'left' | 'right'): boolean {
  if (trial.isControl) {
    // For control: "Is this bouba or kiki?"
    // Response is interpreted as "bouba" (left) or "kiki" (right) in the experiment page
    // This function won't be used for control trials - they have different response format
    return false;
  }

  // For main trials: did they click the shape matching the word type?
  const selectedShapeType = response === 'left' ? trial.leftShapeType : trial.rightShapeType;
  return selectedShapeType === trial.wordType;
}
