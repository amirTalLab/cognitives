-- Creativity Battery: Alternative Uses Task
CREATE TABLE IF NOT EXISTS creativity_aut_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  language         text,
  object_index     int not null,
  object_name      text not null,
  use_index        int not null,
  use_text         text not null,
  time_in_task_ms  int,
  is_practice      boolean default false
);

ALTER TABLE creativity_aut_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON creativity_aut_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON creativity_aut_results FOR SELECT USING (true);
GRANT SELECT, INSERT ON creativity_aut_results TO anon, authenticated;

-- Creativity Battery: Thirty Circles Task
CREATE TABLE IF NOT EXISTS creativity_circles_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  language         text,
  circle_index     int not null,
  label            text not null,
  drawing_data     text,
  response_time_ms int,
  time_in_task_ms  int,
  is_practice      boolean default false
);

ALTER TABLE creativity_circles_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON creativity_circles_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON creativity_circles_results FOR SELECT USING (true);
GRANT SELECT, INSERT ON creativity_circles_results TO anon, authenticated;

-- Creativity Battery: Remote Associates Test
CREATE TABLE IF NOT EXISTS creativity_rat_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  language         text,
  triplet_index    int not null,
  triplet_words    text not null,
  response         text,
  is_correct       boolean,
  skipped          boolean default false,
  response_time_ms int,
  is_practice      boolean default false
);

ALTER TABLE creativity_rat_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON creativity_rat_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON creativity_rat_results FOR SELECT USING (true);
GRANT SELECT, INSERT ON creativity_rat_results TO anon, authenticated;
