---
name: daily-meta
description: >
  Daily Meta Ads optimization routine for all SocialAds client ad accounts (Povilas). Trigger on:
  /daily-meta, "daily checkas", "daily check", "kaip kampanijos?", "kaip reklamos?", the nightly
  scheduled run (3:00 Europe/Vilnius, unattended), "savaitės apžvalga", "vykdyk" followed by numbers
  (executes previously proposed actions), "interviu" / "nustatom targetus" (per-client target setup),
  or any request to review, monitor or optimize Meta Ads performance across clients. Pulls insights
  via Meta MCP, evaluates research-backed decision rules (kill/scale/wait/fatigue), renders SocialAds
  dark-theme trend charts, and outputs a Lithuanian daily brief with numbered action proposals.
  NEVER executes changes without explicit approval ("vykdyk N"). Also trigger on terse cues like
  "paleisk daily" or a morning greeting asking about ad performance. Single-client CHECK mode
  triggers on "patikrink {klientas}", "/daily-meta {klientas}", "kaip Gama?", "kas su Petplius?",
  "parodyk {klientas} situaciją" — runs the same pipeline for that client only, on demand.
---

# daily-meta v2 — kasdienis Meta Ads optimizavimas

Nightly health scan + rule-based optimization proposals for ~25 client accounts, tiered by budget,
visual-first output in Lithuanian. Evidence base: `research/2026-07-optimization-methods.md`.
Decision rules with IDs and thresholds: `references/rules.md`. Output templates and banned words:
`references/output-format.md`. Platform changes log: `references/platform-watch.md`.

## Config (edit here, referenced everywhere)

```
Thresholds live in `scripts/evaluate.py` CFG (single source of truth): STOP_LOSS_MULT=2.0,
TIER_SPLIT=€50/d, FREQ_ACTION=3.5, FREQ_EMERGENCY=4.5, MIN_CONV_VERDICT=20 (clicks 300),
verdict bands ±10% (n≥50) / ±20%, K2/S1/T1 guards. Skill-level settings:

```
BATCH_SIZE       = 3        # accounts per batch, sequential (MCP rate limits)
WEEKLY_DAY       = Monday   # deep-dive extends the nightly run
LOOKBACK_DAYS    = 35       # daily series fetched per account
MONDAY_CHART_CAP = 10       # detail PNGs on Monday: non-🟢 + top 3 movers, max this
ZERO_SPEND_CADENCE = weekly # registry-active accounts with 7d spend = 0 → check Mondays only
```
```

## Modes

| Mode | Trigger | What happens |
|---|---|---|
| NIGHTLY | scheduled 3:00 run, /daily-meta, "daily checkas" | Health scan + rules + charts + LT brief with proposals |
| CHECK | "patikrink {klientas}", "kaip {klientas}?", "/daily-meta {klientas}" | NIGHTLY pipeline for ONE client (or a named subset), on demand, with extra depth |
| WEEKLY | NIGHTLY on Monday, "savaitės apžvalga" | NIGHTLY + closed-week 7v7 deep-dive, fatigue triage, queued LOW-tier proposals |
| EXECUTE | "vykdyk 1,3" / "vykdyk visus" | Execute approved proposals via Meta MCP, log, confirm |
| INTERVIEW | "interviu", "nustatom targetus", unassigned account found | Per-client target/profile Q&A → clients.yaml |
| WATCH | first NIGHTLY of the month | WebSearch Meta platform changes → platform-watch.md + brief section |

Unattended nightly runs (scheduled task): skip ALL interactivity — no questions, no connector
suggestions, no execution. Produce the brief; proposals wait for morning approval. If Meta MCP is
unavailable, output one line saying so and stop — never fabricate data.

## Registry — clients.yaml

Load `clients.yaml` first. NIGHTLY processes ONLY entries with `active: true` and `excluded: false`
— never fetch insights for the other ~90 accounts (rate limits). A registry client without targets
gets trend-only verdicts, no K/S proposals (G8). New/unregistered spenders are caught by the
monthly WATCH spend sweep, not nightly.

