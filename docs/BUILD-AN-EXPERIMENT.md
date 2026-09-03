# Build an experiment with Claude Code

For a lecturer who wants to turn a paper — or an idea — into a working experiment students
can take, using their own Claude subscription instead of the site's metered API.

**You do not need to be able to program.** You describe the experiment; Claude writes it,
checks it, and shows it to you running. You approve or change it in plain language.

---

## Why this exists

There are two ways to build the same experiment:

| | The `/create` page | This, in a terminal |
|---|---|---|
| Where | the website, in a browser | your own computer |
| Cost | billed per paper to the lab's API key | **nothing** — your Claude subscription |
| Setup | none | ~15 minutes, once |
| Result | **identical** — the same experiment file, the same runtime |

If you are building one experiment, use the website. If you are building several, or
iterating on a design, this is free and faster.

---

## What you need

1. **A Claude subscription** with **Claude Code** installed —
   [claude.com/code](https://claude.com/code)
2. **Node.js 22.18 or newer** — [nodejs.org](https://nodejs.org) (take the LTS download)
3. **Git** — [git-scm.com](https://git-scm.com)
4. **The two Supabase keys**, from whoever runs the lab's project — *only needed to publish
   for students.* You can build and preview without them.

---

## One-time setup

Open a terminal and run these four commands.

```bash
git clone https://github.com/amirTalLab/cognitives.git
cd cognitives
npm install
npm run exp:setup
```

`exp:setup` tells you whether you are ready, and if not, the single thing to fix. A good
result looks like:

```
  ✓ Node 22.18.0           new enough
  ✓ Dependencies           installed
  ✓ Experiment schema      found
  ✓ Claude Code skills     2 of 2 found
  ✓ Supabase keys          set
  ✓ Supabase connection    reachable, and the definitions table is there

  Build and preview an experiment?  yes
  Publish it for students?          yes
```

### Adding the keys (only to publish)

Copy the example file and fill in the two values the lab gives you:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` and set:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Nothing else in that file matters for this. **You never need an Anthropic API key** — that
is what the website uses and what this avoids.

Run `npm run exp:setup` again; it should now say **yes** to publishing.

---

## Building an experiment

Start Claude Code in the project folder:

```bash
claude
```

Then type:

```
/experiment
```

…or go straight in:

```
/experiment papers/sternberg-1966.pdf
/experiment people judge whether two words are related, measuring reaction time
/experiment my own design: three set sizes, participants report whether a shape was in the set
```

**Anything behavioural fits.** Your own design, a task you can describe from memory, or an
experiment from a paper. It is not a library of famous paradigms — you are describing what
*you* want students to do, and most experiments built this way are new to the site.

If you are unsure whether an idea will fit, just describe it. Claude will tell you whether it
can be built, and if not, why — some things genuinely cannot be (see the end of this guide).

**From a paper?** Put the PDF in the `papers/` folder first, then give its path.

### What happens next

Claude walks you through the same steps the website does. It stops and waits at each one —
you are the one deciding.

**1. Which experiment** — for a paper, you get every experiment found in it, with a verdict
on whether it can be recreated in a browser. Some papers yield nothing usable, and Claude
will say so rather than invent something.

**2. The design** — a short table of the design before any code: conditions, timings, trial
counts, what counts as correct, the expected result. **Every value is marked as taken from
the paper or assumed by Claude.** This is the important moment. Papers almost never state
trial counts or exact timings, so those will be assumptions — change anything that looks
wrong. It is far easier to fix here than later.

**3. It gets built and checked** — Claude writes the experiment and runs the same validator
the website uses. It reports what the design actually produces: *"48 trials, 24 per
condition, about 6 minutes"*. Read that. It is where you find out a design is twice as long
as you meant.

**4. You try it** — in a second terminal:

```bash
npm run dev
```

Then open **http://localhost:3000/run/YOUR-SLUG** and take the experiment yourself for a few
trials. Also open **http://localhost:3000/run/YOUR-SLUG/teacher** and switch on **Mock
Data** to see the charts filled with a simulated class.

*Do not skip this.* Instructions, timings and button labels all look fine written down and
turn out wrong on screen.

**5. Change whatever you want** — just say it:

> make the fixation cross 800ms
> add a confidence rating after each choice
> that's too many trials, halve it
> the Hebrew instructions are awkward, say it like this: …

Claude edits it, re-checks it, and you refresh the page. Repeat as many times as you like —
it costs nothing.

**6. Publish** — when you are happy:

> publish it

The experiment is live immediately at **`https://YOUR-SITE/run/YOUR-SLUG`** for anyone with
the link. No deploy, no waiting.

---

## Giving it to students

Send them the `/run/YOUR-SLUG` link, or open the teacher dashboard and use the **Student QR**
button for a code they can scan from a projector.

Results appear on **`/run/YOUR-SLUG/teacher`** (the site password gets you in). **Refresh**
reloads, **Download CSV** gets the data for SPSS or R.

To have it appear on the site's homepage rather than only by link, ask Claude to *"list it
on the homepage"* — it will make the change and show you what it changed.

---

## If something goes wrong

**Run `npm run exp:setup` first.** It catches most problems and tells you the one thing to
fix.

| What you see | What it means |
|---|---|
| `Supabase connection — the project did not respond` | A free Supabase project sleeps when unused. Open its dashboard and resume it. |
| `Publish it for students? not yet` | The two keys are missing from `.env.local`. Building and previewing still work. |
| The page at `/run/...` is blank or says "No experiment named…" | The dev server is not running (`npm run dev`), or the slug is spelled differently. |
| `npm run exp:check` reports errors | Tell Claude — it wrote it, it fixes it. That check exists so a broken experiment cannot reach a class. |

---

## Useful commands

You will rarely type these yourself — Claude runs them — but they are here if you want them.

| Command | What it does |
|---|---|
| `npm run exp:setup` | Am I ready? What is missing? |
| `npm run dev` | Start the local site for previewing |
| `npm run exp:check -- experiments/SLUG.json` | Validate a design and describe what it builds |
| `npm run exp:publish -- experiments/SLUG.json` | Make it live for students |
| `npm run exp:unpublish -- SLUG` | Take it back down |
| `npm run exp:list` | What is currently published |
| `npm run exp:doctor` | Is the database healthy? |

---

## Two things worth knowing

**Publishing is immediate and shared.** There is no per-lecturer ownership yet: publishing a
slug that someone else used replaces theirs. Run `npm run exp:list` first if your slug is a
common word.

**The experiment file is the record.** `experiments/YOUR-SLUG.json` is the whole experiment.
Keep it — the published copy can always be rebuilt from it, and nothing else can rebuild the
file. If you are comfortable with git, commit it.
