# Meta Ads Optimization Methods — Research Digest (July 2026)

Purpose: evidence base for the `/daily-meta` skill upgrade (daily optimization routine for SocialAds client accounts).
Method: 3 parallel research sweeps (low-budget, high-budget, daily routines) — ~45 web searches, 60+ sources, plus Meta Business Help Center articles pulled via Meta MCP.

**Confidence legend:** `[M]` = Meta-official · `[C]` = practitioner consensus (3+ independent sources) · `[X]` = contested / single-source / folklore.

---

## 1. What changed on the platform in 2025–2026

- **Andromeda** `[M]` (engineering.fb.com, Dec 2024, rolled out through 2025): new AI retrieval engine for ads ranking. Net effect: the system rewards **many genuinely distinct creatives** (different concepts/angles/formats). Near-duplicate variants get collapsed into one entity — cosmetic variants add nothing. "Creative is the targeting."
- **Advantage+ suite consolidation** `[M]` (2025): manual and Advantage+ flows merged into one campaign setup with per-section AI toggles. Sales/Leads/App objectives default into the streamlined Advantage+ flow. "Campaign score" starts at 100 and drops as constraints are added.
- **Existing Customer Budget Cap REMOVED** `[M]` (2024–25). Workarounds `[C]`: account-level audience segments (customer list + purchasers 180d) for new-vs-existing reporting; weekly-refreshed customer-list exclusions; or split ad sets with spend limits. Without exclusions ASC drifts to easy existing-customer conversions.
- **Attribution overhaul** `[M]`:
  - **Jan 12, 2026:** 7d-view and 28d-view windows removed (1d-view is now the max view window). Accounts leaning on view-through saw reported conversions drop 15–30% `[C]`.
  - **March 2026:** only **link clicks** count as "clicks"; likes/shares/comments moved to a new **1d engage-through** bucket. New default: 7d click / 1d engage / 1d view.
  - Implication: reporting continuity breaks in early 2026 — month-over-month comparisons across these dates need a caveat.
- **Dynamic Creative sunset (2025) → Flexible ads → Flexible Format removed from ad setup (March 2026)** `[M/X]`, replaced by a "Flexible media" toggle inside Advantage+ creative. Duplicate before editing legacy flexible ads.
- **Threads placement** `[M]` (global Jan 21, 2026): **on by default** in Advantage+ placements. Early CPMs cheap, conversion quality unproven `[C]` — check placement breakdowns.
- **Offline Conversions API killed May 2025** `[M]` — CRM/offline events must flow through CAPI.
- **Opportunity Score** `[M]` (global 2025, 0–100, account-level): measures adoption of Meta's recommendations, **not performance** (Meta's own disclaimer). Meta claims 5–12% median lower cost-per-result for adopters (their stat). Practitioner consensus `[C]`: harvest easy points, ignore recommendations that would reset learning or conflict with strategy; check it first when an account underperforms, ignore it on stable accounts.
- **AI creative tools** `[M]`: backgrounds, text variants, video expansion — use as free variant generators (useful for creative-starved SMBs), not for concepts.

---

## 2. Core mechanics (budget-independent)

### Learning phase
- Exit requires **~50 optimization events per ad set in the 7 days** after the last significant edit `[M]`.
- **Significant edits that reset learning** `[M]` (exact list): any targeting/audience change; any creative change; **adding a new ad to the ad set**; changing optimization event; changing bid strategy or bid/cost cap; pausing ≥7 days then resuming. **Magnitude-dependent:** budget/cost-goal changes ($100→$101 no; $100→$1000 yes).
- **NOT resets** `[C]`: renames, budget moves <20%, schedule tweaks; CBO budget redistribution between ad sets `[M]`; ad-set edits don't reset sibling ad sets `[M]`.
- Budget-change folklore: the "20%/day rule" is retired as a hard rule `[C]` — Ads Manager now shows an in-UI safe-increase number ("You can increase your budget to $X without restarting learning") which is per-ad-set and Meta-official. Fallback heuristic: **±20% steps every 2–3 days** `[C]`.
- Cost of ignoring this: exiting learning = **19% lower cost/conversion**; accounts with <20% of spend in learning vs >50% show **68% lower CPA** `[M via agency reports]`.
- **Batch edits**: make all changes in one session (one reset), never drip-edit daily `[C]`.
- **Learning Limited** = forecast <50 events/7d. It is **not a penalty** `[M]` — at low budgets it is the permanent operating state. Fixes `[M]`: consolidate ad sets/campaigns, broaden audience, raise budget, raise cost cap, or switch to a **more frequent optimization event** (purchase→ATC; qualified lead→raw lead→form open). If it's hitting target CPA while Learning Limited — leave it alone `[C]`.

