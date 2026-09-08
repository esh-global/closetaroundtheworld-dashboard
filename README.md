# Resale Ledger

A filterable dashboard for your Poshmark, Mercari, Depop, and Vinted sales — brand, gender, type, color, ship-to destination, and days listed, plus a gender → brand → type breakdown. Static site, no backend, no login: your data lives in four CSV files.

## What's in here

```
index.html         page shell
styles.css          all styling
app.js              loads the CSVs, filters, sorts, renders
data/poshmark.csv    sample rows — replace with your export
data/mercari.csv     sample rows — replace with your export
data/depop.csv        sample rows — replace with your export
data/vinted.csv       sample rows — replace with your export
netlify.toml         tells Netlify this is a plain static site (no build step)
```

The four CSVs shipped in `/data` are made-up placeholder sales so you can see the dashboard working. Every sample row has `Sample` set to `yes`; once you add real rows, a checkbox appears letting you toggle sample rows in or out (they're excluded from the numbers by default the moment real rows exist).

## Preview it locally

Opening `index.html` directly by double-clicking it won't work — browsers block a page from `fetch()`-ing local files over the `file://` protocol, and this page fetches the CSVs. Run a tiny local server from this folder instead:

```
npx serve .
```

or, with Python already installed:

```
python3 -m http.server 8000
```

then visit the URL it prints (e.g. `http://localhost:8000`).

## Deploy to Netlify

**Fastest — drag and drop, no account setup beyond signing in:**

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag this whole folder (or a zip of it) onto the page.
3. Netlify gives you a live URL immediately.

**Or, for continuous deploys from GitHub:**

1. Push this folder to a new GitHub repo (make it private if your sales numbers are sensitive).
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Leave the build command empty and the publish directory as `.` — `netlify.toml` already says so.
4. Every push to the repo redeploys the site automatically.

## Updating your data

Export order/sales history as CSV from each marketplace's seller dashboard, then either:

- **Reformat to match** (most reliable): open the export in Excel/Numbers/Google Sheets, and put the columns in this order with these headers — a template `Sample` column is optional, only used to mark placeholder rows:

  | Brand | Type | Gender | Color | Price | Ship To | Date Listed | Date Sold | Sample |
  |---|---|---|---|---|---|---|---|---|

  Save as CSV, replacing the matching file in `/data` (keep the filename — `poshmark.csv` stays `poshmark.csv`, etc.).

- **Or just drop your raw export in as-is.** The page tries to auto-detect columns by common header names — see the alias list below. If a column doesn't get picked up, you'll notice it shows as "Unknown" or blank in the dashboard; rename that column's header in the CSV to one of the recognized names and reload.

Recognized header aliases (case-insensitive, partial match):

- **Brand** — `brand`, `designer`, `brand name`, `label`
- **Type** — `type`, `category`, `item category`, `item type`, `product category`
- **Gender** — `gender`, `department`, `size gender`
- **Color** — `color`, `colour`, `primary color`
- **Price** — `price`, `sale price`, `sold price`, `item price`, `order total`, `payout`, `earnings`
- **Ship To** — `ship to`, `shipping state`, `buyer state`, `state`, `country`, `buyer country`, `destination`
- **Date Listed** — `date listed`, `listed date`, `listing date`, `created date`
- **Date Sold** — `date sold`, `sold date`, `order date`, `purchase date`, `sale date`

Once your files are updated, redeploy (drag the folder in again, or push to GitHub if you set up continuous deploy) — that's the whole update cycle.

### Quick look before redeploying

The **Update my data** button on the page has a "preview only" option: pick a platform, choose a CSV from your computer, and it merges into the dashboard in that browser tab only — nothing is saved or written back. Refreshing the page discards it. Use it to sanity-check a file before you commit to replacing the one in `/data`.

## Limitations to know about

- No database, no accounts, no multi-device sync — the CSVs in the deployed folder are the only source of truth, and only a redeploy changes what everyone sees.
- There's no automatic pull from Poshmark/Mercari/Depop/Vinted — none of them expose a public API for this, so exporting and dropping in a CSV is the update mechanism.
- Keep a copy of your CSVs somewhere durable (a synced folder, or commit them to a private git repo) — if you only ever edit the deployed copy, losing that deploy loses your data.
