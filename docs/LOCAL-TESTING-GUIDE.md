# Local Testing Guide for DRM Experiment

## Prerequisites
You need Node.js and npm installed on your machine.

## Step-by-Step Testing Instructions

### 1. Set Up the Database (ONE TIME ONLY)

Before testing, create the DRM results table in Supabase:

1. Go to https://supabase.com and log in
2. Open your project
3. Click "SQL Editor" in the left sidebar
4. Copy the entire contents of `supabase-drm-schema.sql`
5. Paste into the SQL editor
6. Click "Run" to execute
7. Verify the table was created by going to "Table Editor" → you should see `drm_results`

### 2. Start the Development Server

Open a terminal in the project directory and run:

```bash
cd "I:\My Drive\code\claudeCode\playin"
npm run dev
```

This will start the Next.js development server, usually at `http://localhost:3000`

### 3. Test the Complete Flow

#### A. Home Page
1. Open `http://localhost:3000` in your browser
2. You should see two experiment cards: "Stroop Effect" and "False Memory (DRM)"
3. Click on "False Memory (DRM)"

#### B. DRM Landing Page
1. You should see the DRM landing page with instructions in Hebrew/English
2. Enter a test name (e.g., "Test User")
3. Click "התחל ניסוי" (Start Experiment)

#### C. Study Phase
1. You'll see words presented one at a time in Hebrew
2. There are now **72 words total** (6 lists × 12 words each)
3. Each word appears for 2 seconds
4. **5-second break between lists** (shows countdown)
5. Progress bar shows your position (e.g., "12 / 72")
6. **Expected duration: ~3 minutes**
7. Wait for all words to complete (or you can refresh to skip for testing)

#### D. Test Phase
1. After study completes, you'll see "המשך לבדיקה" (Continue to Test)
2. Click it to go to the recognition test
3. You'll see **84 test items** (6 lists × 14 items each):
   - 36 studied words (6 per list: 2 early + 2 middle + 2 late positions)
   - 6 critical lures (never presented!)
   - 42 unrelated distractors (7 per list)
4. For each word, you'll answer TWO questions:
   - First: "כן, ראיתי" (Yes, I saw it - OLD) or "לא, לא ראיתי" (No, I didn't see it - NEW)
   - Then: Confidence rating 1-4 (1 = not sure at all, 4 = very sure)
5. Progress bar shows (e.g., "42 / 84")

#### E. Completion
1. After all 60 items, you'll see "!תודה" (Thank you!)
2. Data is automatically saved to Supabase

### 4. Check the Teacher Dashboard

1. Go to `http://localhost:3000/drm/teacher`
2. You should see:
   - **Total Participants**: 1 (or more if you tested multiple times)
   - **Total Responses**: 60 (or 60 × number of participants)
   - **Recognition Rates Chart**: Shows hit rate, critical lure rate, etc.
   - **Serial Position Curve**: NEW! Shows recall rate by position (1-15)

### 5. Expected Results

**Recognition Rates:**
- **Hit Rate** (studied words): Should be high (~70-90%)
- **Critical Lure Rate**: Should be surprisingly high! (~60-80%) - This is the false memory effect
- **Unrelated FA Rate**: Low (~10-20%) - baseline false alarm rate

**Serial Position Curve:**
- **Primacy effect**: Positions 1-3 should have higher recall (people remember first items)
- **Recency effect**: Positions 10-12 should have higher recall (people remember last items)
- **Middle positions**: Lower recall (the "forgetting curve")

**Confidence Ratings:**
- People often have HIGH confidence in false memories (critical lures)
- This is part of what makes the DRM effect so striking!

### 6. Mobile Testing

1. While the dev server is running, find your computer's local IP address:
   - Windows: Open CMD and type `ipconfig` → look for "IPv4 Address"
   - Mac/Linux: Type `ifconfig` → look for inet address

2. On your phone (connected to same WiFi), open:
   ```
   http://[YOUR-IP]:3000/drm
   ```
   Example: `http://192.168.1.100:3000/drm`

3. Test the complete flow on mobile - it should be phone-friendly

### 7. Verify Data in Supabase

1. Go to Supabase → Table Editor → `drm_results`
2. You should see 84 rows per participant
3. Check that columns include:
   - `session_id` (same for all 84 rows from one participant)
   - `participant_name` (your test name)
   - `word` (the word shown in Hebrew)
   - `item_type` (studied, critical_lure, unrelated_distractor)
   - `serial_position` (1-12 for studied items, null for others)
   - `response` (old/new)
   - `is_correct` (true/false)
   - `reaction_time_ms`
   - `confidence` (1-4)

### 8. Common Issues & Fixes

**Problem: "No data available yet"**
- Make sure you completed the full test flow
- Check Supabase table to verify data was saved
- Click "Refresh Data" on teacher dashboard

**Problem: Serial Position Curve is flat or empty**
- You need at least one participant to complete the experiment
- Make sure `serial_position` values are being saved (check Supabase)

**Problem: npm command not found**
- Install Node.js from https://nodejs.org
- Restart your terminal after installation

**Problem: Module not found errors**
- Run `npm install` in the project directory first
- This installs all dependencies

### 9. Clean Up Test Data (Optional)

To delete test data and start fresh:

1. Go to Supabase SQL Editor
2. Run: `DELETE FROM drm_results;`
3. This removes all rows from the table

## Ready to Deploy?

Once local testing looks good:
1. Commit all changes with git
2. Push to GitHub
3. Vercel will automatically deploy

The DRM experiment is now production-ready!
