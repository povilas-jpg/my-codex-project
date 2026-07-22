#!/usr/bin/env python3
"""daily-meta deterministic rules engine.

Usage: python evaluate.py input.json outdir
Writes: outdir/alerts.json (rule results, LT strings) + outdir/chart_data.json (trend_charts.py input)

Input schema (built by the agent from Meta MCP fetches):
{
  "date": "2026-07-22",                      # today (run date); yesterday = D-1
  "clients": [{
    "name": "Gama Displays", "account_id": "...", "currency": "€", "tier": "low"|"big"|"auto",
    "targets": {"cpl": 10.0, "cps": null, "roas": null, "cpm": null},   # null/absent = no target
    "campaign_types": ["leads"],
    "campaigns": [{
       "name": "...", "objective": "OUTCOME_LEADS", "result_type": "Leads (form)",
       "active": true,
       "days": [["07-21", 15.71, 1, null], ...]    # [MM-DD, spend, results, roas|null]
    }],
    "freq7": [{"name": "...", "frequency": 1.79, "retargeting": false}],   # optional
    "delivery_issues": [{"entity": "ad", "name": "...", "parent_active": false, "message": "..."}],  # optional
    "account_errors": ["..."]                  # optional: payment/restriction level
  }]
}

All thresholds mirror references/rules.md. Windows (D = run date):
  yday = D-1 · last3 = D-3..D-1 · mature7 = D-9..D-3 · prior7 = D-16..D-10 · last30 = D-30..D-1
Conversion metrics in yday/last3 are PROVISIONAL (settle ~72h) — used only by K1 spend guard.
"""
import json
import sys
from datetime import date, timedelta

CFG = {
    "STOP_LOSS_MULT": 2.0,
    "TIER_SPLIT": 50.0,          # EUR/day, trailing 30d
    "FREQ_ACTION": 3.5,
    "FREQ_EMERGENCY": 4.5,
    "FREQ_RETARGETING_OK": 8.0,
    "MIN_CONV_VERDICT": 20,      # conversions per window for any verdict
    "NARROW_N": 50,              # conversions for ±10% band, else ±20%
    "MIN_CLICKS_VERDICT": 300,   # click-based KPIs (CPC)
    "NARROW_CLICKS": 1000,
    "K2_MULT": 2.0, "K2_MIN_SPEND": 100.0, "K2_MIN_CONV": 3,
    "S1_BEAT": 1.2, "S1_MIN_CONV": 10,
    "SPEND_ANOM": 0.4,           # yday vs mature7 daily avg
}

SALES_OBJ = ("OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES")
LEADS_OBJ = ("OUTCOME_LEADS",)
TRAFFIC_OBJ = ("LINK_CLICKS", "OUTCOME_TRAFFIC")


def fmt(v, dec=2):
    if v is None:
        return "—"
    s = f"{v:,.{dec}f}".replace(",", " ").replace(".", ",")
    return s


def windows(run_date):
    d = date.fromisoformat(run_date)
    def key(off):
        return (d - timedelta(days=off)).strftime("%m-%d")
    return {
        "yday": {key(1)},
        "last3": {key(i) for i in range(1, 4)},
        "mature7": {key(i) for i in range(3, 10)},
        "prior7": {key(i) for i in range(10, 17)},
        "last30": {key(i) for i in range(1, 31)},
    }


def campaign_kpi_kind(client):
    t = client.get("targets") or {}
    if t.get("roas"):
        return "roas"
    if t.get("cpl"):
        return "cpl"
    if t.get("cps"):
        return "cps"
    if t.get("cpm"):
        return "cpm"
    types = client.get("campaign_types") or []
    if "sales" in types:
        return "roas"
    if "traffic" in types:
        return "cpc"
    if "leads" in types:
        return "cpl"
    if "calls" in types:
        return "cps"
    return "cpl"


