#!/usr/bin/env python3
"""daily-meta trend charts — SocialAds dark theme.

Usage:
    python trend_charts.py input.json outdir [--all]

Input JSON:
{
  "date": "2026-07-22",
  "clients": [
    {
      "name": "Gama Displays",
      "kpi_name": "CPL",              # CPL | CPS | ROAS | CPM | CPE ...
      "kpi_unit": "€",                # "€" | "$" | "×"
      "higher_is_better": false,       # true for ROAS
      "target": 9.0,                   # null if not set
      "kpi_now": 8.4,                  # closed-7d value (D-8..D-2)
      "wow_delta_pct": -12.3,          # closed 7d vs prior 7d, null if no data
      "verdict": "gerėja",            # gerėja | blogėja | stabilu | nėra duomenų
      "status": "ok",                 # ok | warn | alert
      "flags": ["F1: freq 3,8 > 3,5"],# short rule citations for grid tooltip line
      "series": [ {"date": "2026-06-18", "kpi": 8.1, "spend": 25.0}, ... ]  # ~30 d
    }
  ]
}

Outputs:
    portfolio_grid.png                     — all clients, one row each
    {slug}_trend.png                       — per-client detail; status != "ok" only,
                                             or every client with --all
PNGs are plain RGB (no palette compression — breaks some viewers).
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt

BG = "#15181A"
FG = "#FFFFFF"
MUTED = "#8A8F94"
DIVIDER = "#2A2D30"
ACCENT = "#6246FB"
POS = "#2d8c5b"
POS_SOFT = "#54c081"
NEG = "#8c2d2d"
NEG_SOFT = "#c05454"
WARN = "#c0a054"

PROVISIONAL_DAYS = 3

VERDICT_COLOR = {"gerėja": POS_SOFT, "blogėja": NEG_SOFT, "stabilu": MUTED, "nėra duomenų": MUTED}
STATUS_COLOR = {"ok": POS_SOFT, "warn": WARN, "alert": NEG_SOFT}


def esc(s):
    """Escape $ so matplotlib doesn't switch into mathtext mode."""
    return s.replace("$", "\\$")


def wow_arrow(wow):
    """Metric-direction arrow (Povilas's report convention); color carries the verdict."""
    if wow is None:
        return "·"
    if wow > 1:
        return "↑"
    if wow < -1:
        return "↓"
    return "→"


def fmt_num(v, dec=2):
    """LT format: space thousands, comma decimals."""
    if v is None:
        return "—"
    if abs(v) < 0.01 and v != 0:
        dec = 4
    elif abs(v) < 0.1 and v != 0:
        dec = 3
    s = f"{v:,.{dec}f}".replace(",", " ").replace(".", ",")
    return s


def fmt_kpi(v, unit):
    if v is None:
        return "—"
    if unit == "×":
        return f"{fmt_num(v, 2)}×"
    return f"{fmt_num(v, 2)} {unit}"


def slugify(name):
    out = []
    for ch in name:
        if ch.isalnum():
            out.append(ch)
        elif ch in " -":
            out.append("_")
    return "".join(out).strip("_") or "klientas"


def parse_series(series):
    dates, kpis, spends = [], [], []
    for row in series:
        dates.append(datetime.strptime(row["date"], "%Y-%m-%d"))
        kpis.append(row.get("kpi"))
        spends.append(row.get("spend") or 0.0)
    return dates, kpis, spends


def rolling7(values):
    out = []
    for i in range(len(values)):
        window = [v for v in values[max(0, i - 6): i + 1] if v is not None]
        out.append(sum(window) / len(window) if window else None)
    return out


def base_axes(ax):
    ax.set_facecolor(BG)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(colors=MUTED, labelsize=8, length=0)
    ax.grid(axis="y", color=DIVIDER, linewidth=0.6, alpha=0.8)


# ---------------------------------------------------------------- portfolio grid

