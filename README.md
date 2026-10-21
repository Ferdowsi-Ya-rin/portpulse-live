# PortPulse BD: live route graph (newcomer guide)

A web page that shows which **real public data sources** are reporting, which places on the Dhaka to Chattogram route they inform, and what the analysis has found. It has a **night chart** and a **day chart** theme, like a ship's chart table.

**Rule of this project: real, public, cited data only.** Until you connect and run the collectors, every box says "no data" and that is correct. Nothing is made up.

You will do 9 steps. Budget about 1 to 1.5 hours the first time. Commands are for Windows PowerShell; Mac and Linux differences are noted.

---

## Step 1. Install the tools (once)
1. **Node.js**, version 22 or newer (LTS): download from nodejs.org and install with the defaults.
2. **Git**: download from git-scm.com and install with the defaults.
3. **VS Code** (optional but handy): code.visualstudio.com.
4. Open a **new** PowerShell window and check:
   ```
   node -v
   git --version
   ```
   `node -v` should print v22 or higher. If it prints something lower, reinstall Node.

## Step 2. Create your GitHub repository
1. Sign in at github.com. Click **+** (top right), then **New repository**.
2. Name it `portpulse-live`. Choose **Public**. **Do not** tick "Add a README", ".gitignore" or "license". Click **Create repository**.
3. Keep that page open; you will need its address later (it looks like `https://github.com/YOUR-NAME/portpulse-live.git`).

## Step 3. Create your Supabase project
Supabase is the online database that stores the readings and sends the live updates to the page. The free plan is enough.
1. Go to supabase.com and click **Start your project**. Sign in with GitHub (easiest).
2. Click **New project**.
   - **Name:** `portpulse-bd`
   - **Database password:** click Generate and **save it in a safe place**. This app never needs it, but you cannot see it again.
   - **Region:** pick the closest one to Bangladesh that is listed (Singapore or Mumbai if available).
   - **Plan:** Free.
3. Click **Create new project** and wait about 2 minutes until the dashboard finishes setting up.

## Step 4. Create the tables and copy your keys
**4a. Tables.**
1. In the left sidebar, open **SQL Editor**, then **New query**.
2. Open the file `supabase/live.sql` from this project, copy everything, paste it into the editor, and click **Run** (or press Ctrl+Enter).
3. You should see "Success". Open **Table Editor** in the sidebar: you should now see two tables, `signals` and `graph_snapshot`.
4. If the last line (`alter publication ...`) shows an error, open `graph_snapshot` in the Table Editor and turn **Realtime** on for that table instead.

**4b. Keys.** Click the **Connect** button at the top of the dashboard, or go to **Project Settings, then API (or API Keys)**. You need three values:
| What you copy | Looks like | Where it goes |
| --- | --- | --- |
| **Project URL** | `https://abcdxyz.supabase.co` | both URL lines in `.env.local` |
| **anon** key (newer projects call it **publishable**) | long text | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role** key (newer projects call it **secret**) | long text | `SUPABASE_SERVICE_ROLE_KEY` |

The labels in the dashboard change from time to time. If one kind of key is rejected, try the other kind.

**The service_role (secret) key can read and write everything. Never put it in the browser, in Vercel, in a screenshot, or in GitHub. Only in `.env.local` (which is never uploaded) and in GitHub Secrets (Step 8).**

## Step 5. Set up the project on your computer
1. Unzip `portpulse-live.zip`. Open the folder in VS Code (File, Open Folder), then open a terminal there (Terminal, New Terminal). Or in PowerShell: `cd` into the folder.
2. Install the code libraries (takes a minute):
   ```
   npm install
   ```
3. Create your settings file (Mac/Linux: use `cp` instead of `copy`):
   ```
   copy .env.example .env.local
   ```
4. Open `.env.local` and fill in all four lines using Step 4b. Use the same Project URL for both URL lines. **Save the file.** (On Windows make sure the file is really called `.env.local` and not `.env.local.txt`; turn on File name extensions in File Explorer, View menu.)
5. Run the tests. They check the maths and should all pass:
   ```
   npm test
   ```
6. Start the page:
   ```
   npm run dev
   ```
   Open http://localhost:3000. You should see the graph with every box grey and dashed ("not connected yet"), a **Setup check** card, and two ticks once the keys and tables are right. Stop the server any time with Ctrl+C.

## Step 6. Run the first analysis cycle
Open a **second** terminal (leave `npm run dev` running) in the same folder:
```
npm run cycle
```
It fetches the current readings from the public sources, stores them in Supabase, analyses them, and publishes the result. The output ends with a line like `cycle done: 214 readings collected, 2 findings, 0 collector errors`.
- The page at localhost:3000 updates **by itself** within a few seconds. Click any box to see its details and its recent readings.
- A line such as `collector failed: gdacs: ...` means that one source could not be read. The others still work. See Troubleshooting.
- Open Supabase **Table Editor, signals** to see the stored readings. Each row carries the URL it came from.

