# Johnny K's Content Hub

A free website for the 2027 video content program. Talent can browse the catalog of video ideas and request one to record. Managers can see the campaigns, the calendar and the production dashboard.

It runs on **GitHub Pages**, which is free. There's no server, database or monthly bill.

---

## What's in this folder

| File / folder | What it is | Do you edit it? |
|---|---|---|
| `index.html` | The website | No |
| `update.html` | Turns your Excel file into site data | No (you *use* it) |
| `js/config.js` | Your email, owner passcode line, site title | **Yes, once** |
| `js/suggestions.js` | Suggested showroom for each company-wide idea | Only if you want to change a suggestion |
| `data/content.js` | The site's data, made from your Excel file | You replace it to update |
| `css/`, `js/app.js`, `js/extract.js`, `vendor/` | The site's code | No |

---

## One-time setup (about 15 minutes)

### 1. Make a free GitHub account
1. Go to **github.com** and click **Sign up**.
2. Use your work email. Pick a username like `jkps-marketing`, because it will show up in the web address.
3. Verify your email.

### 2. Create a repository (the site's home)
1. When you're signed in, click the **+** in the top-right corner and choose **New repository**.
2. **Repository name:** `content-hub` (or anything you like; it becomes part of the link).
3. Choose **Public**. Free GitHub Pages needs a public repository.
4. Leave everything else as it is and click **Create repository**.

### 3. Upload the site files
1. On the new, empty repository page, click the link **uploading an existing file**.
2. Unzip `jkps-content-hub.zip` on your computer and open the folder.
3. Select **everything inside** the folder (`index.html`, `update.html`, `README.md`, and the `css`, `data`, `js` and `vendor` folders) and drag it all onto the GitHub page.
   - Drag the *contents*, not the folder itself. `index.html` has to sit at the top level.
4. Wait for every file to finish uploading, then click **Commit changes**.

### 4. Add your email address
1. In the repository, click the `js` folder, then `config.js`.
2. Click the **pencil icon** (Edit).
3. Put your work email between the quotes: `contactEmail: "you@johnnykspowersports.com",`
4. Click **Commit changes…**, then **Commit changes** again.

### 5. Turn on GitHub Pages
1. In the repository, click **Settings** (top menu), then **Pages** (left menu).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to `main` and the folder to `/ (root)`, then click **Save**.
4. Wait 1–2 minutes and refresh the page. A box appears with your link:
   `https://YOUR-USERNAME.github.io/content-hub/`

That's the link you send to managers and talent.

---

## Updating the site when the spreadsheet changes

1. Make your changes in Excel and **save** the file. Saving updates the formula results.
2. Open your site and add `update.html` to the end of the link:
   `https://YOUR-USERNAME.github.io/content-hub/update.html`
3. Drag your Excel file onto the page. It downloads a file called **content.js**. Nothing is uploaded anywhere during this step.
4. In GitHub, open the **data** folder → **Add file** → **Upload files** → drag in the new `content.js` → **Commit changes**.
5. Wait about a minute, then refresh the site. If you still see old content, press Ctrl+F5 (Windows) or Cmd+Shift+R (Mac).

**Columns the site reads from the IDEA LIBRARY:** Production Status, Scheduled Talent, Assigned To, Planned Film Date, Planned Post Date and so on. When you set **Scheduled Talent** or move an idea past *Approved*, it stops showing as "Open to record". Ideas set to **Dropped** are hidden from talent. Posts in the **PLACEMENTS** sheet show up on the campaign calendar and the dashboard.

**Never put on the site:** costs and rates, SESSIONS, FOOTAGE, ASSETS, the idea **Notes** and **Performance Notes** columns, and revenue/gross-profit columns. `update.html` leaves all of these out automatically. Don't upload the Excel file itself to GitHub, because anything in a public repository can be downloaded.

---

## Owner-only sections (Cardboard prompts + Brain Dump)

1. Open the site and click **Owner** at the very bottom of the page.
2. Create a passcode. The site shows you one line (`ownerPasscodeHash: "…",`).
3. In GitHub, edit `js/config.js`, paste that line right under the `contactEmail` line, and commit.
4. From then on, click **Owner** and enter your passcode on any device. You'll see the Cardboard prompt on every idea and the **🧠 Brain Dump** tab.

This is a passcode screen, not bank-level security. It hides the sections from everyone else, and the passcode itself is never stored on GitHub (only a scrambled version is). **Brain Dump notes are saved only in the browser you type them in.** They never go to GitHub. Use **Back up** to save a file and **Restore** to load it on another computer.

## Suggested showrooms

Store ideas suggest their own store. Each company-wide idea has a suggested store and a reason in `js/suggestions.js`. To override a suggestion from Excel, add a column named **Suggested Showroom** to IDEA LIBRARY. Whatever you type there wins.

"Bedford Heights" in the workbook shows as **Bedford** on the site, and `#BedfordHeights` becomes `#BedfordOhio`. Your workbook doesn't need to change.

## Sharing tips

- **Send talent straight to their store:** open the catalog, click their showroom (and department, if you want), then **Copy link to this view**.
- **Send one idea:** open it and click **Copy link**.
- **I have an idea** (top of every page) lets anyone email you a content idea.
- Requests arrive in your inbox with the subject *"Video request: V-XXX-000 – Title (Name)"*.
- "My Picks" and the Filming Planner are saved in each person's own browser. Nobody else sees them.

## Good to know

- Anyone with the link can view the site. Search engines rarely find small sites like this, but treat it as public.
- A custom address (like `content.johnnyks.com`) can be added later in Settings → Pages if the company owns the domain.
- To take the site down: Settings → Pages → **Unpublish**, or delete the repository.