def relevant_campaigns(client, kind):
    camps = client.get("campaigns") or []
    if kind == "roas":
        sel = [c for c in camps if c.get("objective") in SALES_OBJ]
    elif kind == "cpc":
        sel = [c for c in camps if c.get("objective") in TRAFFIC_OBJ]
    elif kind in ("cpl", "cps"):
        sel = [c for c in camps if c.get("objective") in LEADS_OBJ or "call" in (c.get("result_type") or "").lower()]
    else:
        sel = camps
    return sel or camps


def agg(camps, day_set, kind):
    """-> (spend, n, kpi) ; kpi: cost-per for cpl/cps/cpc, weighted roas (total-spend denom) for roas."""
    sp = n = rev = 0.0
    for c in camps:
        for row in c.get("days", []):
            if row[0] in day_set:
                sp += row[1] or 0.0
                n += row[2] or 0
                if kind == "roas" and len(row) > 3 and row[3]:
                    rev += (row[1] or 0.0) * row[3]
    if kind == "roas":
        return sp, int(n), (rev / sp if sp else None)
    return sp, int(n), (sp / n if n else None)


def verdict(kind, cur, prev, n_cur, n_prev):
    higher_good = kind == "roas"
    click_based = kind == "cpc"
    min_n = CFG["MIN_CLICKS_VERDICT"] if click_based else CFG["MIN_CONV_VERDICT"]
    narrow_n = CFG["NARROW_CLICKS"] if click_based else CFG["NARROW_N"]
    if cur is None or prev is None or n_cur < min_n or n_prev < min_n:
        return "nėra duomenų" if cur is None else "per mažai duomenų", None, None
    band = 0.10 if (n_cur >= narrow_n and n_prev >= narrow_n) else 0.20
    w = (cur - prev) / prev * 100
    good = (w > band * 100 and higher_good) or (w < -band * 100 and not higher_good)
    bad = (w < -band * 100 and higher_good) or (w > band * 100 and not higher_good)
    return ("gerėja" if good else "blogėja" if bad else "stabilu"), round(w, 1), band


def campaign_age_days(camp, run_date):
    days = [r[0] for r in camp.get("days", []) if (r[1] or 0) > 0]
    if not days:
        return 0
    d = date.fromisoformat(run_date)
    first = min(days)
    year = d.year  # MM-DD keys assume series within the same trailing ~30d
    fd = date(year, int(first[:2]), int(first[3:]))
    if fd > d:
        fd = fd.replace(year=year - 1)
    return (d - fd).days