### Data settling / attribution lag
- Conversions **settle for ~72h** after a day closes; 7d-click conversions keep landing up to 7 days; **modeled conversions injected 24–72h late** `[M/C]`.
- Daily-report policy `[C]`:
  - **Final same-day:** spend, impressions, CPM, CTR, frequency → daily rules may use today/yesterday.
  - **Provisional:** yesterday's conversions/CPA/ROAS; D-2/D-3 still soft; **stable from D-4**.
  - Decisions: trailing 7 days, or a "mature window" **D-9..D-3**. Expect last-3-day CPA biased HIGH, ROAS biased LOW.
  - Compare **week-over-week same weekday** (engagement/costs vary up to 30% by day of week) — never Monday vs Sunday.
- Meta underreports ~20–30% of real conversions without strong CAPI `[C]` — never hard-kill on Meta-only ROAS for small accounts.

### Signal quality
- **EMQ** (Events Manager, 0–10 per event): target **≥7 ("Good"), 8+ great** for Purchase/Lead `[M scale, C targets]`. Send email, phone, fbp/fbc, IP, user agent.
- **Dedup:** Pixel + CAPI must share `event_id` + `event_name`; failed dedup double-counts AND hurts EMQ. Weekly: check dedup + EMQ trend. Daily: only that event volume didn't anomalously drop/spike.

---

## 3. Low-budget playbook (≈ €5–50/day) — Lithuania-calibrated

### Structure
- **1 campaign per business goal, 1 (max 2) ad sets, 3–6 genuinely diverse ads** `[C]`. Meta officially warns against high ad volumes at low signal `[M]` — the Andromeda "10–50 creatives" advice is high-spend data, toxic at low budget.
- CBO vs ABO mostly collapses at this spend (run 1 ad set anyway). ABO for clean test reads, CBO to scale `[C]`.
- Learning math: minimum weekly budget ≈ **target CPA × 50**. €10 CPL → ~€71/day to exit learning. Below that, Learning Limited is normal — optimize within it.

### Targeting (small market)
- Delivery works best on **2–10M audiences; interest targeting only advisable if audience ≥2M** `[Meta guidance via practitioners]`. Lithuania's entire adult FB/IG pool (~1.5–2M) **is already at the floor** → **broad national targeting is the default; any interest/LAL narrowing drops into the sub-500K danger zone** (days-fast saturation).
- Advantage+ audience "typically gets better results" `[M]`; feed custom audiences/interests as *suggestions*, keep only hard controls (location, min age, exclusions).
- Lookalikes: less essential in 2025–26; still useful with CRM data the pixel hasn't seen — as suggestion, not constraint `[C]`.

### Creative
- **Sequential replacement**, not parallel split-tests: every 1–2 weeks swap the worst ad for one new creative. **Adding an ad = significant edit = learning reset → batch swaps, don't dribble** `[M/C]`.
- Refresh cadence for <500K effective audiences: lifecycle **4–6 weeks**; trigger on data, not calendar — **7d frequency >3.5 AND CTR down ~30% from peak** `[C]`. Ads unchanged 5+ weeks lose ~38% effectiveness `[X]`.
- Diversity beats variants: different concepts/angles/formats `[C]`.
- Healthy prospecting frequency **1–3/week; fatigue signal >3.5 in a 7-day window** (not lifetime) `[C]`. Add fresh creatives *before* frequency hits ~4.5. Don't let one audience take >40–50% of spend.

### Bidding & budgets
- **Highest Volume is the default** at this spend `[M default + C]`. Cost caps need ~50 conv/week to calibrate — under-deliver at low spend; viable only for cheap high-volume events (€2–5 leads), set at **110–120% of trailing actual CPA** (never aspirational) `[C]`.
- **Daily budgets** for always-on SMB accounts (predictable pacing, client billing). Meta may overspend a single day up to 75% over daily within the 7×daily weekly cap `[M]`. Lifetime only for fixed-flight promos or dayparting.

### Lead-gen specifics
- **Instant forms vs website forms:** forms ≈ −60% CPL, +125% volume, 2–3× conversion rate, lower quality `[C, Meta-cited stats]`. Small-market low-budget default: **instant forms + Higher Intent type + 2–3 qualifying questions + conditional logic**; website conversions often can't feed 50 events/week at all.
- **Conversion Leads goal + CRM via CAPI:** −16% cost per quality lead, +21% lead→quality rate `[M announced]` — needs a CRM feedback loop and decent volume.
- **Call ads:** optimize under Leads objective for **60-second calls** (−59% cost vs link-click optimization) `[M announced]`; schedule to business hours; enable callback for after-hours.
- **Advantage+ leads campaigns:** −10% cost per qualified lead in Meta tests `[M announced]`.