def render_portfolio(data, outdir):
    clients = data["clients"]
    n = max(len(clients), 1)
    row_h = 0.52
    fig_h = 1.45 + n * row_h
    fig = plt.figure(figsize=(10.4, fig_h), facecolor=BG)

    date_lt = data.get("date", "")
    fig.text(0.045, 1 - 0.32 / fig_h, "Meta Ads — dienos apžvalga", color=FG,
             fontsize=15, fontweight="bold", va="top")
    fig.text(0.045, 1 - 0.62 / fig_h, date_lt, color=MUTED, fontsize=9.5, va="top")

    # status legend, top-right at date height
    ly = 1 - 0.50 / fig_h
    for x, col, label in [(0.72, POS_SOFT, "● gerai"), (0.81, WARN, "● dėmesio"),
                          (0.925, NEG_SOFT, "● reikia veiksmo")]:
        fig.text(x, ly, label, color=col, fontsize=8, va="top")

    # column headers
    hy = 1 - 1.02 / fig_h
    for x, ha, label in [(0.075, "left", "KLIENTAS"), (0.52, "center", "30 D. TRENDAS"),
                         (0.685, "left", "SAV. vs SAV."), (0.965, "right", "KPI DABAR / TIKSLAS")]:
        fig.text(x, hy, label, color=MUTED, fontsize=7.5, ha=ha, va="center")

    top = 1 - 1.18 / fig_h
    for i, c in enumerate(clients):
        y = top - i * (row_h / fig_h)
        yc = y - 0.5 * row_h / fig_h  # row center

        # divider
        fig.add_artist(plt.Line2D([0.03, 0.97], [y - row_h / fig_h] * 2,
                                  color=DIVIDER, linewidth=0.7, transform=fig.transFigure))
        # status dot
        fig.text(0.052, yc, "●", color=STATUS_COLOR.get(c.get("status", "ok"), MUTED),
                 fontsize=11, ha="center", va="center")
        # name
        fig.text(0.075, yc, c["name"], color=FG, fontsize=10.5, va="center")

        # sparkline
        ax = fig.add_axes([0.40, y - 0.88 * row_h / fig_h, 0.24, 0.72 * row_h / fig_h])
        ax.set_facecolor(BG)
        ax.axis("off")
        _, kpis, _ = parse_series(c.get("series", []))
        pts = [(j, v) for j, v in enumerate(kpis) if v is not None]
        if len(pts) >= 2:
            xs, ys = zip(*pts)
            ax.plot(xs, ys, color=VERDICT_COLOR.get(c.get("verdict"), MUTED),
                    linewidth=1.4, solid_capstyle="round")
            ax.plot(xs[-1], ys[-1], "o", color=FG, markersize=2.6)
            lo, hi = min(ys), max(ys)
            pad = (hi - lo) * 0.25 or (hi or 1) * 0.25
            ax.set_ylim(lo - pad, hi + pad)
            ax.set_xlim(-0.5, len(kpis) - 0.5)
        else:
            ax.text(0.5, 0.5, "nėra duomenų", color=MUTED, fontsize=7.5,
                    ha="center", va="center", transform=ax.transAxes)

        # WoW % with metric-direction arrow; color carries the verdict
        v = c.get("verdict", "stabilu")
        wow = c.get("wow_delta_pct")
        wow_s = f"{'+' if wow is not None and wow > 0 else ''}{fmt_num(wow, 1)} %" if wow is not None else "—"
        fig.text(0.685, yc, f"{wow_arrow(wow)} {wow_s}",
                 color=VERDICT_COLOR.get(v, MUTED), fontsize=10, va="center", style="italic")

        # KPI now vs target
        kpi_s = fmt_kpi(c.get("kpi_now"), c.get("kpi_unit", "€"))
        tgt = c.get("target")
        tgt_s = f" / tikslas {fmt_kpi(tgt, c.get('kpi_unit', '€'))}" if tgt is not None else ""
        fig.text(0.965, yc, esc(f"{c.get('kpi_name', 'KPI')} {kpi_s}{tgt_s}"),
                 color=FG, fontsize=9, va="center", ha="right")

    out = Path(outdir) / "portfolio_grid.png"
    fig.savefig(out, facecolor=BG, dpi=140, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    return out


# ---------------------------------------------------------------- client detail

def render_client(c, outdir):
    dates, kpis, spends = parse_series(c.get("series", []))
    if not dates:
        return None
    fig, ax = plt.subplots(figsize=(9.2, 4.4), facecolor=BG)
    base_axes(ax)

    verdict = c.get("verdict", "stabilu")
    unit = c.get("kpi_unit", "€")
    cur = c.get("currency", "€")
    fig.suptitle(esc(f"{c['name']} — {c.get('kpi_name', 'KPI')} {fmt_kpi(c.get('kpi_now'), unit)}"),
                 color=FG, fontsize=13, fontweight="bold", x=0.065, ha="left", y=0.97)
    ax.set_title(f"{wow_arrow(c.get('wow_delta_pct'))} {verdict}   ·   30 d. trendas, 7 d. slenkantis vidurkis",
                 color=VERDICT_COLOR.get(verdict, MUTED), fontsize=9.5, loc="left", pad=10, style="italic")

    # spend bars on secondary axis
    ax2 = ax.twinx()
    ax2.set_facecolor(BG)
    for spine in ax2.spines.values():
        spine.set_visible(False)
    ax2.bar(dates, spends, width=0.72, color=MUTED, alpha=0.28, zorder=1)
    ax2.tick_params(colors=MUTED, labelsize=7.5, length=0)
    ax2.set_ylim(0, max(spends) * 3 if any(spends) else 1)
    ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: esc(f"{fmt_num(v, 0)} {cur}")))
    ax2.grid(False)

    # provisional zone (last N days)
    if len(dates) > PROVISIONAL_DAYS:
        ax.axvspan(dates[-PROVISIONAL_DAYS] - timedelta(hours=12), dates[-1] + timedelta(hours=12),
                   color=FG, alpha=0.045, zorder=0)
        ax.text(dates[-PROVISIONAL_DAYS] + (dates[-1] - dates[-PROVISIONAL_DAYS]) / 2, 0.985,
                "dar sėda", color=MUTED, fontsize=7.5, ha="center", va="top",
                transform=ax.get_xaxis_transform())

    # daily KPI line (gaps preserved)
    seg_x, seg_y = [], []
    for d, v in zip(dates, kpis):
        if v is None:
            if len(seg_x) > 1:
                ax.plot(seg_x, seg_y, color=FG, linewidth=1.0, alpha=0.45, zorder=2)
            seg_x, seg_y = [], []
        else:
            seg_x.append(d)
            seg_y.append(v)
    if len(seg_x) > 1:
        ax.plot(seg_x, seg_y, color=FG, linewidth=1.0, alpha=0.45, zorder=2)

    # 7d rolling
    roll = rolling7(kpis)
    pts = [(d, v) for d, v in zip(dates, roll) if v is not None]
    if pts:
        xs, ys = zip(*pts)
        ax.plot(xs, ys, color=ACCENT, linewidth=2.4, zorder=3, solid_capstyle="round")

    # target line
    tgt = c.get("target")
    if tgt is not None:
        ax.axhline(tgt, color=POS, linewidth=1.2, linestyle=(0, (5, 4)), zorder=2)
        ax.text(dates[0], tgt, esc(f"  tikslas {fmt_kpi(tgt, unit)}"), color=POS_SOFT,
                fontsize=8, va="bottom")

    ax.xaxis.set_major_locator(mdates.DayLocator(interval=5))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%m-%d"))
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: esc(fmt_kpi(v, unit))))
    ax.margins(x=0.015)

    # legend line, bottom-left
    fig.text(0.065, 0.015,
             "— dienos KPI (blyški)   — 7 d. vidurkis (violetinė)   ▬ spend (stulpeliai)",
             color=MUTED, fontsize=7.5)

    out = Path(outdir) / f"{slugify(c['name'])}_trend.png"
    fig.savefig(out, facecolor=BG, dpi=140, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    render_all = "--all" in sys.argv
    if len(args) != 2:
        sys.exit("Usage: trend_charts.py input.json outdir [--all]")
    data = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    outdir = Path(args[1])
    outdir.mkdir(parents=True, exist_ok=True)

    written = [render_portfolio(data, outdir)]
    for c in data["clients"]:
        if render_all or c.get("status") in ("warn", "alert"):
            p = render_client(c, outdir)
            if p:
                written.append(p)
    for p in written:
        print(p)


if __name__ == "__main__":
    main()
