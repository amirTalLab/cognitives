export type Emotion = 'fearful' | 'happy' | 'neutral';
export type Orientation = 'upright' | 'inverted';
export type Side = 'left' | 'right';

export interface Trial {
  emotion: Emotion;
  orientation: Orientation;
  identityId: string;
  side: Side;
  isPractice: boolean;
}

export interface TrialResult {
  session_id: string;
  participant_name: string | null;
  trial_index: number;
  emotion: string;
  orientation: string;
  identity_id: string;
  stimulus_set: string;
  side_shown: string;
  side_response: string;
  is_correct: boolean;
  reaction_time_ms: number;
  max_contrast: number;
  rescue_triggered: boolean;
  timing_flag: boolean;
  is_practice: boolean;
}