---

## 4. Big-budget playbook (≈ €100–1000+/day)

### Structure
- **2–4 campaigns total** `[C]`: 1 ASC/Advantage+ sales as scaling workhorse (**50–70% of budget**), 1 testing campaign (20–30%), optional retargeting **≤10%** — many scaled accounts now run **zero standalone retargeting** and let ASC blend it. Funnel consensus: 80–90% TOFU/MOFU.
- Existing-customer control via weekly-refreshed list exclusions / audience segments (see §1).

### Scaling
- **Vertical first** (budget up on winners): **+20–30% every 2–3 days** `[C]`; use the in-UI safe-increase number when shown `[M]`; >50% jumps risk learning reset. **Horizontal second** (new campaigns/audiences/geos) — only on saturation or rising marginal CPA. New ad sets need 7–14 days and ~50 conversions of headroom before judging.
- **Marginal, not blended:** marginal CPA = ΔSpend/ΔConversions week-over-week; when marginal CPA > gross-margin break-even, stop vertical scaling even if blended looks fine `[C]`. ROAS decay when scaling is normal (e.g., 5.0× @ €5k/mo → 3.0× @ €15k/mo).
- Reallocate between campaigns **weekly, not daily** (72h data lag).
- Dayparting: not worth it for ecommerce `[C]`; relevant only for call-hour-bound lead gen (requires lifetime budgets) — verify with 30–60 days of hourly data first.

### Cost controls
- Graduation path `[C]`: Highest Volume while gathering data (50+ conversions) → **Cost per result goal** or **ROAS goal** once target is stable.
- Two schools for the cap `[C]`: (a) average-CPA school — cap at **1.1–1.2× current average CPA**, tighten gradually; (b) marginal school (Ben Heath) — cap at **break-even CPA with 5–10× normal budget**; Meta spends only when it can hit the number.
- **ROAS goal:** needs values on every event + ~**100+ valued purchases**; floor at ~**80% of trailing 28d ROAS**, raise in small steps every ~2 weeks.
- #1 pitfall: too-tight caps → **under-delivery collapse**; loosen 10–15% to restore delivery. Bid cap = niche expert tool.

### Creative at scale (Andromeda era)
- Volume: **5–10 new creatives/week; 8–15 (up to ~25) live per ad set; ≤50 assets per ASC** `[M cap, C cadence]`.
- Creative lifespan compressed to **2–4 weeks** post-Andromeda (Motion $1.3B-spend data: ~half retired before day 28) `[C]`.
- Fatigue thresholds `[C]`: 7d frequency **>2.5–3 prospecting = act, >4 = replace** (retargeting tolerates 8–10; Reels fatigue ~30–40% faster); **CTR −15–20% from peak over 7–14 days**; CPM rising while CTR falls; **first-time impression ratio <50%** (healthy 65–80%).
- Testing: in-ASC testing for most accounts; a separate 20–30% testing campaign survives at higher spend to protect the scaler `[C]`. Judge tests by **spend threshold (3× target CPA)**, not time.

### Incrementality & verification
- €10k+/month: **Conversion Lift test** (free, Experiments tool) 1–2×/year, or geo holdout (hard inside LT alone — municipality-level or on/off tests). Cross-check in-platform ROAS vs blended MER monthly `[C]`.

### Small-market scaling (LT, 2.8M)
- What breaks first: **frequency climbs → CTR falls → CPM inflates**; first-time impression ratio collapses fastest. Broad LT ecom audience ~1–1.5M; at €500+/day saturation appears in weeks.
- Mitigations `[C]`: (1) **creative volume is the primary scaling lever** (new creative ≈ new audience under Andromeda); (2) fully broad — interest slicing only accelerates overlap; (3) frequency caps only via Reach/Awareness objectives — for conversions manage via rotation; (4) **geo expansion (LV/EE/PL) as true horizontal scale** — separate campaigns per language/currency, test Q1–Q2 when CPMs cheapest; (5) accept steady-state frequency 3–4 (higher than US lore) if ROAS holds.

---

## 5. Daily / Weekly / Monthly operating model (the daily-meta core)

### Cadence baseline
- Human *action* frequency scales with budget `[C]`: <€5k/mo → weekly; €5–10k → 2×/week; €10–25k → 3×/week; >€25k/mo → daily. **Daily = read-only health scan; most days the correct output is "no action."** Automated *checks* can run daily regardless.
- Over-optimization is the #1 low-budget killer `[C]`; Meta: "wait to edit your ad set until it's out of the learning phase" `[M]`.

