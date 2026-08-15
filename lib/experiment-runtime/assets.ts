// Uploading stimulus images.
//
// Straight from the browser to Supabase storage, not through an API route: the route would
// add Vercel's 4.5MB body cap and a base64 inflation of ~33% to something that is already
// the largest thing this pipeline moves. The bucket takes the same anon key the rest of
// the site uses.
//
// Run supabase/schemas/experiment-assets.sql once before this works.

import { getSupabase } from '@/lib/supabase';
import type { AssetManifest } from './schema';

export const ASSET_BUCKET = 'experiment-assets';

/** Matches what the terminal path accepts, so a definition behaves the same either way. */
const ALLOWED = /\.(png|jpe?g|gif|webp|svg)$/i;

/** Per file. Stimuli are small; a 10MB upload is a photo nobody resized, not a stimulus. */
const MAX_BYTES = 5 * 1024 * 1024;

export interface UploadResult {
  manifest?: AssetManifest;
  /** Files that did not upload, with the reason, so a partial success is still usable. */
  failed: { name: string; reason: string }[];
  error?: string;
}

/**
 * Uploads files under the experiment's slug and returns the manifest to store on it.
 *
 * `existing` is merged in so adding three more images later does not drop the first ten —
 * the manifest is what the validator checks against, so losing an entry turns a working
 * experiment into a broken one.
 */
export async function uploadAssets(
  slug: string,
  files: File[],
  existing?: AssetManifest,
): Promise<UploadResult> {
  const sb = getSupabase();
  if (!sb) return { failed: [], error: 'Supabase is not configured, so there is nowhere to put the files.' };

  const failed: UploadResult['failed'] = [];
  const uploaded: string[] = [];

  for (const file of files) {
    if (!ALLOWED.test(file.name)) {
      failed.push({ name: file.name, reason: 'not an image (png, jpg, gif, webp or svg)' });
      continue;
    }
    if (file.size > MAX_BYTES) {
      failed.push({ name: file.name, reason: `${(file.size / 1024 / 1024).toFixed(1)}MB — over the 5MB limit` });
      continue;
    }

    const { error } = await sb.storage
      .from(ASSET_BUCKET)
      .upload(`${slug}/${file.name}`, file, { upsert: true, contentType: file.type || undefined });

    if (error) {
      const missing = /bucket not found/i.test(error.message);
      if (missing) {
        return {
          failed,
          error: 'The experiment-assets bucket does not exist yet. Run supabase/schemas/experiment-assets.sql in the Supabase SQL editor, then upload again.',
        };
      }
      failed.push({ name: file.name, reason: error.message });
      continue;
    }
    uploaded.push(file.name);
  }

  const { data } = sb.storage.from(ASSET_BUCKET).getPublicUrl(`${slug}/`);
  const merged = [...new Set([...(existing?.files ?? []), ...uploaded])].sort();

  return {
    manifest: { base: data.publicUrl.endsWith('/') ? data.publicUrl : `${data.publicUrl}/`, files: merged },
    failed,
  };
}
