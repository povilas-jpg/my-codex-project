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
  "paleisk daily" or a morning greeting asking about ad performance.
---

# daily-meta v2 — kasdienis Meta Ads optimizavimas

Nightly health scan + rule-based optimization proposals for ~25 client accounts, tiered by budget,
visual-first output in Lithuanian. Evidence base: `research/2026-07-optimization-methods.md`.
Decision rules with IDs and thresholds: `references/rules.md`. Output templates and banned words:
`references/output-format.md`. Platform changes log: `references/platform-watch.md`.

## Config (edit here, referenced everywhere)

```
STOP_LOSS_MULT   = 2.0      # K1: spend ≥ 2× target CPA, 0 conversions, last 3 d
TIER_SPLIT       = 50       # €/day; trailing-30d spend/day < 50 → LOW, else BIG
FREQ_ACTION      = 3.5      # F1: 7-day frequency action threshold (prospecting)
FREQ_EMERGENCY   = 4.5      # F2: same-day creative-replacement proposal
PROVISIONAL_DAYS = 3        # W5: D-1..D-3 conversions marked "dar sėda"
PACING_TOL       = 0.15     # H4: ±15% cumulative pacing deviation, 3+ consecutive days
CPM_SPIKE        = 0.20     # H6: ad set CPM +20% vs trailing 7d avg
BATCH_SIZE       = 3        # accounts processed per batch, sequentially (MCP rate limits)
WEEKLY_DAY       = Monday   # deep-dive extends the nightly run
LOOKBACK_DAYS    = 35       # daily series fetched per account
```

## Modes

| Mode | Trigger | What happens |
|---|---|---|
| NIGHTLY | scheduled 3:00 run, /daily-meta, "daily checkas" | Health scan + rules + charts + LT brief with proposals |
| WEEKLY | NIGHTLY on Monday, "savaitės apžvalga" | NIGHTLY + closed-week 7v7 deep-dive, fatigue triage, queued LOW-tier proposals |
| EXECUTE | "vykdyk 1,3" / "vykdyk visus" | Execute approved proposals via Meta MCP, log, confirm |
| INTERVIEW | "interviu", "nustatom targetus", unassigned account found | Per-client target/profile Q&A → clients.yaml |
| WATCH | first NIGHTLY of the month | WebSearch Meta platform changes → platform-watch.md + brief section |

Unattended nightly runs (scheduled task): skip ALL interactivity — no questions, no connector
suggestions, no execution. Produce the brief; proposals wait for morning approval. If Meta MCP is
unavailable, output one line saying so and stop — never fabricate data.

## Registry — clients.yaml

Load `clients.yaml` first. Skip `excluded: true` and `active: false`. Account not in the registry →
process read-only, mark 🆕 "nepriskirtas" in the brief, offer mini-interview (rule G8); no K/S rule
evaluation without targets — trend-only verdict.

`tier: auto` = trailing-30d spend/day vs `TIER_SPLIT`. Currency from registry (`Agatas = $`).

## NIGHTLY pipeline

Process accounts in batches of `BATCH_SIZE`, sequentially within and between batches — never
parallel MCP calls (rate limits; the 3:00–5:00 window exists to spread load). One account's failure
never stops the run: wrap per-account, collect `❌ {name}: {reason}` for the brief footer.

Per account:

**1. Fetch** (Meta MCP; load tools via ToolSearch as needed — prefer `ads_insights_performance_trend`
for daily series, `ads_get_ad_entities` for campaign/ad set/ad statuses+budgets+bid strategies,
`ads_get_errors` for delivery/rejection issues, `ads_account_get_activity_logs` for recent edits):
- Daily series, last `LOOKBACK_DAYS` days, account + campaign level: spend, impressions, results,
  result type, link clicks, purchases, purchase value, leads, calls, reach.
- 7-day frequency per active campaign/ad set (prospecting vs retargeting — retargeting tolerates
  freq up to 8–10, rule F6).
- Entity statuses: effective_status, learning phase status, daily budgets, bid strategy.
- Account-level errors: payment, restrictions, rejected ads.
- Recent significant edits (activity log) → learning clocks (see State).

**2. Health scan** — rules H1–H7 (`references/rules.md`). H1–H3 are EMERGENCY: always same-day,
every tier, top of the brief.

**3. Metrics frame** (keep the v1 comparison set, add discipline):
- Yesterday vs D-2, vs 7d avg, vs 30d avg; closed 7d (D-8..D-2) vs prior 7d ALIGNED BY WEEKDAY;
  30v30.
- Primary KPI per campaign type — reuse `detect_campaign_type()` and the KPI table from the
  `meta-ads-report` skill (sales→ROAS, leads→CPL, calls→CPS, awareness→CPM, engagement→CPE).
- Weighted ROAS: revenue = Σ(spend×ROAS over ROAS rows); denominator = TOTAL spend, never
  notna-only (v2 correction).
- D-1..D-3 conversion metrics are PROVISIONAL (W5): usable for display with "(dar sėda)", never
  as the sole basis of a K/S proposal. K1's 3-day window intentionally includes provisional days —
  it is a 0-conversion spend guard, not a CPA verdict.

**4. Rule evaluation** — tier-gated:
- LOW: health scan + trend verdict only; K/S/F proposals queue into state for Monday. Exceptions
  (same-day even for LOW): H1–H3, K1, F2.
- BIG: full K (kill), S (scale), F (fatigue) evaluation daily.
- Respect guardrails G1–G10 (`references/rules.md`) — especially: G1 no proposals for entities in
  learning / first 72h / Learning Limited hitting target (silence); G5 budget proposals ±20% max,
  one per entity per 2–4 d; G6 respect existing bid strategies.

**5. Verdict per client** — 🟢🟡🔴 + kryptis (gerėja/blogėja/stabilu) per the computation in
`references/rules.md` ("Krypties verdiktas"). Build the chart-JSON entry (schema in
`scripts/trend_charts.py` docstring).

**6. Render** — write chart JSON to `outputs/daily-meta/{date}/data.json`, run:
`python3 scripts/trend_charts.py outputs/daily-meta/{date}/data.json outputs/daily-meta/{date}/`
(add `--all` on Monday). Clients sorted 🔴→🟡→🟢, within group by spend desc.

**7. Brief** — assemble per `references/output-format.md`, attach portfolio grid + flagged-client
PNGs. Numbered proposals with rule citations. End with the "vykdyk" instruction line. Nothing else.

### Pre-send sanity gate (adapted from meta-ads-report Phase 3)

- Every number in the brief traces to fetched data; spend sums reconcile within 1%.
- No proposal targets an entity on the do-not-touch list (learning/72h).
- No proposal without a rule ID and numbers. No alerts for 🟢 clients.
- Currency symbols match the registry. If a check fails for one client — drop that client's
  section, add ❌ footer line, deliver the rest.

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