`tier: auto` = trailing-30d spend/day vs `TIER_SPLIT`. Currency from registry (`Agatas = $`).

## NIGHTLY pipeline

Process accounts in batches of `BATCH_SIZE`, sequentially within and between batches — never
parallel MCP calls (rate limits; the 3:00–5:00 window exists to spread load). One account's failure
never stops the run: wrap per-account, collect `❌ {name}: {reason}` for the brief footer.

Per account:

**1. Fetch** (Meta MCP; load tools via ToolSearch as needed — prefer `ads_insights_performance_trend`
for daily series, `ads_get_ad_entities` for campaign/ad set/ad statuses+budgets+bid strategies,
`ads_get_errors` for delivery/rejection issues, `ads_account_get_activity_logs` for recent edits):
- Daily series, last `LOOKBACK_DAYS` days, account + campaign level: spend, impressions, results
  (+type), `actions:link_click`, `purchase_roas` for sales, frequency. Note: `inline_link_clicks`
  is not a valid field — use `actions:link_click`. Multi-campaign accounts return large payloads
  (e.g. Argus: 54KB for 15d) — when a response lands in a tool-results file, parse it with
  python/jq from the file; never paste it into context. Cross-check: Σ(campaign daily spend) must
  match the account 30d spend within 1%.
- 7-day frequency: campaign level, `date_preset=last_7d`, NO time_increment, fields
  [frequency, spend, impressions, delivery] — validated method. Mark retargeting campaigns
  (name contains rem/retarget) for F6 tolerance.
- Ad-set attributes (no date range): fields [id, name, delivery, effective_status] —
  `delivery.substatuses` exposes learning/learning_limited/not_delivering; this is the G1
  learning gate source. Only flag issues whose parent entity is ACTIVE.
- Account-level errors (`ads_get_errors`): payment, restrictions, rejected ads — filter to
  ACTIVE parents.
- Activity log (`ads_account_get_activity_logs`): TRY it — still rolling out (2026-07 most
  accounts return a rollout error); on failure fall back to state.json learning clocks +
  campaign age from the daily series. `ads_insights_anomaly_signal` is optional garnish —
  tested empty on both small and big accounts; never build alerts on it alone.

**2. Health scan** — rules H1–H7 (`references/rules.md`). H1–H3 are EMERGENCY: always same-day,
every tier, top of the brief.

**3.–5. Deterministic evaluation — NEVER compute metrics or rules by hand:**
- Build `outputs/daily-meta/{date}/input.json` from the fetched data (exact schema in
  `scripts/evaluate.py` docstring: per client — targets, campaigns with daily
  [date, spend, results, roas] rows, freq7, delivery_issues with `parent_active`,
  account_errors). Filter delivery issues: only entities whose PARENT is ACTIVE
  (paused-parent "not delivering" is noise — verified 2026-07-22).
- Run `python3 scripts/evaluate.py input.json outdir`. It computes windows
  (mature7 D-9..D-3 vs prior7 D-16..D-10, W5-safe), weighted ROAS (total-spend
  denominator), statistical verdict gates (≥20 conversions per window, ±10/20% bands),
  rules K1/K2/S1/F1/F2/H3/H5/T1, tier gating and 🟢🟡🔴 statuses → `alerts.json` +
  `chart_data.json`.
- The brief's every number comes from `alerts.json`. The agent adds context, causes and
  narrative (e.g. which campaign drags ROAS, provisional recovery "(dar sėda)") — but never
  recomputes or overrides the engine's numbers. Guardrails G1–G10 still bind the narrative
  and proposals (learning silence, ±20% budget steps, bid-strategy respect).

**6. Render** — `python3 scripts/trend_charts.py {outdir}/chart_data.json {outdir}/`
(evaluate.py already sorted clients 🔴→🟡→🟢, by spend desc within group). Detail PNGs:
daily = flagged clients only; Monday = non-🟢 + top 3 movers, `MONDAY_CHART_CAP` max —
never a 32-PNG wall.