## Step 7. Push the project to GitHub
In the terminal, in the project folder (replace the address with yours from Step 2):
```
git init
git add .
git status
```
**Check the list printed by `git status`: `.env.local` must NOT appear.** (It is ignored on purpose.) If it appears, stop and ask for help before going on. Then:
```
git commit -m "Live route graph"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/portpulse-live.git
git push -u origin main
```
- If Git says it does not know who you are, run these once (with your own details) and repeat the commit:
  ```
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
  ```
- On the first push, a browser window opens so you can sign in to GitHub. Approve it.
- Refresh your repository page on GitHub: the files should be there.

## Step 8. Make it run automatically (every 15 minutes)
1. In your GitHub repository: **Settings, then Secrets and variables, then Actions, then New repository secret**. Add two secrets, with these exact names:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your service_role (secret) key
2. Open the **Actions** tab. If GitHub asks, click to enable workflows.
3. Click the workflow named **cycle**, then **Run workflow**, then the green button. After about a minute it should show a green tick. Click the run to read its log.
4. From now on it runs every 15 minutes by itself (GitHub can start a run a few minutes late). The page updates live each time.
Note: GitHub may pause scheduled runs on a repository that has had no activity for 60 days. Open the Actions tab and re-enable if that happens.

## Step 9. Put the page on the internet (recommended, free)
1. Go to vercel.com and sign in with GitHub. Click **Add New, then Project**, and import `portpulse-live`.
2. Under **Environment Variables**, add only these two (the safe ones):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   **Do not add the service_role key here.**
3. Click **Deploy**. In a minute you get a public address you can put in your submission (Links section) and in your video.

---

## What to check before you trust it
Network code was written from each service's public documentation but **has not been run against the live services by its author**. For each source in `src/lib/registry.ts`:
1. Open the source's website and read its terms (free tiers often allow research or non-commercial use only).
2. Run `npm run cycle`, then compare one reading in the Supabase `signals` table with the same value on the source's own page.
3. Fix any field name that differs in `src/lib/collectors.ts`.
Also verify the approximate coordinates in `LOCATIONS` on a map, and that the Bangladesh airport weather stations report.
Sources marked `NOT_CHECKED` need you to find the feed first. Sources marked "later" are not part of the 14-day prototype.

## What the analysis really does
Every finding is written from computed numbers by a template, and shows its sample size. It uses anomaly scores, sustained-shift detection, lead-lag correlation and rules learned from past real episodes. With too little history it says "not enough history" instead of guessing. Findings are correlations or past frequencies, not forecasts and not proof of cause.

## Not connected on purpose
CCTV or camera feeds (no lawful public feed is known; using cameras without the owner's permission is illegal), social-media feeds of individual people (privacy, terms, rumors), and other companies' private device data. The public equivalents are transponder broadcasts (AIS ships, ADS-B aircraft) and official notices.

## Troubleshooting
| You see | Do this |
| --- | --- |
| `node -v` shows a number below 22 | Reinstall Node from nodejs.org (LTS) and open a new terminal |
| `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY` | `.env.local` is missing, misnamed, unsaved, or the lines are empty |
| `could not store readings ... relation "signals" does not exist` | You have not run `supabase/live.sql` (Step 4a) |
| Page stuck on "Database reachable" | Wrong URL or anon key in `.env.local`, or re-run `live.sql` (it adds the read rule). Restart `npm run dev` after any change to `.env.local` |
| Page shows data only after you refresh | Realtime is off for `graph_snapshot` (Step 4a, point 4) |
| `collector failed: <name>` | The source blocked you, changed its format, or has no data for the place. Open its website, compare, and fix `collectors.ts`. Other sources keep working |
| `git push` is rejected | The GitHub repo was created with a README. Create a new empty one, or run `git pull origin main --allow-unrelated-histories` then push |
| Actions run is red | Open the run and read the log. Usually a secret name is misspelled or empty |
| You pushed a key by mistake | In Supabase, Project Settings, API: reset the key now. Then fix the file and push again |

## Files
| File | What it does |
| --- | --- |
| `src/lib/registry.ts` | Every source, place, route link, alert rule, location. Start here |
| `src/lib/analysis.ts` | The statistics. Pure and tested |
| `src/lib/engine.ts` | One analysis cycle |
| `src/lib/graph.ts` | Turns a cycle into the drawing |
| `src/lib/collectors.ts` | Fetches and parses each source |
| `src/components/*` | The page: map, panels, themes |
| `scripts/cycle.ts` | Collect, store, analyse, publish |
| `supabase/live.sql` | The database tables and rules |
| `.github/workflows/cycle.yml` | The 15-minute schedule |
| `tests/` | 25 tests. Their made-up numbers only check the maths and are never shown in the app |

## Costs
The free plans of GitHub, Supabase and Vercel should be enough for this. Pricing and limits change, so check each pricing page. Free Supabase projects can pause when unused; the scheduled cycle keeps activity going, but confirm in the dashboard.

## Joining the main PortPulse app later
Copy `src/lib` and `src/components` into the main app, use the same Supabase project, and the `events` table will feed the graph automatically.
