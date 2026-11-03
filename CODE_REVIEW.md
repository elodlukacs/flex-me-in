# fe-hunt — Code Review & Improvement Backlog

**Reviewed:** 2026-07-28 · **Scope:** all of `src/` (~3,416 LOC, 41 files) + repo hygiene, docs, packaging, and new-source research.

**Stack:** React 19 + Ink 6 (TUI) · TypeScript strict, ESM/NodeNext · better-sqlite3 · tsup · Groq for AI filtering.

**State at review time:** branch `main`, 3 commits ahead of origin. Uncommitted changes in `src/api/justjoinit.ts`, `src/components/layout/HelpText.tsx`, `src/hooks/useKeyboardHandler.ts`. `npx tsc --noEmit` is clean (0 errors).

**Implemented sources (ground truth, `src/state/types.ts:7`):** `remoteok`, `weworkremotely`, `remotive`, `linkedin`, `justjoinit`. AI provider is **Groq** (`GROQ_API_KEY`, default model `openai/gpt-oss-120b`), not Anthropic.

> Note for whoever picks this up: every line reference below was verified against the working tree at the commit above. If files have moved, re-locate by symbol name rather than trusting the line number.

---

## Table of contents

- [P0 — Blocking correctness bugs](#p0--blocking-correctness-bugs)
- [P1 — Significant bugs & UX defects](#p1--significant-bugs--ux-defects)
- [P2 — Smaller bugs and cleanups](#p2--smaller-bugs-and-cleanups)
- [Documentation is describing a different app](#documentation-is-describing-a-different-app)
- [Packaging, tooling, repo hygiene](#packaging-tooling-repo-hygiene)
- [Proposed refactor: declarative keybinding table](#proposed-refactor-declarative-keybinding-table)
- [New job sources (endpoints verified live 2026-07-28)](#new-job-sources-endpoints-verified-live-2026-07-28)
- [Suggested execution order](#suggested-execution-order)

---

## P0 — Blocking correctness bugs

### P0-1 · `generateJobId` collapses distinct postings and orphans user state

**Where:** `src/db/helpers.ts:3-9`

`generateJobId` is `sha256(source + ':' + title + ':' + company)`, ignoring the stable per-posting id every source already provides.

Two failure modes:

1. **Silent data loss.** LinkedIn routinely lists one role across several geos/req-ids with identical title+company. `parseCards` (`src/api/linkedin.ts:156`) dedupes by the real `jobId`, so both cards enter the array — then `upsertJobs` runs both in one transaction and the second overwrites the first. `FETCH_DONE` reports `jobs.length` (e.g. 80) while the DB gained fewer rows.
2. **Orphaned status.** A company editing "Senior Frontend Dev" → "Senior Frontend Engineer" mints a brand-new id, so the user's `applied`/`ignored` state is stranded on a row that no longer matches and the job reappears as `new`.

**Fix:** change the signature to `generateJobId(source, nativeId)` and pass the real id per source:

| Source | Native id |
|---|---|
| `justjoinit` | `offer.slug` |
| `linkedin` | numeric id from `data-entity-urn` |
| `remoteok` | `raw.id` |
| `remotive` | `raw.id` |
| `weworkremotely` | `guid` (already typed in `src/api/types.ts:23`) |

Keep the title+company hash only as a fallback when no native id exists. **This is a breaking id change** — either write a one-time migration that remaps `status` from old ids to new, or accept a one-off loss of applied/ignored state and say so in the commit message.

---

### P0-2 · Re-fetching permanently fakes freshness

**Where:** `src/db/repository.ts:15`, plus `src/api/justjoinit.ts:83-84`, `src/api/common.ts:94`, `src/api/remotive.ts:9`, `src/api/weworkremotely.ts:24`

The upsert does `date_posted = excluded.date_posted`, and four clients fall back to `new Date()` when the upstream feed has no date.

**Failure:** a job whose feed entry lacks a date is stamped `date_posted = today` on *every single fetch*. `getFilteredJobs` sorts `ORDER BY date_posted DESC` (`repository.ts:79`), so that stale job pins itself to the top of the table forever, above genuinely new postings. The freshness ordering the whole app is built around is corrupted.

**Fix:**
- Never fabricate a date. Make `datePosted` nullable end-to-end.
- In the upsert: `date_posted = COALESCE(excluded.date_posted, jobs.date_posted)` — a real date wins once, a blank never overwrites.
- Add a `first_seen_at` column, set on insert only, and sort on `COALESCE(date_posted, first_seen_at)`.
- Related: all fallback dates use `new Date().toISOString()` (UTC). For a user at UTC+2, between 00:00 and 02:00 local, "today" is stamped as yesterday. Use a local-date helper.

---

### P0-3 · A timeout is indistinguishable from user cancellation, and tears down the whole fetch

**Where:** `src/api/common.ts:10`, `src/hooks/useFetcher.ts:57-59`, `src/state/reducer.ts:221-242`, `src/api/linkedin.ts:210`

`fetchWithTimeout` aborts its *internal* controller with a plain `AbortError`. `useFetcher` checks `err.name === 'AbortError'` and dispatches `FETCH_CANCELLED`. The reducer then sets `isFetching: false` **globally** with `statusMessage: 'Fetch cancelled'`.

**Failure:** RemoteOK times out at 30s while LinkedIn is still paging → the UI flips to "Fetch cancelled", `isFetching` goes false, the user presses `f` again → `fetchSources` aborts the still-running LinkedIn fetch. One slow host cancels everything and reports it as a user action. Same conflation at `linkedin.ts:210`, where a timeout re-throws and abandons the remaining 11 geo searches instead of skipping one.

**Fix:**
- In `fetchWithTimeout`, track whether the timer fired; throw `new Error('Request timed out')` with `name = 'TimeoutError'`. Only propagate `AbortError` when the caller's `signal.aborted` is actually true.
- `FETCH_CANCELLED` without a `source` should only clear `isFetching` if no source is still in `fetching` state.

---

### P0-4 · The timeout doesn't cover the response body

**Where:** `src/api/common.ts:30-33`

`clearTimeout` runs in `finally`, i.e. as soon as **headers** arrive. Every caller then does `await resp.text()` / `.json()` *outside* the guard. A stalled body (LinkedIn slow-dripping HTML; `weworkremotely.ts:39`) hangs that source forever with no timeout and no progress — and `isFetching` never clears, so the UI is stuck.

**Fix:** either move body consumption inside the guarded scope (have `fetchWithTimeout` return parsed text/JSON), or use `AbortSignal.any([signal, AbortSignal.timeout(ms)])`, which stays armed across the body stream.

---

### P0-5 · Exactly one job per page is invisible and unreachable — ~half with the AI panel open

**Where:** `src/hooks/useTerminalSize.ts:13`, `src/hooks/useLayout.ts:22-26`, `src/components/jobs/MainJobTable.tsx:21-22`, `src/components/jobs/JobTable.tsx:133-135`, `src/state/reducer.ts:63`, `src/components/jobs/Pagination.tsx:12`

Two independent sources of truth for the same number:
- `pageSize = max(5, height - 6)`
- `mainVisibleRows = max(1, availableRows - 1)` where `availableRows = max(6, height - 6)` → i.e. `pageSize - 1`, and roughly **half** of `pageSize` when `aiActive`.

`MainJobTable` slices `pageSize` jobs, `JobTable` renders only `slice(0, maxRows)`, and `NAVIGATE` clamps selection to `min(pageJobCount, mainVisibleRows) - 1`. So the last job of every page is never rendered and never selectable — while `Pagination` still counts it. On a 40-row terminal with the AI panel open, ~17 of 34 jobs on the page can be neither seen nor selected.

**Fix:** delete `pageSize` and `SET_PAGE_SIZE` entirely; make `mainVisibleRows` the single page size everywhere (selectors, reducer, `Pagination`). The AI panel already does this correctly by keying off `aiVisibleRows` (`selectors.ts:27`).

Better still (see [P1-8](#p1-8--ux-replace-paging-with-a-scrolling-viewport)): replace paging with a scrolling viewport.

---

### P0-6 · Groq: `max_tokens: 1024` truncates and silently discards whole batches of 100 jobs

**Where:** `src/api/groq.ts:3` (`BATCH_SIZE = 100`), `groq.ts:40` (`max_tokens: 1024`), `groq.ts:78`, `groq.ts:86-88`

Token arithmetic: each output object is `{"id":"weworkremotely_1a2b3c4d5e6f7a8b","remote":"yes"},` — the 16-char hex hash alone is ~8-10 tokens, ~20 tokens per object. Past roughly 50 matches out of 100, the array exceeds 1024 tokens, the response is cut mid-object, `JSON.parse` throws, and the `catch` at `groq.ts:86` swallows it with a `console.error`. **100 jobs vanish from the AI panel with no signal in the UI.** `openai/gpt-oss-120b` is a reasoning model whose reasoning output shares that same budget, making truncation likelier still.

**Fix — all of these:**
- Replace `max_tokens` (**deprecated on Groq**) with `max_completion_tokens: 8192`.
- Set `reasoning_effort: 'low'` — this is classification, not reasoning.
- Set `temperature: 0` (currently defaults to 1.0 for a deterministic task).
- Check `data.choices[0].finish_reason === 'length'` and treat it as a hard error, not a parse failure.
- Have the model echo the **batch index** (`0..99`) instead of the 27-char id, then map back locally. ~3× fewer output tokens and it eliminates id hallucination.
- Add `response_format: { type: 'json_schema', json_schema: { …, strict: true } }` — constrained decoding is supported on this model and makes the ```` ```json ```` fence-stripping at `groq.ts:78` unnecessary.

**Cost context, worth documenting:** at $0.15/$0.60 per M tokens, ~600 jobs ≈ 6 batches ≈ **$0.01–0.02 per run**. Cost is a non-issue; silent data loss is the problem.

---

### P0-7 · One 429 discards every Groq batch accumulated so far

**Where:** `src/api/groq.ts:66-69`

`throw` on `!response.ok` unwinds the whole loop, dropping `allResults` from batches 1..n-1. `useAiFilter` turns that into `AI_FILTER_ERROR`, so the user gets nothing for work already paid for. There is no retry, and the `retry-after` header (which Groq specifically returns on 429) is ignored.

**Fix:** retry 429/5xx up to 3 times honoring `retry-after`, else exponential backoff with jitter. On final failure, return `allResults` with a partial-success flag instead of throwing.

---

### P0-8 · `console.error` corrupts the Ink frame

**Where:** `src/api/groq.ts:87`, `src/api/linkedin.ts:211` (and benignly `src/index.tsx:14`)

These write to stdout/stderr **while `fullscreen-ink` owns the alternate screen buffer**, garbling the rendered frame mid-fetch.

**Fix:** add a ~10-line `logError()` in `src/utils/` that appends to `~/.flex-me-in/error.log`, and surface a one-line summary through the existing `SET_STATUS` / snackbar channel.

---

### P0-9 · `Ctrl+D` wipes the DB, undocumented, and leaves the AI table orphaned

**Where:** `src/hooks/useKeyboardHandler.ts:246-253`, `src/db/repository.ts:113-116`, `src/state/reducer.ts:38-41`, `src/db/database.ts:18`

`clearAllJobs()` runs `DELETE FROM jobs` only — no `CLEAR_AI_FILTER`, no `saveAiFilteredJobs([])`.

**Failure:** the AI panel keeps rendering rows for jobs that no longer exist; pressing `a` on one writes an `UPDATE` matching nothing. On next launch, `createInitialState` reads `getAiFilteredResults()` → non-empty → `aiFilterStatus: 'done'`, while `getAiFilteredJobs()`'s INNER JOIN returns `[]` — so `useLayout` reserves half the screen for a **permanently empty AI panel**.

On top of that: `Ctrl+D` is muscle-memory for EOF/exit on many terminals, there is no confirmation, and it is documented nowhere.

**Fix:**
- `clearAllJobs` deletes both tables in one transaction; dispatch `CLEAR_AI_FILTER` alongside.
- Declare `FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE` on `ai_filtered_jobs`. `database.ts:18` already sets `foreign_keys = ON` but **no FK is ever declared**, so `purgeNewJobsBySources` orphans rows on every fetch too.
- Add a confirm step: `Ctrl+D` → "Delete all N jobs? y/N". Document it.

---

### P0-10 · Partial failure is reported as complete success

**Where:** `src/state/reducer.ts:190-200` (`FETCH_DONE`), `reducer.ts:244-250` (`FETCH_ALL_DONE`), `src/hooks/useFetcher.ts:62-64`, `src/components/fetch/ProgressBar.tsx:29`

`FETCH_ALL_DONE` unconditionally sets `'Fetch complete'` / `statusType: 'success'`, overwriting the per-source error `SET_STATUS`. The stored `status.error` string is never rendered anywhere — `SourceChip` shows only a `✗` glyph.

**Failure:** LinkedIn 403s and JustJoin.IT 429s while three sources succeed → the user sees an unqualified green "Fetch complete" and few or no jobs.

**Fix:** in `FETCH_ALL_DONE`, count `status === 'error'` entries in `fetchStatus` and emit `'Fetch complete — N/5 sources failed'` with `statusType: 'error'`. Render `status.error` in a details view or an expandable line.

---

### P0-11 · `string-width` is an undeclared dependency

**Where:** `src/utils/format.ts:1` vs `package.json`

It resolves today only via ink's hoisted transitive install. A pnpm / Yarn-PnP install, or ink bumping majors, breaks the build. Add `"string-width": "^8.2.0"` to `dependencies`.

---

## P1 — Significant bugs & UX defects

### P1-1 · `q` quits the app instead of closing overlays

**Where:** `src/hooks/useKeyboardHandler.ts:42` (quit), `:48-49` (popup), `:57-58` (theme picker)

Quit is handled *before* the popup and theme-picker branches, so the `input === 'q'` checks inside those branches are unreachable — yet `JobPopup.tsx:66` says "Esc/q close" and `ThemePicker.tsx:32` says "(Esc/y to close)". Pressing `q` to dismiss a popup **exits the app**.

**Fix:** move the quit binding *after* the overlay branches. Overlays already `return` on unhandled keys, so quit stays reachable in normal mode. Consider confirming quit while a fetch is in flight.

### P1-2 · Per-source fetch (keys `1`-`5`) is unreachable dead code

**Where:** `src/hooks/useKeyboardHandler.ts:8-14` (`SOURCE_KEYS`), `:84-95` (`TAB_KEYS`), `:145-149`, `src/hooks/useFetcher.ts:85` (`fetchOne`), `src/app/AppShell.tsx:15-17`

`TAB_KEYS` matches the same digits `1`-`6` first and unconditionally `return`s, so the per-source fetch branch can never fire and `fetchOne` — plumbed all the way down from `AppShell` — can never be invoked. **The app currently has no way to refresh a single source.** The uncommitted `HelpText.tsx` change to `['1-6', 'source']` documents the tabs and leaves the fetch-one feature silently absent.

**Fix:** pick a distinct binding (`Shift+1..6`, `F1..F6`, or `F` = "fetch current tab's source") and delete whichever map you don't keep. Also hoist `TAB_KEYS` out of the handler — it's re-allocated on every keypress at `:84`.

### P1-3 · Job-popup scrolling is advertised but not wired

**Where:** `src/components/jobs/JobPopup.tsx:14` (unused `scrollOffset`), `:66` (renders `▲ j/k scroll ▼`), `src/hooks/useKeyboardHandler.ts:48-54`

`setScrollOffset` is never called, and the handler swallows every key except Esc/`q` while the popup is open. The app's primary read path truncates at ~`height-8` lines behind a visible-but-lying affordance.

**Fix:** add `POPUP_SCROLL` / `POPUP_SCROLL_PAGE` actions with the offset in the store, clamped against `wrappedLines.length`; handle `j/k/↑/↓/PgUp/PgDn/g/G` in the popup branch. Also allow `o` (open URL) from inside the popup, and show `workType` + the AI remote verdict there.

### P1-4 · The new `G` binding destroys persisted AI results but is labelled "hide AI"

**Where:** `src/hooks/useKeyboardHandler.ts:132-137`, `src/db/repository.ts:157`, `src/components/layout/HelpText.tsx:11`

`saveAiFilteredJobs([])` `DELETE`s the entire `ai_filtered_jobs` table, then `CLEAR_AI_FILTER` fires. The help text calls it "hide AI" and the status says "AI panel dismissed". Collapsing a panel should not require a new paid Groq round-trip to undo, and there's no confirmation.

**Fix:** add an `aiPanelVisible` boolean that hides without touching state or the DB — **or** keep the destructive behaviour, relabel it `clear AI`, and say in the status message that results were discarded.

### P1-5 · Tabbing into an empty/erroring AI panel traps navigation

**Where:** `src/hooks/useKeyboardHandler.ts:98-103`, `src/state/reducer.ts:326`

`TOGGLE_PANEL_FOCUS` is allowed whenever `aiFilterStatus !== 'idle'` — including `filtering` and `error`, when `aiJobs` is empty. `AI_NAVIGATE` then returns state unchanged, so `j/k/←/→` all appear broken until the user guesses Tab again.

**Fix:** gate on `state.aiJobs.length > 0`, and set `aiPanelFocused: false` in `AI_FILTER_START` / `AI_FILTER_ERROR`.

### P1-6 · Changing the theme doesn't recolor job rows

**Where:** `src/components/jobs/JobTable.tsx:15-25` (`statusSymbols`, `remoteDisplay`), `:80-86` (`JobRow` comparator), `src/utils/theme.ts:253`, `:279`

`colors` is a live getter object, but `statusSymbols`/`remoteDisplay` are evaluated once at module load, and `JobRow`'s custom `memo` comparator ignores the theme — so memoized rows keep the old palette while the rest of the UI switches. `sourceColors` mutation is likewise invisible to memoized rows.

**Fix:** subscribe to `themeId` in `JobTable` and include it in the comparator (or pass a resolved `palette` object as a prop); make `statusSymbols`/`remoteDisplay` functions of the active theme.

### P1-7 · Chrome height budget is wrong — bottom rows clip and the layout jumps

**Where:** `FIXED_CHROME = 6` duplicated in `src/hooks/useTerminalSize.ts:5` and `src/hooks/useLayout.ts:4`; `src/app/AppContent.tsx:32`

The constant accounts for TitleBar, TabBar, Pagination, ProgressBar, HelpText, StatusBar at one row each. It does **not** account for: the bordered `AiPanel` (~3 rows even when `status === 'idle'`, `AiPanel.tsx:53,68-72`), the bordered `Snackbar` (~3 rows for 1s after every `o`), `FilterBar` (1 row when filters are active), `TextInput` (1 row in input mode), or a HelpText taller than one row. With `height={terminalHeight}` on the root Box, the surplus is clipped at the bottom — so pressing `o` visibly shoves the layout.

**Fix:** derive chrome height in **one** place from the same state the components read (`aiActive`, `snackbar.visible`, `inputMode`, `hasActiveFilters`) and export it to both hooks. Render `AiPanel` only when `aiActive`. Make the snackbar a single unbordered line inside the StatusBar row.

### P1-8 · UX: replace paging with a scrolling viewport

Beyond fixing [P0-5](#p0-5--exactly-one-job-per-page-is-invisible-and-unreachable--half-with-the-ai-panel-open): a single `mainVisibleRows`-tall window over the full result set with a scroll indicator means nothing is ever unreachable, and it frees `←/→` for tab switching.

### P1-9 · HelpText overflows anything narrower than ~185 columns

**Where:** `src/components/layout/HelpText.tsx:5-23`

17 bindings with `|` separators ≈ 184 columns of content in a `Box` with `gap={1}` and no `flexWrap` (default `nowrap`). At 80-120 columns the tail bindings (`y:theme`, `1-6:source`, `q:quit`) are squeezed or clipped, or the row grows past its 1-row budget. The uncommitted `G` addition makes it worse.

**Fix:** build the footer from a priority-ordered subset trimmed to `terminalWidth`; move the full list into a `?` overlay (which the README already documents and which is currently bound to nothing).

### P1-10 · Selection is signalled by background colour only

**Where:** `src/components/jobs/JobTable.tsx:51-56`, `src/components/jobs/MainJobTable.tsx:28`

The selected row gets `backgroundColor: colors.surface` + `bold`/accent title. Under `NO_COLOR`, 8-colour or `TERM=dumb` terminals, or themes whose `surface` is near-`background` (ayu: `#1A1F29` on `#0B0E14`), the cursor is effectively invisible. `MainJobTable` passes `selectedIndex={-1}` while the AI panel is focused, so the main list then has **no cursor at all** and the user loses their place on every Tab. The applied-row background `'#2a3325'` is a hardcoded non-theme colour.

**Fix:** glyph gutter (`▶` / `›`) as the primary cursor with `inverse` as secondary; render the unfocused panel's cursor dimmed rather than removing it; move `'#2a3325'` into the theme.

### P1-11 · Resizing the terminal resets page and selection

**Where:** `src/hooks/useTerminalSize.ts:14`, `src/state/reducer.ts:269`

`SET_PAGE_SIZE` fires on every width *or* height change and the reducer resets `page: 0, selectedIndex: 0`. Dragging a window edge loses the user's place. It also dispatches two actions (two render passes) per resize event.

**Fix:** recompute `page` from the absolute row index to preserve position, and coalesce into one `SET_TERMINAL_SIZE` (dropping `SET_PAGE_SIZE` per P0-5).

### P1-12 · `g` sends every filtered job to Groq with no cap, progress, or cost hint

**Where:** `src/hooks/useKeyboardHandler.ts:127`, `src/api/groq.ts:19`

On a few thousand rows that's dozens of *sequential* API calls behind a bare spinner. **Fix:** report `batch k/n` progress through the existing `FETCH_PROGRESS`-style channel, and confirm above a threshold.

### P1-13 · Late AI results are silently dropped if filters changed mid-flight

**Where:** `src/state/reducer.ts:294`

Results are intersected with `state.jobs` at apply time. Changing a filter during the multi-batch request can reduce that to zero matches while the status reads "AI found 0 matching roles".

**Fix:** match against the job-id set that was actually submitted (carry it in `AI_FILTER_START`) and report drops explicitly.

### P1-14 · LinkedIn's EMEA filter matches on 2-letter substrings

**Where:** `src/api/linkedin.ts:19-22`, `:51`, `:62`

The list includes `'UK'` and `'Wales'`, matched via `lower.includes(c.toLowerCase())`. So `"Fukuoka, Japan"` contains `uk` → passes as EMEA; `"New South Wales, Australia"` → passes. `'Ireland'` is listed **twice** (lines 20 and 22). Separately, `isEMEAJob` returns `true` for an empty location, so any card whose location regex fails is admitted rather than rejected.

**Fix:** match whole tokens (`/\buk\b/`), or drop the free-text list entirely — you already fetch by `geoId`, which the comment at `:28` correctly calls "far more reliable". Keep only the negative US/LATAM check.

### P1-15 · LinkedIn: 120 unauthenticated scrapes per fetch, and a 403 doesn't stop it

**Where:** `src/api/linkedin.ts:194`, and the geo × page loops

Worst case is 12 geos × 10 pages = 120 requests at 800 ms spacing. When a geo returns 403 the outer loop still tries the remaining 11, deepening the block.

**Fix:** track a global block flag and bail out of `fetchLinkedIn` on the first 403. See also the source-health note on LinkedIn's fragility below.

### P1-16 · WeWorkRemotely: entities never decoded, raw HTML stored as description

**Where:** `src/api/weworkremotely.ts:40` (`processEntities: false`), `:66`, `src/api/remoteok.ts:31`, `src/components/jobs/JobPopup.tsx:20-40`

Titles and companies keep literal `&amp;` / `&#39;` ("Company &amp; Co"). `item.description` — raw HTML — goes straight into the DB (RemoteOK too) and `JobPopup` renders it verbatim, so the detail view shows `<p>`/`<li>` markup.

**Fix:** run titles/companies through `decodeHTMLEntities` (or set `processEntities: true`), and add a `stripHtml()` to `common.ts` applied at ingest: `<br>` → `\n`, `</p|li|div>` → `\n`, strip remaining tags, decode entities, collapse blank runs.

Two bugs in `decodeHTMLEntities` itself (`src/api/common.ts:39,46-47`): it uses `String.fromCharCode`, which mangles code points above `0xFFFF` (`&#128640;` → garbage instead of 🚀) — use `String.fromCodePoint`; and it decodes `&amp;` **first**, so `&amp;#39;` double-decodes into `'`. Decode `&amp;` last.

### P1-17 · `extractCountry` mangles Remotive locations

**Where:** `src/api/common.ts:98-102`, `src/api/remotive.ts`

It returns the last comma-separated segment, but Remotive's `candidate_required_location` is a *list of permitted regions*, not `City, Country`. `"USA, UK, Canada"` → country `"Canada"`; `"Europe, LATAM"` → `"LATAM"`. The country column and the `m` filter are wrong for most Remotive rows.

**Fix:** don't reuse `extractCountry` for Remotive — store the string as-is (it's a constraint, not a location), or add `extractRegions()` returning a normalized list and match the filter with `LIKE` against the whole field.

---

## P2 — Smaller bugs and cleanups

**Correctness**

- `src/state/store.ts:52-66` — `getSnapshot` is `useCallback(…, [store])`, so it **permanently captures render #1's `selector`**. Every current call site uses a constant selector so nothing is broken yet, but `useStore(s => s.jobs[props.index])` would return the first-render value forever. Fix: keep the latest selector/comparator in refs updated each render and read them inside `getSnapshot`.
- `src/api/common.ts:104-120` — `determineWorkType` checks `office`/`onsite` against joined *tags* before honoring `remote: true`. RemoteOK sends `remote = true` plus tags, so a tag like "back office" classifies a remote-only board's job as `onsite`. Check the explicit `remote` flag first when it's authoritative.
- `src/api/common.ts:50-66` — `abortableDelay` adds its `abort` listener without `{ once: true }` and never removes it on the reject path (`fetchWithTimeout` does this correctly at `:18`). Minor leak across LinkedIn's ~120 delays.
- `src/db/repository.ts:19` — `description = excluded.description` wipes a stored description when a later fetch omits it. Use `COALESCE(NULLIF(excluded.description,''), jobs.description)`.
- `src/db/repository.ts:16` — the `status = COALESCE((SELECT status FROM jobs WHERE id = excluded.id AND status != 'new'), excluded.status)` clause is redundant; `excluded.status` already carries that COALESCE from the VALUES clause. Just omit `status` from `DO UPDATE SET` — leaving it untouched is exactly the intended semantics and far easier to read.
- `src/api/justjoinit.ts:95` (uncommitted) — hardcoding `workType: 'remote'` is *correct* given the `workplaceType !== 'remote'` guard at `:78` (the replaced ternary was already dead), but add a comment pointing at that guard so it doesn't read as a bug. Also `categories[]=1` at `:51` is an undocumented magic constant — name it.

**Database**

- `src/db/database.ts:24-34` — migrations are ad-hoc `table_info` probes ordered *before* `CREATE TABLE IF NOT EXISTS`, keyed on `cols.length > 0`. Works today, doesn't scale, no version record. Use `PRAGMA user_version` with a numbered migration array in a transaction.
- Add `CREATE INDEX idx_jobs_date_posted ON jobs(date_posted DESC)` — the sole `ORDER BY` (`repository.ts:79`) has no supporting index.
- Add `PRAGMA busy_timeout = 5000` — WAL is on (`database.ts:17`) but two concurrent app instances will hit `SQLITE_BUSY`.
- Drop `idx_jobs_title_company` — `LOWER(title) LIKE '%…%'` (`repository.ts:66-72`) can never use it. If case-insensitive search matters, use `title LIKE @title COLLATE NOCASE` and drop the `LOWER()`.
- `closeDb()` (`database.ts:63`) is **never called** — no `exit`/`SIGINT` handler invokes it, so WAL checkpointing relies on process teardown.
- `src/db/repository.ts:94-105` and `:181-185` duplicate identical row→`Job` mapping. Extract `rowToJob()`.

**Robustness**

- **No error boundary anywhere.** `new Database(path)` (`database.ts:16`) is first reached from the `useJobLoader` effect (`useJobLoader.ts:11`). A `SQLITE_NOTADB`/`SQLITE_CORRUPT` throw propagates through Ink's render with nothing to catch it; `main().catch` at `index.tsx:13` can't help since the throw is async-in-render. Because `withFullScreen` has already switched to the alt screen, the user gets a garbled or blank terminal. Fix: try/catch around `getDb()` reporting the path and suggesting deletion, plus an error boundary around `AppShell` that restores the screen before printing.
- Missing-API-key handling is genuinely good — guarded at `useAiFilter.ts:13` and `groq.ts:15`, and the message names the right env var. Only the README is wrong. Missing db/config dirs are handled (`mkdirSync` recursive). Corrupt `config.json` is handled (falls back to `one-dark`).

**Dead code** (all verified zero-caller)

- `showHelp` state + `TOGGLE_HELP` action — `types.ts:66,107`, `reducer.ts:34,262`. Nothing dispatches or reads them, and `?` is bound to nothing.
- `SET_FILTER` action — `types.ts:93`, `reducer.ts:101`.
- **All of `src/state/context.ts`** (`useAppState`) — superseded by the `useSyncExternalStore` store in `a9604ae`.
- `formatDate`, `padLeft` — `src/utils/format.ts:18,35`.
- `selectPagedJobs`, `selectTotalPages`, `selectHasActiveFilters`, `selectAiFilteredJobs`, `selectAiTotalPages` — `src/state/selectors.ts`. `MainJobTable`/`Pagination`/`AiPanel` reimplement the paging math inline instead. Either use the selectors or delete them.
- `src/hooks/useAiFilter.ts:29-32` — the `jobs.length === 0` branch is unreachable; `nonLinkedInJobs.length === 0` at `:23` always fires first, so a user with zero jobs gets the misleading "No jobs to filter (LinkedIn excluded)". Delete the branch and fix the message.
- `input === 'c' && key.ctrl` (`useKeyboardHandler.ts:42`) never fires — Ink swallows Ctrl+C before user handlers when `exitOnCtrlC` is on, and exits itself.
- `JobPopup.tsx:48,64` — `borderBottom` / `borderTop` with no `borderStyle` on those Boxes render nothing.

**Performance**

- `JobPopup.tsx:20-40` re-wraps the entire description on **every** render (the popup re-renders whenever `AppContent` does — status changes, snackbar, resize), and measures with `line.length` while the rest of the codebase correctly uses `stringWidth`. CJK/emoji descriptions overflow the box and grow its height, breaking the fixed layout. Fix: `useMemo` on `[description, maxLineWidth]` and wrap on `stringWidth` — add a `wrapText(str, width)` helper to `format.ts` next to `truncate`.

**Type safety** — two `any` violations against the project's own AGENTS.md rule: `src/api/weworkremotely.ts:43` (`const items: any[]`) and `src/hooks/useAiFilter.ts:46` (`catch (err: any)`). `useFetcher.ts:55` shows the correct `unknown` + narrowing pattern.

---

## Documentation is describing a different app

### README.md

| Claim | Reality |
|---|---|
| "8+ remote job boards", lists Himalayas, Arbeitnow, Indeed, Hacker News | **5 sources.** Those four were deleted in `ad4637f`. **JustJoin.IT is missing from the list entirely.** |
| "Uses Claude AI to intelligently filter jobs" | Groq — `https://api.groq.com/openai/v1/chat/completions`, default `openai/gpt-oss-120b`. `src/api/claude.ts` no longer exists. |
| `ANTHROPIC_API_KEY=your_api_key_here` | Code reads only `GROQ_API_KEY` (+ optional `GROQ_MODEL`). **Following the README verbatim produces "Set GROQ_API_KEY env var" at runtime.** |
| Tech Stack + Acknowledgments credit "Claude AI" | Same. |
| `1-9` "Filter by specific source" | Actual range is `1-6`; keys 7-9 do nothing. Note the tab keys are **offset by one** from source order because `1` = "all". |
| `?` toggles help | Bound to nothing. |
| "Node.js 18+" | better-sqlite3@12 declares `20.x‖22.x‖23.x‖24.x‖25.x`; ink@6 and open@11 need `>=20`. **Node 18 cannot run this.** |
| `[LICENSE](LICENSE)`, MIT badge | **No LICENSE file.** And `package.json` says `"license": "ISC"`. Pick one, write the file, make all three agree. |
| `[contributing guidelines](CONTRIBUTING.md)` | **File does not exist** — dangling link. |
| CI badge → `.github/workflows/main.yml` | **No `.github/` directory** — badge renders broken. |
| Release badge | No git tags exist. |
| All badges → `github.com/elodlukacs/flex-me-in` | Directory is `fe-hunt`, IntelliJ module is `.idea/fe-hunt.iml`, AGENTS.md and PLAN.md both title it `fe-hunt`, package name is `flex-me-in`. **Three names for one project** — resolve this first, then fix the badges and clone instructions. |

**Undocumented bindings:** `Ctrl+D` (**wipes the entire jobs table**), `n` (mark job new), `G` (dismiss AI panel — in HelpText but not README), `Ctrl+S` (cancel in-flight fetch), `Ctrl+C` (quit), `m`, `w`, `u`.

**Understated behaviour:** `Tab` silently no-ops unless `aiFilterStatus !== 'idle'`; `s`/`w`/`u` cycle over *values present in the DB* (`getDistinctValues`), so they do nothing on an empty database.

Accurate: the Rich Filtering list, `~/.flex-me-in/config.json` (theme id only), and the Project Structure tree.

### AGENTS.md

- **"Use React Context for global app state (see `src/state/context.ts`)"** and "Use in components via `useContext(AppContext)`" — **there is no `AppContext`.** State is a custom `useSyncExternalStore` store (`src/state/store.ts`, `useStore(selector)` / `useStoreInstance()`), added in `a9604ae`. `context.ts` exports only the dead `useAppState`. **This guidance actively steers agents onto the path the perf commit deliberately abandoned — fix it first.**
- "Working with Themes: apply via `useApp()` which provides `state.themeId`" — wrong twice: there is no app-level `useApp()` (the only one is Ink's, used solely for `exit()`), and there is no `themeId` on `AppState` — theme lives in `theme.ts` module state + `~/.flex-me-in/config.json`.
- "Use `useReducer` for complex state logic" — the reducer exists but is driven by the custom `Store` class, not `useReducer`.
- "External API clients (**ArbeitNow**, Remotive, etc.)" — ArbeitNow no longer exists.
- **The "Adding a New Job Source" recipe is incomplete.** It lists 4 steps but omits three required registrations that the JustJoin.IT commit had to touch: `fetcherMap` (`src/hooks/useFetcher.ts:14`), `sourceLabels` + `updateSourceColors()` (`src/utils/theme.ts:271-285`), and `TAB_KEYS`/`SOURCE_KEYS` (`src/hooks/useKeyboardHandler.ts:8,84`).
- "Enums: PascalCase with PascalCase members" — no enums anywhere; dead guidance.
- Header says `fe-hunt`; package says `flex-me-in`.
- Accurate: no test framework, no ESLint/Prettier, `npx tsc --noEmit`, ESM `.js` import extensions, the build/dev/start commands.

### PLAN.md

Predates the last three commits and is misleading in **both** directions:

- Lists **Himalayas and ArbeitNow as done** — both removed in `ad4637f`.
- Lists **LinkedIn as "high priority, to add"** — it's fully implemented and the most complex client in the tree.
- **Indeed and Hacker News were implemented and then removed**, but the plan gives no hint they were tried and rejected, so someone will rebuild them. Document the "drop low-signal sources" decision.
- **JustJoin.IT, the newest source, appears nowhere.**
- "Multiple AI providers… already have Claude integration - expand" — that integration was *replaced* by Groq.
- Lists "view full description in-app" as to-do; it shipped in `7c96e2e`.

---

## Packaging, tooling, repo hygiene

### `npm pack` ships a stale copy of the whole repo

`npm pack --dry-run` reports **110 files, 1.3 MB packed / 1.7 MB unpacked**, including:

- `.claude/worktrees/condescending-matsumoto-f57741/` — a **complete stale duplicate of the repo**, with its own `package-lock.json` (97.6 kB), a second `screenshot.png` (614.5 kB), duplicate AGENTS/README/PLAN, and the *deleted* `src/api/arbeitnow.ts`, `claude.ts`, `hackernews.ts`, `himalayas.ts`, `indeed.ts`.
- `.claude/settings.local.json` **twice** — local tool-permission config with no business in a published package.
- The real `screenshot.png` (614.5 kB), all of `src/`, and `tsconfig.json` — none needed at install time for a bundled CLI.

`dist/index.js` (93 kB) *is* included despite `dist/` being gitignored, because npm force-includes `main`/`bin` targets — so the `bin` isn't dangling, but that's accidental: any future multi-file build (chunks, sourcemaps, a second entry) would be silently dropped from the tarball while the smoke test still passes.

**One line fixes all of it:** `"files": ["dist"]` → roughly 30 kB gzipped.

### Other publish blockers

- `"author": ""` is empty; no `repository` field (no source link or provenance on npmjs.com).
- No `engines` → npm can't warn Node 18 users before they hit a native-module failure.
- No `prepublishOnly: "npm run build"` → trivially easy to publish a stale `dist/`.
- `"version": "1.0.0"` with zero git tags and no CHANGELOG.
- Name availability on the npm registry is **unverified** — run `npm view flex-me-in` before committing to it, and resolve the `flex-me-in` / `fe-hunt` split first.
- License is contradictory (ISC in manifest, MIT in README, no LICENSE file) — unpublishable as stated.

### Committed / on-disk artifacts

- **No secrets, ever — clean.** `git log --all --diff-filter=A --name-only` over all 6 commits shows `.env` was never committed. It exists on disk with only `GROQ_API_KEY` and is correctly gitignored. **No history rewrite needed.**
- **`.idea/` is tracked** (`.idea/.gitignore`, `.idea/fe-hunt.iml`, `.idea/modules.xml`). `git rm -r --cached .idea` + gitignore. Bonus: `fe-hunt.iml` is the one committed place carrying the `fe-hunt` name.
- `dist/` correctly gitignored and untracked.
- **`screenshot.png` is 604 KB** for a terminal capture — 15-30× larger than needed, and permanently in history as of `b7697c6`. `oxipng`/`pngquant` or WebP gets it to 20-40 KB losslessly for a TUI. Re-committing won't shrink the clone (the blob stays), so this is "fix before more images land", not urgent.
- **`.claude/` is untracked but 90 MB on disk**, almost entirely the leftover `worktrees/condescending-matsumoto-f57741` with its own `node_modules`. Gitignore it before something sweeps it into a commit. Deleting the stale worktree reclaims ~90 MB — **confirm before removing**, it may hold uncommitted work.
- `CLAUDE.md` was committed and later deleted — it's still in history if it held anything machine-specific.
- **`.gitignore` additions:** `.idea/`, `.claude/`, `*.tgz`, `.DS_Store`.

### tsconfig gaps

Reasonable strict baseline (`strict: true`, `NodeNext`, `ES2022`), missing the checks that matter here:

- **`noUncheckedIndexedAccess` — highest-value flag to add.** The codebase indexes records constantly (`TAB_KEYS[input]`, `SOURCE_KEYS[input]`, `sourceColors[tab.id]`, `data.choices[0]`) and several sites already hand-guard with `||`/`?.`, i.e. the author is doing the compiler's job manually. Expect a handful of errors to fix.
- `noUnusedLocals` / `noUnusedParameters` — would have caught the dead code above.
- `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch` (the reducer is one big switch) — cheap wins.
- `outDir`/`rootDir`/`declaration`/`sourceMap` are **vestigial** — tsc never emits, tsup does. Harmless but misleading: a stray `npx tsc` would scatter untracked `.js` into `dist/` alongside the bundle.
- **No `@types/node` in devDependencies** and no `"types": ["node"]`, yet `src/` uses `process.env`, `homedir()`, `mkdirSync`. This works only via a transitive pull from `@types/better-sqlite3`. If that edge changes, you get confusing `Cannot find name 'process'` errors. Add it explicitly.

### tsup

There is **no `tsup.config.ts`** — the entire build is the CLI string `tsup src/index.tsx --format esm --dts --clean`.

- No `--platform node` / `--target node20`; it infers acceptably from tsconfig today, but that's implicit and can shift with tsup versions.
- **`--dts` is pointless** for a `bin`-only package: it emits a `dist/index.d.ts` containing literally one line, `#!/usr/bin/env node` (verified), and it's the slowest part of the build. Drop it.
- No `banner` for the shebang — it survives only because it happens to be the first line of `src/index.tsx`. `banner: { js: '#!/usr/bin/env node' }` makes it intentional.
- **better-sqlite3 is handled correctly** — verified in `dist/index.js`: `better-sqlite3`, `ink`, `react`, `fast-xml-parser`, `fullscreen-ink`, `dotenv` all stay bare external imports, and `open` is a dynamic import. tsup's default (externalize `dependencies`) is exactly right for a native addon. `npm link` and `npm i -g` both resolve it and trigger `prebuild-install`. No action needed — but the prebuilt ABI is per-Node-major, so `nvm` users who switch majors after a global install get `NODE_MODULE_VERSION` mismatches. Worth a README troubleshooting line.

### Minimal tooling setup (proportionate to 3.4k LOC, personal CLI)

Nothing currently exists: no tests, linter, formatter, CI, pre-commit hook, `engines`, `.env.example`, or error logging. Six small files:

`package.json`:
```json
"engines": { "node": ">=20" },
"files": ["dist"],
"license": "MIT",
"repository": { "type": "git", "url": "git+https://github.com/<user>/<repo>.git" },
"scripts": {
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "format": "prettier --write .",
  "lint": "oxlint src",
  "check": "npm run typecheck && npm run lint && npm run test",
  "prepublishOnly": "npm run build"
}
```
devDeps: `vitest@^3.2.4`, `prettier@^3.6.2`, `oxlint@^1.0.0`, `@types/node`. (Confirm versions with `npm view <pkg> version`.)

Why oxlint over ESLint here: zero config, no `typescript-eslint` + flat-config + `eslint-plugin-react-hooks` chain to maintain, and it catches the react-hooks and unused-vars classes that actually matter in this codebase. If you want the canonical react-hooks rules, `eslint@^9` + `typescript-eslint@^8` + `eslint-plugin-react-hooks@^5` with a 20-line `eslint.config.js` is the only reason to pay the extra cost.

`.prettierrc` — `{ "singleQuote": true, "printWidth": 100 }` (matches existing style).

`.env.example`:
```
# Groq API key for the AI relevance filter (optional — app works without it)
GROQ_API_KEY=
# Optional model override; defaults to openai/gpt-oss-120b
GROQ_MODEL=
```

`.github/workflows/ci.yml` — one job, no matrix:
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run check
      - run: npm run build
```

**Pre-commit:** skip husky. A 3-line `.git/hooks/pre-commit` running `npm run typecheck` is enough for a solo repo; CI covers the rest.

**Tests worth writing — ~6 files, not a coverage target.** All the high-value targets are pure, zero-mock:

- `src/state/reducer.ts` (the largest file, completely untested — pagination clamping, filter cycling, AI panel focus transitions)
- `generateJobId`, `parseTitle`, `decodeHTMLEntities`, `extractCountry`, `determineWorkType`
- **`parseCards` (`src/api/linkedin.ts`) against a saved HTML fixture** — 80 lines of regex against markup that can change without notice. A fixture test is the only thing that will tell you it *broke* rather than "LinkedIn is blocking us".
- RSS/JSON fixtures through the `weworkremotely.ts` / `justjoinit.ts` parsers — this is where sources silently break.
- `src/utils/format.ts`
- `upsertJobs` — point `getDbPath()` at `:memory:` or a temp dir and pin the status-preserving and date-preserving semantics (P0-1, P0-2).

---

## Proposed refactor: declarative keybinding table

`src/hooks/useKeyboardHandler.ts` is 256 lines mixing four concerns in one function: mode routing, key matching, guard conditions, and effects (DB writes + `open` + dispatch). **P1-1, P1-2 and P1-5 are all *shadowing* bugs that a flat if-chain structurally cannot surface.** Restructure as data:

```ts
type Mode = 'input' | 'popup' | 'themePicker' | 'normal';
type Ctx = { state: AppState; dispatch: Dispatch; deps: { fetchAll; fetchOne; cancelFetch; runAiFilter; exit } };

interface Binding {
  id: string;
  match: (input: string, key: Key) => boolean;
  hint?: { keys: string; label: string };   // drives HelpText AND the README table
  when?: (s: AppState) => boolean;          // guard, not an ordering accident
  run: (ctx: Ctx) => void;
}

const BINDINGS: Record<Mode, Binding[]> = { input: [...], popup: [...], themePicker: [...], normal: [...] };

const resolveMode = (s: AppState): Mode =>
  s.inputMode !== 'none' ? 'input'
  : s.showJobPopup ? 'popup'
  : s.showThemePicker ? 'themePicker'
  : 'normal';
```

The handler becomes: `resolveMode` → first binding in that mode whose `match` **and** `when` both pass → `run`.

Payoffs:
- `HelpText` and the README table both `map` over `BINDINGS.normal.filter(b => b.hint)` — kills the doc drift permanently.
- A unit test asserts no two bindings in a mode match the same key — kills P1-1 and P1-2 **as a class**.
- Guards become explicit instead of positional.
- The job-status effects (`a`/`i`/`n`) collapse into one `setStatus(target)` helper, removing three near-identical 8-line blocks at `:211-238`.
- Keep `store.getState()` inside `run` so the existing stale-closure avoidance is preserved.

---

## New job sources (endpoints verified live 2026-07-28)

### Health of the existing 5

| Source | Status | Note |
|---|---|---|
| RemoteOK | Live (`https://remoteok.com/api`, ~600 KB, `last_updated` fresh) | ToS in the payload's `legal` field **requires visible attribution + a direct dofollow link**. robots.txt now carries `Content-Signal: ai-train=no` and `Disallow: /` for ClaudeBot/GPTBot/CCBot; the JSON API is still blessed in `/llms.txt`, but you're formally in "attribute or don't use" territory. Also `?tags=front-end` works and your client doesn't use it. |
| WeWorkRemotely | Live | You're on the generic `remote-jobs.rss`. **`https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss`** (200, 119 KB) is a free signal upgrade. |
| Remotive | Live | robots.txt disallows `/jobs/*` HTML but not `/api`. Fine. |
| LinkedIn | **Fragile** | `jobs-guest/.../seeMoreJobPostings` still works but 429s after ~10 pages/IP — your `MAX_PAGES=10` × 12 geos sits right at the wall. Contractually prohibited by LinkedIn's UA (hiQ settled the CFAA question, not breach-of-contract). Treat as best-effort, never as the backbone. |
| JustJoin.IT | Works, undocumented | `api.justjoin.it/v2/user-panel/offers` is an internal SPA API (the `Version: 2` header is load-bearing). No robots coverage on that host. Expect breakage on any frontend rewrite. |

### Add these three first

**1 · Workable meta job board — best find.** No auth, one client, highest EU-remote senior-frontend density measured (32 of 80 sampled were EU-located: ES, UA, RO, PL, NL, DE, PT). Cross-customer ATS search across thousands of employers. Effort: **low**. No overlap with existing sources.

```
GET https://jobs.workable.com/api/v1/jobs?query=senior%20frontend%20engineer&workplace=remote&day_range=30&limit=20
```

Response: `{ title, totalSize, nextPageToken, jobs[] }`. Per-job fields map almost 1:1 to `Job`: `title`, `company.title`, `url` (`jobs.workable.com/view/{id}/…`), `created` (ISO), `location.countryName`, `workplace` (`remote|hybrid|onsite`), `employmentType`, `description` (HTML).

Gotchas confirmed empirically:
- The pagination param is **`pageToken`** — not `page`, `offset`, `token`, or `nextPageToken`. Wrong names **silently return page 1 again** (20/20 overlap across 3 "pages"). With `pageToken` I got 80 unique jobs over 4 pages.
- Multi-country postings are emitted **once per country** (e.g. Remofirst "Senior Front End Engineer" × UA/RO/PL). Today's `generateJobId` collapses these by accident; after P0-1 you'll need to pick the EU-preferred one deliberately.
- `location=Germany` narrows correctly; `workplace=remote` narrows 1310 → 733 for "frontend".
- robots.txt: `/api/` is not disallowed; `Content-Signal: ai-input=yes`.

**2 · Hacker News "Who is hiring" via the official Algolia API.** Very high signal: the July 2026 thread had 276 top-level comments, **66 matching remote+frontend**, ~30% EU. Effort: **low**. Both calls verified:

```
GET https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10
    → pick hits[] whose title contains "Who is hiring"   (July 2026 = objectID 48747976)
GET https://hn.algolia.com/api/v1/items/48747976
    → .children[] = 276 top-level comments, each { id, author, created_at, text (HTML) }
```

Use **HTTPS** — `http://` 301s and drops the body. Each top-level comment is one posting; parse the conventional `Company | Role | Location | REMOTE | url` first line, fall back to the first `<a href>` for the URL, else `https://news.ycombinator.com/item?id={comment.id}`. `company` is genuinely hard to parse — **this is the one source where routing through your existing Groq filter pays for itself.** During the first ~10 days of a month, fetch the previous month's thread too.

**3 · ATS multiplexer (`src/api/ats.ts`).** Highest signal on the list — source of truth, no recruiter spam. One client fanning out over a curated token list. Effort: **med**. Partially overlaps LinkedIn/WWR. All three verified live and unauthenticated:

```
GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
    verified: stripe (3.9 MB), gitlab, n26
    → { jobs: [{ id, title, absolute_url, updated_at, location.name, offices[], metadata[] }] }

GET https://api.lever.co/v0/postings/{token}?mode=json
    verified: spotify (1 MB), leverdemo
    → [{ id, text, hostedUrl, createdAt, categories.location, categories.commitment, workplaceType }]
    robots.txt: Allow: / , Crawl-delay: 1

GET https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
    verified: linear (330 KB), ramp (2 MB)
    → { jobs: [{ id, title, jobUrl, publishedAt, location, secondaryLocations[], isRemote }] }
```

**There is no public way to enumerate board tokens** — no index endpoint on any of the three; `jobs.ashbyhq.com/robots.txt` disallows `/api/`, `boards.greenhouse.io` only disallows `/embed/`. So ship a hand-curated `EU_REMOTE_BOARDS` array (~60-120 entries of `{ ats, token }`) as data in the repo. Wrong tokens are cheap and safe to probe — Greenhouse 404s, Lever returns `{"ok":false}`, Ashby returns `{"jobs":[]}` — so a small script can validate the list offline. **Filter titles for senior/frontend and locations for Remote/Europe before normalizing**, or the 2 MB payloads will swamp the store.

### Full ranked candidate list

| # | Source | Access | Auth / limits | Volume + EU signal | Effort | Dupes? |
|---|---|---|---|---|---|---|
| 1 | **Workable** `jobs.workable.com` | Public JSON (above) | None; `pageToken` cursor | Best EU density found — 32/80 sampled EU | Low | No |
| 2 | **HN Who-is-hiring** (Algolia) | Official public API, 2 calls | None documented; be polite | 66/276 matched, ~30% EU | Low | No |
| 3 | **ATS multiplexer** (GH+Lever+Ashby) | Official public board APIs | None, no published limits | Highest signal; volume = f(token list) | Med | Partial |
| 4 | **germantechjobs.de** | `GET https://www.germantechjobs.de/api/jobsLight` → 200, 674 KB | None; `www.` required | DACH-only, dev-only. **Same codebase as `devitjobs.uk/api/jobsLight` (2.6 MB) and `swissdevjobs.ch/api/jobsLight` (257 KB) — one parser, three feeds** | Low | No |
| 5 | **Jobicy** | `GET https://jobicy.com/api/v2/remote-jobs?count=50&geo=europe&industry=engineering` | None; docs at jobi.cy/apidocs; `friendlyNotice` asks for credit + direct apply links | Native `geo=europe`. Medium volume/signal | Low | Some w/ Remotive |
| 6 | **NoFluffJobs** | `POST https://nofluffjobs.com/api/search/posting?page=1&limit=50` body `{"criteriaSearch":{"category":["frontend"],"seniority":["senior"],"city":["remote"]}}` → 200 | None, but **robots.txt: `Disallow: /api/`** | **Best CEE coverage: PL/CZ/SK/HU/RO/UA/NL.** High signal | Low | Overlaps JJIT on PL |
| 7 | **Working Nomads** | `GET https://www.workingnomads.com/api/exposed_jobs/` → 200, 212 KB | None; robots.txt `Disallow:` (fully open) | Whole feed in one call, dev-heavy; some agency noise | Low | Moderate w/ Remotive |
| 8 | **jobs.ch** | `GET https://www.jobs.ch/api/v1/public/search?query=frontend+developer&rows=50&home-office=true` → 200 | None found | CH/DACH, `home-office` filter, multilingual | Low-Med | No |
| 9 | **startupjobs.cz** | `GET https://www.startupjobs.cz/api/offers` → 200, 170 KB | None; robots.txt fully open | CZ/SK startups, modest volume | Low | No |
| 10 | **Himalayas (re-add?)** | `GET https://himalayas.app/jobs/api?limit=…&offset=…` → 200, `totalCount: 97542`, changelog dated 13/03/2026 | None | You dropped it, but it's the largest clean public remote API alive. **Reconsider with `?title=` filtering instead of a raw pull** | Low | Heavy w/ RemoteOK+Remotive |
| 11 | **eJobs.ro** | `GET https://api.ejobs.ro/jobs?keyword=frontend&page=1&pageSize=50` → 200 (both params mandatory) | None | RO general market — mostly non-tech noise, but home market | Low | No |
| 12 | euremotejobs.com `/feed/` (176 KB), berlinstartupjobs.com `/feed/` (14 KB) | WordPress RSS | Open | Low volume, EU-focused, cheap wins | Low | Minor |
| 13 | **landing.jobs** | `GET https://landing.jobs/api/v1/jobs` → 200, 291 KB | **robots.txt `Disallow: /api/`** | PT + EU-remote, decent signal, ToS-adverse | Low | No |
| 14 | **SmartRecruiters** | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings` (verified: `Visa`, `smartrecruiters`) | **robots.txt allows only LinkedInBot on `/v1/companies/`; `Disallow: /` otherwise** | Enterprise-heavy, low frontend-remote signal; most guessed IDs return `totalFound: 0` | Med | — |

### Verified dead — don't spend time here

`hiring.cafe` (now 401 on GET, 405 on POST; `api.hiring.cafe` doesn't resolve) · Personio XML (`{sub}.jobs.personio.de/xml` → Vercel Security Checkpoint 429) · Welcome to the Jungle (202/no body, Algolia keys rotated) · Wellfound (403) · Remote Rocketship (Cloudflare 403) · remote.io (no API) · EURES (all documented endpoints 404 in 2026) · Adzuna (needs `app_id`+`app_key`) · jobdataapi.com (403, paid) · Recruitee (no tenant resolved at `{co}.recruitee.com/api/offers/`).

**Arbeitnow footnote:** it works, but only on `https://www.arbeitnow.com/api/job-board-api` — the apex 301s, and your old client may have died on that rather than on low signal. Worth knowing given you dropped it.

---

## Suggested execution order

1. **Data integrity trio — P0-1, P0-2, P0-9.** Biggest correctness win per line changed. Everything downstream (dedup counts, status persistence, freshness sort, AI panel sanity) depends on these being right. Do the id migration decision consciously.
2. **Fetch reliability — P0-3, P0-4, P0-10, P1-15.** Typed `TimeoutError` covering the body, honest partial-failure reporting, LinkedIn bail-on-403.
3. **Groq hardening — P0-6, P0-7, P0-8, P1-12.** One pass: `max_completion_tokens` + strict `json_schema` + `reasoning_effort: 'low'` + `temperature: 0` + index-based ids + `finish_reason` check + 429 retry + kill both `console.error`s.
4. **Layout & keybinding correctness — P0-5, P1-1, P1-2, P1-5, P1-7, P1-9**, delivered *through* the [binding-table refactor](#proposed-refactor-declarative-keybinding-table) so the shadowing bugs can't come back.
5. **Docs rewrite — README + AGENTS.md + PLAN.md**, with the keybinding tables generated from `BINDINGS`. Fix AGENTS.md first: it's actively misleading future agents about the state layer.
6. **Packaging & tooling** — `"files": ["dist"]`, `engines`, license reconciliation + LICENSE file, `.gitignore` (`.idea/`, `.claude/`), `@types/node`, `noUncheckedIndexedAccess`, `.env.example`, vitest + CI.
7. **New sources** — Workable, then HN/Algolia, then the ATS multiplexer. Also swap WWR to the front-end category RSS (one-line signal upgrade).
8. **Polish** — popup scrolling (P1-3), `G` semantics (P1-4), theme-aware rows (P1-6), scrolling viewport (P1-8), glyph cursor (P1-10), resize position preservation (P1-11), and the P2 sweep.
