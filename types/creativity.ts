export interface AUTObject {
  index: number;
  nameEn: string;
  nameHe: string;
}

export interface AUTEntry {
  session_id: string;
  participant_name: string | null;
  language: string;
  object_index: number;
  object_name: string;
  use_index: number;
  use_text: string;
  time_in_task_ms: number;
  is_practice: boolean;
}

export interface CircleEntry {
  session_id: string;
  participant_name: string | null;
  language: string;
  circle_index: number;
  label: string;
  drawing_data: string;
  response_time_ms: number;
  time_in_task_ms: number;
  is_practice: boolean;
}

export interface RATTriplet {
  index: number;
  words: [string, string, string];
  solution: string;
}

export interface RATEntry {
  session_id: string;
  participant_name: string | null;
  language: string;
  triplet_index: number;
  triplet_words: string;
  response: string;
  is_correct: boolean;
  skipped: boolean;
  response_time_ms: number;
  is_practice: boolean;
}
