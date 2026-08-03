# DRM Experiment Changes Summary

## Overview
The DRM (Deese-Roediger-McDermott) false memory experiment has been completely redesigned based on your specifications.

## Major Changes

### 1. Word Lists (lib/drm/word-lists.ts)
- **Reduced from 10 to 6 word lists**
- **Each list now has exactly 12 words** (was 15)
- **All words translated to Hebrew**
- **Lists:**
  1. שינה (Sleep)
  2. רופא (Doctor)
  3. כיסא (Chair)
  4. מתוק (Sweet)
  5. הר (Mountain)
  6. קר (Cold)

- **Total study words: 72** (6 lists × 12 words)

### 2. Study Phase (app/drm/study/page.tsx)
- **Added 5-second breaks between lists**
  - Shows "הפסקה קצרה" (Short break)
  - Displays countdown: 5, 4, 3, 2, 1
  - Automatically continues after break
- Words are presented for 2 seconds each
- 500ms blank interval between words
- Total duration: ~3-4 minutes

### 3. Test Phase (app/drm/test/page.tsx)
- **New test item selection per list:**
  - 2 words from early positions (1-4)
  - 2 words from middle positions (5-8)
  - 2 words from late positions (9-12)
  - 1 critical lure (never presented)
  - 7 unrelated distractors
- **Total test items: 84** (6 lists × 14 items)

- **Added two-step response:**
  1. First: Old/New judgment ("כן, ראיתי" / "לא, לא ראיתי")
  2. Then: Confidence rating 1-4
     - 1 = בכלל לא בטוח (not sure at all)
     - 4 = מאוד בטוח (very sure)

### 4. Database Schema (supabase-drm-schema.sql)
- Updated `serial_position` constraint: 1-12 (was 1-15)
- Updated `confidence` constraint: 1-4 (was 1-5)
- Confidence is now properly collected for all responses

### 5. Teacher Dashboard (app/drm/teacher/page.tsx)
- Updated serial position curve to show positions 1-12 (was 1-15)
- Chart description updated to reflect 6 lists of 12 words
- All statistics calculations adjusted for new data structure

### 6. TypeScript Types (types/drm.ts)
- Updated `TestResponse.confidence` type: `1 | 2 | 3 | 4` (was `1 | 2 | 3 | 4 | 5`)
- Added proper documentation for confidence scale

## Data Structure

### Study Phase Output
- 72 words total (6 lists × 12 words each)
- Organized by list with breaks
- Serial positions 1-12 tracked per list

### Test Phase Output
- 84 test items per participant
- Each response includes:
  - word (Hebrew)
  - item_type (studied, critical_lure, unrelated_distractor)
  - serial_position (1-12 for studied items, null for others)
  - response (old/new)
  - is_correct (boolean)
  - reaction_time_ms (float)
  - confidence (1-4)

## Expected Results

### Recognition Rates
- **Hit Rate**: ~70-90% (studied words recognized as "old")
- **Critical Lure Rate**: ~60-80% (false memory effect!)
- **Unrelated FA Rate**: ~10-20% (baseline false alarms)

### Serial Position Curve
- **Primacy effect**: Positions 1-3 should show higher recall
- **Recency effect**: Positions 10-12 should show higher recall
- **Middle positions**: Lower recall (forgetting curve)

### Confidence Analysis
- People often have HIGH confidence in critical lures
- This demonstrates the strength of false memories in the DRM paradigm

## Files Modified

1. `lib/drm/word-lists.ts` - Core word lists and item selection logic
2. `app/drm/study/page.tsx` - Study phase with breaks
3. `app/drm/test/page.tsx` - Test phase with confidence ratings
4. `app/drm/teacher/page.tsx` - Dashboard updated for new structure
5. `types/drm.ts` - TypeScript interfaces updated
6. `supabase-drm-schema.sql` - Database schema updated
7. `LOCAL-TESTING-GUIDE.md` - Testing instructions updated

## Testing Checklist

Before deployment, verify:
- [ ] 6 word lists with exactly 12 Hebrew words each
- [ ] 5-second breaks appear between lists during study
- [ ] Study phase shows 72 words total
- [ ] Test phase shows 84 items total
- [ ] Confidence rating (1-4) appears after each old/new response
- [ ] Data saves correctly to Supabase with all fields
- [ ] Teacher dashboard displays results correctly
- [ ] Serial position curve shows positions 1-12

## Next Steps

1. Push changes to GitHub
2. Wait for Vercel deployment
3. Test complete flow at cognitives-xi.vercel.app/drm
4. Verify data in Supabase table
5. Check teacher dashboard displays results correctly
