export type Group = 'A' | 'B';
export type Language = 'en' | 'he';

export type QuestionType =
  | 'multiple-choice'
  | 'multi-select'
  | 'likert'
  | 'free-number'
  | 'higher-lower'
  | 'interactive-rule'
  | 'multiplication-estimate';

export interface QuestionOption {
  en: string;
  he: string;
  value: string;
}

export interface QuestionDef {
  code: string;
  type: QuestionType;
  split: boolean;
  textA?: { en: string; he: string };
  textB?: { en: string; he: string };
  text?: { en: string; he: string };
  options?: QuestionOption[];
  likertMin?: { en: string; he: string };
  likertMax?: { en: string; he: string };
  likertRange?: number;
  unit?: { en: string; he: string };
  multiSelectNote?: { en: string; he: string };
}

export interface AnchoringBlock {
  code: string;
  screen1: QuestionDef;
  screen2: QuestionDef;
}

export interface QuestionUnit {
  type: 'single' | 'anchoring-block' | 'interactive-rule' | 'multiplication-block';
  question?: QuestionDef;
  block?: AnchoringBlock;
}

export interface RuleTriple {
  numbers: [number, number, number];
  fits: boolean;
}

export interface LogicsResponse {
  session_id: string;
  participant_name: string | null;
  language: string;
  group_assignment: string;
  question_code: string;
  response: string;
  response_numeric: number | null;
  reaction_time_ms: number;
  question_order: number;
  rule_triples_json: string | null;
  rule_guess: string | null;
}
