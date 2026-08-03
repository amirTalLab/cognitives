# DRM (Deese-Roediger-McDermott) Experiment Setup

## Overview
The DRM paradigm is a false memory experiment where participants study lists of semantically related words, then take a recognition test. The key finding is that participants often falsely "remember" critical lure words that were never presented but are strongly associated with the studied words.

## Setup Instructions

### 1. Create the Supabase Table
Before the DRM experiment can work, you need to create the database table:

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Run the SQL script from `supabase-drm-schema.sql`
4. This creates the `drm_results` table with proper security policies

### 2. Experiment Structure

**Routes:**
- `/drm` - Landing page with instructions
- `/drm/study` - Study phase (word presentation)
- `/drm/test` - Test phase (old/new recognition)
- `/drm/thanks` - Completion page
- `/drm/teacher` - Teacher dashboard with aggregate results

**Word Lists:**
The experiment uses 4 themed word lists:
1. **Sleep** - Critical lure: "sleep"
2. **Doctor** - Critical lure: "doctor"
3. **Chair** - Critical lure: "chair"
4. **Sweet** - Critical lure: "sweet"

Each list has:
- 12 studied words (presented during study)
- 1 critical lure (never presented, but semantically related)
- 4 related distractors (semantically related, not presented)
- 4 unrelated distractors (not related to the theme)

### 3. Experiment Flow

1. **Study Phase** (~3 minutes)
   - Participants see 48 words total (12 from each list)
   - Words presented for 2 seconds each
   - 500ms blank between words
   - Words from different lists are intermixed

2. **Test Phase** (~2 minutes)
   - 24 test items total per participant:
     - 12 studied words (3 from each list)
     - 4 critical lures (1 from each list)
     - 4 related distractors (1 from each list)
     - 4 unrelated distractors (1 from each list)
   - Participants respond "OLD" or "NEW" for each word
   - Response times are recorded

### 4. Key Measures

**Teacher Dashboard shows:**
- **Hit Rate**: % of studied words correctly identified as "OLD"
- **Critical Lure Rate**: % of critical lures falsely identified as "OLD" (the false memory effect!)
- **Related FA Rate**: % of related distractors falsely identified as "OLD"
- **Unrelated FA Rate**: % of unrelated distractors falsely identified as "OLD"

**Expected Results:**
- Critical lure rate typically very high (60-80%), demonstrating false memory
- Should be higher than related distractor rate
- Unrelated distractor rate should be lowest (baseline false alarm rate)

### 5. Color Scheme
The DRM experiment uses **purple** as its primary color to distinguish it from the Stroop experiment (emerald).

## Testing Locally

Before pushing to Vercel:
1. Make sure you've created the Supabase table
2. Test the complete flow: landing → study → test → thanks
3. Check that data is being saved to Supabase
4. View the teacher dashboard to see aggregate results
5. Test on mobile to ensure phone-friendly layout

## Educational Value

This experiment demonstrates:
- How memory is reconstructive, not like a video recording
- The role of semantic associations in memory
- How confidence and accuracy can dissociate (people are often confident in false memories)
- Source monitoring errors (confusing whether information was actually presented or just inferred)
