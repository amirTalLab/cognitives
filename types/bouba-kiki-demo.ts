export type ShapeKind = 'rounded' | 'spiky';

export interface Trial {
  index: number;
  leftShape: ShapeKind;
  rightShape: ShapeKind;
  isControl: boolean;
}

export interface TrialResult {
  session_id: string;
  participant_name: string;
  trial_index: number;
  left_shape: ShapeKind;
  right_shape: ShapeKind;
  chosen_shape: ShapeKind;
  is_conventional: boolean;
  is_control: boolean;
  reaction_time_ms: number;
  is_practice: boolean;
}