### Daily health scan (5–10 min per account)
Items 1–4 = "is anything broken"; 5–7 = "is anything on fire"; only item 8 triggers same-day edits.

1. **Account health:** payment failure (approved ad at 0 impressions is often this), spending limit exhausted, account restricted. Payment failures also degrade auction standing `[C]`.
2. **Disapproved/rejected ads:** new rejections; falling approval rate is a leading indicator of account restriction `[C]`.
3. **Zero-delivery:** active ad set with 0 impressions yesterday → read the Delivery sub-status (it names the blocker) `[M]`.
4. **Spend pacing:** flag if cumulative spend outside ±15% of target×days. Single-day deviation <15% self-corrects; >15% for 3+ days = structural `[C]`. Meta may legitimately overspend a day up to ~25% (weekly-balanced) `[M]` — don't flag 1-day overspend <25%.
5. **Spend anomaly:** ≥85% of daily budget spent unusually early, or spend at 0 `[C]`.
6. **CPM spike:** ad-set CPM +20% vs trailing 7d average → flag, diagnose, don't edit `[C]`.
7. **Learning status:** entities newly in Learning/Learning Limited → do-not-touch list `[M]`.
8. **Hard stop-loss (only same-day action):** pause ad/ad set with **0 conversions AND spend ≥2× target CPA over the last 3 days** `[C]`.
9. **Explicitly NOT daily:** CPA/ROAS judgment on yesterday, creative decisions, budget changes, audience edits.

### Weekly deep-dive (30–45 min per account)
- Last 7 days vs prior 7 (aligned weekdays).
- Creative fatigue triage: frequency 2.5–3.0 = danger zone, ≥3.5 = schedule creative review, ≥4.5 = deploy replacements now; CTR −20% vs own baseline sustained 2 weeks = confirmed; CPM↑ + CTR↓ + frequency↑ = classic signature `[C]`. Winning creative peaks days 7–21; plan rotation every ~21–28 days (big budget) / on-trigger (low budget).
- Kill/scale decisions on 7-day data (tables below); budget reallocation toward winners in ≤20% steps.
- Launch new creative tests; judge at 50+ conversions/variant minimum (100+ over ≥2 weeks for significance) `[C]`.
- Learning hygiene: % of spend in learning; Learning Limited fixes (consolidation is the main lever for small lead-gen).
- Signal check: EMQ trend + dedup.

### Monthly
- Merge ad sets spending <€20/day with overlapping audiences; refresh custom/LAL seeds (last 90d); 90-day trends; structure audit vs current Meta best practice; client report (→ ties into `meta-ads-report` skill).

### Kill rules

| Rule | Threshold | Confidence |
|---|---|---|
| Stop-loss, 0 conv (aggressive) | spend >1.5× target CPA, last 3 days | `[C]` |
| Stop-loss, 0 conv (mainstream) | spend ≥2× target CPA | `[C]` |
| Statistical kill, 0 conv | spend ≥3× target CPA (~95% confidence true loser) | `[C]` |
| High CPA with data | CPA >2–3× target after ≥3 days & several conversions | `[C]` |
| Soft response | CPA >1.4× target for 3 days → cut budget 30% + alert (not pause) | `[X]` |
| Fatigue kill | frequency >4 AND CTR −20%+ → retire creative | `[C]` |
| Guardrails | min €100 spend AND 2,000+ impressions before any CPA/ROAS pause; never on same-day data; never during first 72h | `[C]` |
| Early-stage exception | below ~2× target-CPA spend judge only CTR/CPC/hook rate, not CPA | `[C]` |
| Pause, don't delete | preserves history; paused ads keep accruing attributed conversions | `[C]` |

### Scale rules

| Rule | Threshold | Confidence |
|---|---|---|
| Vertical step | +10–20% when 7d CPA ≤ target / ROAS ≥ target | `[C]` |
| Conversion floor | ≥10 conversions in the 7d window before scaling | `[C]` |
| Frequency | one increase per 2–4 days; never stack | `[C]` |
| Ceiling | single change >~20% = significant-edit risk (or use UI safe number) | `[M/C]` |
| Order | stop-loss rules deployed before scaling rules | `[C]` |
| Learning | no budget increases while in learning | `[C]` |

### Wait rules

| Rule | Threshold | Confidence |
|---|---|---|
| Post-launch freeze | no edits for 72h; first real read day 3; deep dive day 14 | `[C]` |
| Judgment window | 5–7 days before any CPA/ROAS verdict; 1,000+ impressions & 20–30 clicks for CTR reads | `[C]` |
| Post-edit freeze | significant edit = relaunch (~7d / 50 events again) | `[M]` |
| Batch edits | all changes in one session | `[C]` |
| Pacing patience | ignore <15% single-day deviation | `[C]` |