def evaluate_client(client, W, run_date):
    kind = campaign_kpi_kind(client)
    camps = relevant_campaigns(client, kind)
    cur_unit = client.get("currency", "€")
    unit = "×" if kind == "roas" else cur_unit
    targets = client.get("targets") or {}
    target = targets.get("roas") if kind == "roas" else targets.get(kind if kind != "cpc" else "cpc")
    all_camps = client.get("campaigns") or []

    sp_y, n_y, k_y = agg(camps, W["yday"], kind)
    sp_m, n_m, k_m = agg(camps, W["mature7"], kind)
    sp_p, n_p, k_p = agg(camps, W["prior7"], kind)
    sp_30, n_30, k_30 = agg(camps, W["last30"], kind)
    tot30 = agg(all_camps, W["last30"], "spend_only")[0] if all_camps else sp_30
    spend_per_day30 = tot30 / 30.0
    tier = client.get("tier")
    if tier in (None, "auto"):
        tier = "big" if spend_per_day30 >= CFG["TIER_SPLIT"] else "low"

    verd, wow, band = verdict(kind, k_m, k_p, n_m, n_p)
    alerts, proposals, queued = [], [], []

    for e in client.get("account_errors") or []:
        alerts.append({"rule": "H1", "sev": "red", "text": f"Accounto problema: {e}"})
    for di in client.get("delivery_issues") or []:
        if di.get("parent_active"):
            alerts.append({"rule": "H3", "sev": "red",
                           "text": f"Nepristatoma AKTYVIAME entity: {di.get('name')} — {di.get('message', '')[:120]}"})
        # paused-parent issues are noise — ignored (learned 2026-07-22: Gama false alarm)

    avg_daily_m = sp_m / 7.0 if sp_m else 0.0
    if avg_daily_m > 1.0:
        if sp_y == 0:
            alerts.append({"rule": "H3", "sev": "red",
                           "text": f"Vakar spend 0 € (7 d. vidurkis {fmt(avg_daily_m)} {cur_unit}/d) — patikrinti delivery/mokėjimus"})
        elif abs(sp_y - avg_daily_m) / avg_daily_m > CFG["SPEND_ANOM"]:
            alerts.append({"rule": "H5", "sev": "yellow",
                           "text": f"Spend anomalija: vakar {fmt(sp_y)} {cur_unit} vs 7 d. vidurkis {fmt(avg_daily_m)} {cur_unit}/d ({fmt((sp_y-avg_daily_m)/avg_daily_m*100,1)} %)"})

    cpa_target = targets.get("cpl") or targets.get("cps")
    if cpa_target:
        for c in [c for c in camps if c.get("active", True)]:
            s3, n3, _ = agg([c], W["last3"], "cpl")
            if n3 == 0 and s3 >= CFG["STOP_LOSS_MULT"] * cpa_target and campaign_age_days(c, run_date) > 3:
                (proposals if tier == "big" else proposals).append(  # K1 = emergency, same-day both tiers
                    {"rule": "K1", "action": "pause",
                     "entity": c["name"],
                     "text": f"Sustabdyti „{c['name']}“ — K1: {fmt(s3)} {cur_unit} per 3 d., 0 rezultatų (≥2× target {fmt(cpa_target)} {cur_unit})"})
        if k_m is not None and k_m > CFG["K2_MULT"] * cpa_target and sp_m >= CFG["K2_MIN_SPEND"] and n_m >= CFG["K2_MIN_CONV"]:
            item = {"rule": "K2", "action": "review",
                    "text": f"7 d. kaina {fmt(k_m)} {cur_unit} > 2× target ({fmt(cpa_target)} {cur_unit}) — peržiūrėti/mažinti biudžetą"}
            (proposals if tier == "big" else queued).append(item)

    if target and k_m is not None and n_m >= CFG["S1_MIN_CONV"]:
        beats = (k_m >= target * CFG["S1_BEAT"]) if kind == "roas" else (k_m <= target / CFG["S1_BEAT"])
        if beats:
            item = {"rule": "S1", "action": "scale",
                    "text": f"KPI {fmt(k_m)} {unit} gerokai geriau už tikslą {fmt(target)} {unit} ({n_m} konv./7 d.) — siūlyti didinti biudžetą +10–20 %"}
            (proposals if tier == "big" else queued).append(item)

    for f in client.get("freq7") or []:
        fq = f.get("frequency")
        if fq is None:
            continue
        limit_ok = CFG["FREQ_RETARGETING_OK"] if f.get("retargeting") else CFG["FREQ_EMERGENCY"]
        if f.get("retargeting") and fq <= CFG["FREQ_RETARGETING_OK"]:
            continue
        if fq > CFG["FREQ_EMERGENCY"]:
            proposals.append({"rule": "F2", "action": "creative",
                              "text": f"„{f['name']}“ 7 d. frequency {fmt(fq,2)} > {CFG['FREQ_EMERGENCY']} — keisti vizualus DABAR"})
        elif fq > CFG["FREQ_ACTION"]:
            queued.append({"rule": "F1", "action": "creative",
                           "text": f"„{f['name']}“ 7 d. frequency {fmt(fq,2)} > {CFG['FREQ_ACTION']} — planuoti vizualų atnaujinimą"})

    below_target = None
    if target and k_m is not None:
        worse = (k_m < target) if kind == "roas" else (k_m > target)
        if worse:
            gap = abs(k_m - target) / target * 100
            below_target = gap
            spend_guard = 100.0 if kind == "roas" else 5 * target
            if gap >= 20 and sp_m >= spend_guard:
                alerts.append({"rule": "T1", "sev": "yellow",
                               "text": f"7 d. KPI {fmt(k_m)} {unit} už tikslą {fmt(target)} {unit} blogiau {fmt(gap,1)} %"})

    sev = {"red": 3, "yellow": 2}
    worst = max([sev.get(a["sev"], 1) for a in alerts] + [3 if any(p["rule"] in ("K1", "F2") for p in proposals) else 0] + [0])
    if worst >= 3:
        status = "alert"
    elif worst == 2 or any(p["rule"] == "K2" for p in proposals) or (below_target is not None and verd == "blogėja"):
        status = "warn"
    else:
        status = "ok"

    daily = {}
    for c in camps:
        for row in c.get("days", []):
            d0 = daily.setdefault(row[0], [0.0, 0, 0.0])
            d0[0] += row[1] or 0.0
            d0[1] += row[2] or 0
            if kind == "roas" and len(row) > 3 and row[3]:
                d0[2] += (row[1] or 0.0) * row[3]
    series = []
    for dkey in sorted(daily):
        sp, n, rev = daily[dkey]
        kpi = (rev / sp if sp and rev else None) if kind == "roas" else (sp / n if n else None)
        series.append({"date": f"{date.fromisoformat(run_date).year}-{dkey}", "kpi": round(kpi, 3) if kpi else None, "spend": round(sp, 2)})

    return {
        "name": client["name"], "tier": tier, "status": status,
        "kpi_kind": kind, "kpi_unit": unit, "currency": cur_unit,
        "kpi_mature7": round(k_m, 3) if k_m else None, "n_mature7": n_m,
        "kpi_prior7": round(k_p, 3) if k_p else None, "n_prior7": n_p,
        "kpi_yday": round(k_y, 3) if k_y else None, "n_yday": n_y, "spend_yday": round(sp_y, 2),
        "kpi_30d": round(k_30, 3) if k_30 else None,
        "spend_30d": round(tot30, 2), "spend_per_day": round(spend_per_day30, 2),
        "target": target, "verdict": verd, "wow_pct": wow, "band_used": band,
        "below_target_pct": round(below_target, 1) if below_target else None,
        "alerts": alerts, "proposals": proposals, "queued": queued,
        "series": series,
    }


