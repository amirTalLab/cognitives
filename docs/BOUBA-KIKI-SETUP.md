# Bouba-Kiki Experiment - Setup Instructions

## Step 1: Create Supabase Table

Before testing, you need to create the database table in Supabase:

1. Go to: https://supabase.com/dashboard/project/dmbisztetqdygihmibtj/sql
2. Copy the **entire contents** of `supabase-bouba-kiki-schema.sql`
3. Paste it into the SQL Editor
4. Click "Run" to execute

This will create the `bouba_kiki_results` table with all necessary columns and indexes.

## Step 2: Test Locally

Run the development server:

```bash
cd "I:\My Drive\code\claudeCode\playin"
npm run dev
```

Then open your browser to: http://localhost:3000

## Step 3: Test the Experiment End-to-End

1. **Home Page**: Click on the "Bouba-Kiki Effect" card (indigo color with Shapes icon)
2. **Intro Page**:
   - Enter your name
   - Click "Start Experiment"
3. **Experiment**:
   - Complete all 16 trials (12 main + 4 control)
   - Main trials: Choose which shape (left/right) matches the word
   - Control trials: Choose if the shape is more "bouba" or "kiki"
4. **Results Page**:
   - Verify accuracy statistics display correctly
   - Check charts render properly
   - Test "Download Data (CSV)" button
   - Test "View Teacher Dashboard" button
5. **Teacher Dashboard**:
   - Should show your completed session
   - Check aggregate statistics
   - Check charts render
   - Test "Download All Data (CSV)" button

## Step 4: Verify in Supabase

After completing the experiment:

1. Go to: https://supabase.com/dashboard/project/dmbisztetqdygihmibtj/editor
2. Select the `bouba_kiki_results` table
3. You should see 16 rows (one per trial)
4. Verify columns have correct data

## Expected Results

- **Total trials**: 16 (12 main + 4 control)
- **Main trials**: Show two shapes, word displayed ("BOUBA", "KIKI", etc.)
- **Control trials**: Show one shape, ask "bouba or kiki?"
- **Data saved**: All 16 rows in Supabase

## Common Issues

### Issue: "Supabase not initialized"
- Check that `.env.local` exists and has correct credentials
- Restart the dev server after adding `.env.local`

### Issue: TypeScript errors
- Run `npm run build` to check for compilation errors
- Fix any type errors before testing

### Issue: Shapes not displaying
- The ShapeDisplay component uses inline SVG, so should work without image files
- Check browser console for any errors

## Files Created

```
app/bouba-kiki/
├── page.tsx                    # Intro page
├── experiment/page.tsx         # Main experiment
├── results/page.tsx            # Individual results
├── teacher/page.tsx            # Teacher dashboard
└── thanks/page.tsx             # Completion page

types/bouba-kiki.ts             # TypeScript definitions

lib/bouba-kiki/
├── stimuli.ts                  # Stimulus configuration (easy to modify)
└── experiment.ts               # Trial generation logic

components/bouba-kiki/
└── ShapeDisplay.tsx            # SVG shape renderer

supabase-bouba-kiki-schema.sql  # Database schema
```

## Next Steps

After successful local testing:

1. Commit all files to git
2. Push to GitHub
3. Vercel will auto-deploy
4. Test on production: https://cognitives-xi.vercel.app/bouba-kiki

---

**Status**: Ready for local testing
**Last Updated**: 2026-01-30