### Automated rules: automate vs alert-only
- **Safe to automate** `[C]`: midnight stop-loss (0 conv, spend >1.5–2× CPA, last-3d window); spend caps + 85%-of-budget alerts; scale +20% with ROAS floor and ≥10 conv/7d; fatigue & CPM +20% **alerts** (notification-only); weekend budget shifts.
- **Pitfalls** `[C]`: conversion-based rules on "today" ranges (use last-7-days for conversion conditions; "today" only for spend); rules firing on entities in learning; premature thresholds (€20–50 pause); conflicting rules (scale + pause same entity); Meta-only ROAS killing profitable ad sets.
- Judgment-bound work (creative, strategy, reallocations) stays human.

---

## 6. Implications for the daily-meta skill (synthesis, to validate with Povilas)

1. **Tier the logic by budget** — low-budget accounts (<~€50/day) get the health-scan-only daily + weekly action day; big accounts get daily attention with scale/kill evaluation. Thresholds and creative cadence differ per tier (§3 vs §4).
2. **Per-client target-KPI registry is a prerequisite** — every kill/scale rule is expressed in multiples of target CPA/CPL/CPS/ROAS. Without targets, rules degrade to trailing-average anomaly detection.
3. **"No action" must be a first-class output** — the skill should say "viskas OK" most days and mean it; every recommendation must cite which rule fired with which numbers.
4. **Label provisional data** — yesterday's CPA/ROAS marked provisional (settles ~72h); decisions from 7d windows or the D-9..D-3 mature window; WoW same-weekday comparisons.
5. **Respect learning discipline** — track last-significant-edit per ad set; suppress action recommendations during the 72h/learning freeze; batch all proposed edits into one session per entity.
6. **LT calibration** — broad-only default, no interest slicing recommendations; frequency tolerance up to 3–4 steady-state on conversions if KPI holds; creative refresh triggers (freq >3.5 + CTR −30% from peak) over calendar cadence at low spend.
7. **2026 attribution guard** — comparisons that cross Jan/Mar 2026 need caveats; report click-only for skeptical clients; verify current windows in-account before hard-coding.
8. **Execution guardrails** — which actions the skill may auto-execute via Meta MCP (pause obvious losers? nothing?) vs recommend-only, per Povilas's answer. Order of operations: stop-loss before scaling.

---

## 7. Caveats

- Jon Loomer and some Meta Help Center pages returned 403 to direct fetch in parts of the research — positions reconstructed from search excerpts + corroborating coverage; three Help Center articles were pulled in full via Meta MCP.
- "Consensus" numbers cluster across 3+ independent sources but are heuristics, not platform mechanics (frequency 3.0 vs 3.2 is noise).
- Jan/Mar 2026 attribution changes and the March 2026 Flexible Format removal are recent — **verify current state in Ads Manager before hard-coding into the skill**.
- Specific vendor stats (+17% conversions from 25-creative consolidation, 68% CPA delta from learning hygiene) are directional, not guarantees.

## 8. Key sources

Meta-official: Business Help Center 112167992830700 (learning phase), 316478108955072 (significant edits), 269269737396981 (learning limited), 793748385630490 (Advantage+ audience), 1113453135474912 (ROAS goal); engineering.fb.com Andromeda post (Dec 2024).

Practitioners/coverage (selection): jonloomer.com (learning-phase edits, budget increases, attribution 2026, opportunity score, existing-customer cap); ppc.land (attribution rewrite, Threads global, opportunity score); foxwelldigital.com & madgicx.com (ASC post-budget-cap); theoptimizer.io (bidding 2026, automation rules); triplewhale.com (lift tests, creative fatigue); within.co (marginal metrics); taylorsicard.com / Motion (creative benchmarks 2026); billo.app & themtmagency.com & jetfuel.agency (Andromeda); admanage.ai & coinis.com (kill rules); adamigo.ai & goodmorningco.com (frequency benchmarks); benly.ai & rocketshiphq.com (scaling); leadenforce.com & fiveninestrategy.com & dataslayer.ai (attribution lag); superscale.ai & segwise.ai (CBO/ABO); roaspig.com (audience sizing, test minimums); leadsync.me (instant forms); invoca.com (call ads); hightouch.com & 360om.agency (learning-phase cost stats); adadvisor.ai (DWM cadence); heathmedia.co.uk (Ben Heath low-budget); ctthedisrupter.medium.com (Tichenor lead-gen).