def main():
    if len(sys.argv) != 3:
        sys.exit("Usage: evaluate.py input.json outdir")
    data = json.loads(open(sys.argv[1], encoding="utf-8").read())
    run_date = data["date"]
    W = windows(run_date)
    out = [evaluate_client(c, W, run_date) for c in data["clients"]]

    order = {"alert": 0, "warn": 1, "ok": 2}
    out.sort(key=lambda c: (order.get(c["status"], 3), -(c["spend_per_day"] or 0)))

    chart = {"date": data.get("date_lt", run_date), "clients": [
        {"name": c["name"], "kpi_name": c["kpi_kind"].upper(), "kpi_unit": c["kpi_unit"],
         "higher_is_better": c["kpi_kind"] == "roas", "target": c["target"],
         "kpi_now": c["kpi_mature7"], "wow_delta_pct": c["wow_pct"], "verdict": c["verdict"],
         "status": c["status"], "currency": c["currency"], "series": c["series"]}
        for c in out]}

    import os
    os.makedirs(sys.argv[2], exist_ok=True)
    json.dump({"config": CFG, "clients": out}, open(f"{sys.argv[2]}/alerts.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(chart, open(f"{sys.argv[2]}/chart_data.json", "w", encoding="utf-8"), ensure_ascii=False)
    n_alert = sum(1 for c in out if c["status"] == "alert")
    n_warn = sum(1 for c in out if c["status"] == "warn")
    print(f"clients={len(out)} alert={n_alert} warn={n_warn} ok={len(out)-n_alert-n_warn}")
    for c in out:
        print(f"  {c['status']:5s} {c['name']:20s} {c['kpi_kind'].upper()} {c['kpi_mature7']} (n={c['n_mature7']}) verdict={c['verdict']} wow={c['wow_pct']} rules={[a['rule'] for a in c['alerts']]+[p['rule'] for p in c['proposals']]+[q['rule'] for q in c['queued']]}")


if __name__ == "__main__":
    main()