**7. Brief** — assemble per `references/output-format.md`, attach portfolio grid + flagged-client
PNGs. Numbered proposals with rule citations. End with the "vykdyk" instruction line. Nothing else.

### Pre-send sanity gate (adapted from meta-ads-report Phase 3)

- Every number in the brief traces to fetched data; spend sums reconcile within 1%.
- No proposal targets an entity on the do-not-touch list (learning/72h).
- No proposal without a rule ID and numbers. No alerts for 🟢 clients.
- Currency symbols match the registry. If a check fails for one client — drop that client's
  section, add ❌ footer line, deliver the rest.

## CHECK mode (single client, on demand)

Same pipeline as NIGHTLY, scoped to the named client(s) — resolve the name against
`clients.yaml` (fuzzy match; if ambiguous, ask once). Differences from the nightly pass:
- Detail trend PNG ALWAYS rendered and attached, even when 🟢 (the user asked — show it).
- Extra depth: per-campaign 7d table (spend, results, KPI, freq7) in the brief — on-demand
  checks are diagnostic, not a scan.
- Inactive/excluded clients: still allowed — note the registry status ("klientas išjungtas
  registre — rodau, bet taisyklės netaikomos be targetų").
- Proposals follow the same rules and the same approval gate; tier queueing does NOT apply
  (an on-demand check surfaces everything now, including what nightly queued for Monday).
- No state side-effects except alert dedup timestamps.

## WEEKLY additions (Monday)

- Closed week (Mon–Sun) vs prior week, aligned weekdays; charts with `--all`.
- Fatigue triage table (F1–F6) across all clients.
- Surface queued LOW-tier proposals + new ones from 7d windows (K2, S1–S3, R1–R6).
- Reallocation proposals between campaigns (weekly only — 72h data lag makes daily reallocation
  noise). Consolidation suggestions per R1 — suggest, never insist; respect per-client `notes`
  (e.g. Argus direction-segmented structure stays).
- Learning hygiene: % of spend in learning; if >50%, name which entities and why (edits? new
  launches?) — the 68%-CPA-delta stat is the "why this matters" line.

## EXECUTE protocol

Only on explicit approval in chat: "vykdyk 1,3", "vykdyk visus", "vykdyk 2". Nothing else counts —
not silence, not "ok", not a thumbs-up. Ambiguous reply → ask once, briefly.

1. Map numbers to the exact proposals from the LAST brief (store them in state with entity IDs).
2. Execute via Meta MCP write tools (`ads_update_entity` for status/budget, `ads_activate_entity`
   where applicable). One call per action, sequential.
3. Append each to `outputs/daily-meta/actions-log.jsonl`:
   `{ts, date, account_id, client, entity_type, entity_id, action, params, rule, approved_via}`.
4. Update learning clocks in state (a budget/status change = significant-edit risk → 72h
   do-not-touch for that entity, next budget change ≥2–4 d per S3).
5. Confirm per `output-format.md` (✅ list + learning-clock notes). Failures: ❌ with Meta's error
   text, no retry without asking.

Budget changes, campaign creation, targeting edits — ALWAYS proposal-first, never autonomous.
This is absolute (G4).

## INTERVIEW mode

Goal: fill/refresh `clients.yaml` targets and profiles. Anchored, batched, fast:

1. Pull active accounts (last-30d spend > 0) via Meta MCP — the registry seed may be stale; the
   account list had a pagination cursor, so re-pull the full list.
2. For each client compute trailing-90d: spend/day, primary result type, current CPL/CPS/ROAS/CPM,
   best/worst month.
3. Ask in batches of ~4 clients per round (AskUserQuestion where available, else plain text), each
   with data-anchored suggestions: "Gama Displays — 90 d. CPL 9,40 €. Target?" with options like
   "≤9 € (dabartinis lygis)" / "≤8 € (spausti)" / custom. Also confirm per client: market, industry
   (one phrase), campaign types.
4. GHS group: one dedicated round — "kurie GHS accountai NE tavo?" → set `excluded: true`.
5. Write `clients.yaml`, show a compact diff summary. In a git environment — commit; on Desktop —
   just save.

Re-run INTERVIEW for a single client any time ("pakeisk Gama targetą") — edit just that row.

## WATCH mode (monthly)

First nightly run of each month (or "kas naujo Meta'oje"):
0. **Spend sweep**: re-pull the full account list (paginate!), diff vs `clients.yaml` +
   `references/accounts-snapshot-2026-07.json`; for active accounts NOT in the registry, fetch
   last_30d spend only (account level, sequential batches). Any spender → "🆕 {name} leidžia
   {suma} €/30 d. — pridėti per interviu?" line in that day's brief. Update the snapshot file.
1. WebSearch 3–5 queries: Meta ads changes/updates this month, Advantage+ changes, attribution
   changes, new ad formats/placements. Prefer Meta official + ppc.land + jonloomer.com.
2. Append dated bullet entries to `references/platform-watch.md` — only changes that affect
   THESE clients (small-market LT, lead gen + small e-com). One line each + implication.
3. Add the "📰 Kas naujo Meta'oje" section (max 3 bullets) to that day's brief.
4. If a change invalidates a rule threshold in `references/rules.md` — flag it in the brief and
   propose the rules.md edit; do not silently change rules.

## State — outputs/daily-meta/state.json

```
{ last_run, last_brief_proposals: [{n, account_id, entity_id, action, params, rule}],
  learning_clocks: {entity_id: iso_ts_of_last_significant_edit},
  queued_low_tier: [{date, client, proposal, rule}],
  alert_dedup: {"{entity_id}:{rule}": {last_alerted, metric_value}} }
```

Alert dedup: same rule+entity re-alerts only if the metric worsened ≥10% or 7 days passed.
Learning clocks seed from the activity log when available; always updated by our own EXECUTE
actions. Corrupt/missing state → recreate empty, note it in the brief footer, continue.

## Market-aware recommendations

Recommendations (R-rules) must fit the client's `market`, `industry` and `campaign_types` from the
registry, and the current platform state from `platform-watch.md`:
- LT market: broad is the ceiling — never suggest interest/LAL narrowing (G2). Steady-state
  frequency 3–4 tolerated when KPI on target (F5).
- Small budgets: no separate retargeting suggestions (G3); consolidation per R1 as a suggestion.
- Instant-forms lead gen (most clients): quality levers = Higher Intent form + qualifying
  questions + (future) CRM/CAPI Conversion Leads (R4).
- Seasonal clients (see `notes`, e.g. Samsonas Rally) — trend verdicts vs same period last year
  where data exists, not vs last week.
- When a recommendation depends on knowledge freshness (new Meta feature), cite the
  platform-watch.md entry date.

## Data caveats (always)

- Reach summed across days ≠ unique reach — direction indicator only.
- Renamed campaigns: same result type + similar spend + one disappears as other appears → treat as
  continuation for trends, note the rename.
- Comparisons crossing 2026-01-12 / 2026-03 attribution changes carry a one-line caveat (G10).
- Meta underreports without strong CAPI — never present Meta-reported conversions as ground truth
  for small accounts; it's a lower bound.
- USD accounts: all displays in $, tier computed on EUR-equivalent (approximate is fine).

## Scheduling

Desktop Cowork: scheduled task at 3:00 Europe/Vilnius daily fires "/daily-meta" (unattended mode).
The run itself pacing through batches naturally spreads 3:00–5:00. Cloud alternative: a Routine
(create_trigger, cron `0 0 * * *` UTC = 3:00 EEST) into a persistent session with Meta MCP
connected. Do not create or modify schedules autonomously — only when Povilas asks.
