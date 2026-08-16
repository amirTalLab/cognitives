-- Storage for experiment stimulus images.
--
-- Run once, alongside experiment-definitions.sql and experiment-results.sql.
--
-- Most experiments need no files at all — shapes and text are drawn inline so that adding
-- an experiment never means adding an asset. But some effects ARE the image: mental
-- rotation needs those block figures, face inversion needs faces. Those files cannot live
-- in the repo, because a lecturer adding stimuli must not require a commit and a deploy.
--
-- Public read, because a participant's browser fetches them mid-trial with no session.

INSERT INTO storage.buckets (id, name, public)
VALUES ('experiment-assets', 'experiment-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Written through the same anon key as everything else. When accounts arrive, the write
-- policies narrow to the folder named after an experiment the lecturer owns — the paths
-- are already laid out as <slug>/<filename> for exactly that.
DROP POLICY IF EXISTS "read experiment assets" ON storage.objects;
CREATE POLICY "read experiment assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'experiment-assets');

DROP POLICY IF EXISTS "upload experiment assets" ON storage.objects;
CREATE POLICY "upload experiment assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'experiment-assets');

DROP POLICY IF EXISTS "replace experiment assets" ON storage.objects;
CREATE POLICY "replace experiment assets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'experiment-assets');
