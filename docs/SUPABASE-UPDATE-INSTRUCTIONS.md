# CRITICAL: Update Supabase Table Schema

## The Problem

You're seeing a "bug in saving results" error because the Supabase database table still has the OLD schema constraints, but the code is trying to insert data with the NEW structure.

**Old constraints:**
- `serial_position`: 1-15
- `confidence`: 1-5

**New constraints:**
- `serial_position`: 1-12 ✅
- `confidence`: 1-4 ✅

## Solution: Update Your Supabase Table

### Option 1: Recreate the Table (Recommended if no important data)

1. Go to https://supabase.com
2. Open your project: `dmbisztetqdygihmibtj`
3. Click "SQL Editor" in left sidebar
4. Run this command to drop the old table:
   ```sql
   DROP TABLE IF EXISTS drm_results;
   ```

5. Then run the entire contents of `supabase-drm-schema.sql` to create the new table:
   ```sql
   -- Copy and paste the ENTIRE contents of supabase-drm-schema.sql here
   ```

### Option 2: Alter Existing Table (If you have data to preserve)

1. Go to https://supabase.com
2. Open your project: `dmbisztetqdygihmibtj`
3. Click "SQL Editor" in left sidebar
4. Run these commands:

```sql
-- Update serial_position constraint
ALTER TABLE drm_results
DROP CONSTRAINT IF EXISTS drm_results_serial_position_check;

ALTER TABLE drm_results
ADD CONSTRAINT drm_results_serial_position_check
CHECK (serial_position >= 1 AND serial_position <= 12);

-- Update confidence constraint
ALTER TABLE drm_results
DROP CONSTRAINT IF EXISTS drm_results_confidence_check;

ALTER TABLE drm_results
ADD CONSTRAINT drm_results_confidence_check
CHECK (confidence >= 1 AND confidence <= 4);
```

## Verify It Worked

After updating the schema:

1. Go to "Table Editor" → `drm_results`
2. Try to manually insert a test row with:
   - `serial_position` = 12 (should work)
   - `confidence` = 4 (should work)
3. Try with `serial_position` = 13 or `confidence` = 5 (should FAIL)

## Then Test the Experiment

1. Go to https://cognitives-xi.vercel.app/drm
2. Complete the full flow
3. Check that data saves successfully
4. Verify in Supabase that you see 84 rows per participant

## Why This Happened

When you redesigned the experiment:
- Word lists changed from 15 to 12 words
- Confidence scale changed from 1-5 to 1-4

The code was updated, but the database constraints weren't updated yet on Supabase.
