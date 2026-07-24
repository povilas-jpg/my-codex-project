---
name: daily-meta-v3
description: >
  Single-client Meta Ads check for SocialAds (Povilas) — the lean on-demand version of daily-meta.
  Trigger on: /daily-meta-v3 {klientas}, "patikrink {klientas}", "kaip {klientas}?", "kas su
  {klientas}?", "parodyk {klientas} situaciją", or any request to review ONE client's Meta Ads
  performance right now. Analyzes exactly one client per invocation: pulls 30d insights via Meta
  MCP, runs the deterministic rules engine (kill/scale/fatigue with statistical gates), renders a
  SocialAds dark-theme trend chart, and outputs a compact Lithuanian brief with numbered action
  proposals. NEVER executes changes without explicit approval ("vykdyk N"). If no client is named,
  ask which one — never scan all clients (that's daily-meta-v2's job).
---

# daily-meta-v3 — vieno kliento čekas

Lean CHECK: one client in, one brief out. Shares ALL machinery with `../daily-meta-v2/` —
single source of truth, do not duplicate:

- Registry: `../daily-meta-v2/clients.yaml` (targets, tiers, currencies, notes)
- Engine: `../daily-meta-v2/scripts/evaluate.py` (windows, gates, rules K1/K2/S1/F1/F2/H3/H5/T1)
- Charts: `../daily-meta-v2/scripts/trend_charts.py`
- Rules & thresholds: `../daily-meta-v2/references/rules.md`
- Output conventions & banned words: `../daily-meta-v2/references/output-format.md`

## Pipeline (per invocation, ~2 min)

1. **Resolve** the argument against clients.yaml (fuzzy; ambiguous → ask once; not in registry →
   say so and offer to add via one question: KPI target + tipas). Inactive/excluded clients:
   analyze anyway, note the registry status.
2. **Fetch** via Meta MCP (load tools via ToolSearch — server prefix changes between sessions;
   currently `mcp__Meta_MCP__*`). Three calls, sequential:
   - Daily series 30d: `ads_get_ad_entities`, level campaign, time_increment 1,
     fields [id, name, spend, results, cost_per_result, purchase_roas, objective]
     (time_range = last 30 full days). Large response may land in a tool-results file —
     parse with python from the file, never paste into context.
   - 7d frequency + delivery: same tool, `date_preset=last_7d`, NO time_increment,
     fields [id, name, frequency, spend, impressions, delivery].
   - Errors: `ads_get_errors` with the account id — keep only ACTIVE-parent issues
     (paused-parent "not delivering" is noise).
3. **Evaluate** — build input.json per evaluate.py docstring schema (campaigns with daily
   [date, spend, results, roas] rows; active flag from delivery status; freq7 list;
   delivery_issues; account_errors), then run evaluate.py. EVERY number in the brief comes
   from its alerts.json — never recompute by hand. Cross-check: Σ campaign spend ≈ account
   30d spend within 1%.
4. **Render** — trend_charts.py on its chart_data.json; ALWAYS attach the client's trend PNG
   (SendUserFile), even when 🟢.
5. **Brief** (LT, per output-format.md conventions — banned words apply):
   - Header: status emoji + client + tier + target.
   - Verdiktas: mature7 KPI (n=), WoW vs prior7, 30d avg, yesterday "(dar sėda)".
   - Per-campaign table: 7 d. spend | rezultatai | KPI | freq7 | pask. 4 d. kryptis.
   - "Kas vyksta" — 2-4 sakiniai konteksto: kuri kampanija tempia, learning statusai,
     struktūros pokyčiai. Insight'ai, ne skaičių atpasakojimas.
   - Numbered "Siūlomi veiksmai" with rule IDs + numbers; end with the "vykdyk N" line.
     No proposals → "Šiandien veiksmų nereikia."
6. **EXECUTE** (only on explicit "vykdyk N" reply): via Meta MCP write tools, one call per
   action; log to outputs/daily-meta/actions-log.jsonl; confirm ✅/❌ per output-format.md.
   Budget/status/targeting changes NEVER happen without approval.

## Guardrails (inherited, absolute)

- G1: entities in learning / first 72h (campaign age from series; adset delivery.substatuses)
  get NO proposals — mention their learning status instead.
- G4: read-only until "vykdyk N". G7: every alert cites rule ID + numbers.
- ROAS clients: KPI computed from OUTCOME_SALES campaigns only (isolation).
- Provisional data: D-1..D-3 conversions labeled "(dar sėda)"; decisions come from the
  engine's mature windows.
- One client per run. "patikrink visus" → point to daily-meta-v2.
