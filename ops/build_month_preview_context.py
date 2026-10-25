"""Build/publish the formal website's month calendar and exact boundary-week slices.

No scoring or monthly_bars writes. Uses existing protected publishing configuration.
Run once during each formal weekly update, before publishing the page.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import struct
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSET_NAME = "formal-month-preview-context.json"
RECORD = struct.Struct("<I8fB")
SHANGHAI = timezone(timedelta(hours=8))
SUFFIX = {"DCE": "DF", "SHFE": "SF", "CZCE": "ZF", "CFFEX": "IF", "GFEX": "GF", "INE": "INE"}


def trading_days(start: date, end: date, holidays: set[date]) -> list[date]:
    result = []
    while start <= end:
        if start.weekday() < 5 and start not in holidays:
            result.append(start)
        start += timedelta(days=1)
    return result


def exact_boundary(path: Path, days: list[date], bond: bool) -> dict:
    """Only official daily close records; no dynamic/night snapshots or missing-day fill."""
    payload = path.read_bytes()
    if not payload or len(payload) % RECORD.size:
        raise ValueError("day cache size invalid")
    rows = {}
    for raw in RECORD.iter_unpack(payload):
        ts = datetime.fromtimestamp(raw[0], timezone.utc)
        if ts.date() not in days:
            continue
        if (ts.hour, ts.minute, ts.second) != (7, 15 if bond else 0, 0):
            continue
        o, c, h, l, v = map(float, raw[1:6])
        if not all(math.isfinite(x) for x in (o, c, h, l, v)) or v < 0 or h < max(o, c) or l > min(o, c):
            raise ValueError("daily OHLC/volume invalid")
        if ts.date() in rows:
            raise ValueError("duplicate daily close")
        rows[ts.date()] = (o, h, l, c, v)
    if sorted(rows) != days:
        raise ValueError("official daily close coverage incomplete")
    values = [rows[d] for d in days]
    return {"start": days[0].isoformat(), "end": days[-1].isoformat(),
            "dates": [d.isoformat() for d in days], "price_source": "wenhua_day_exact",
            "o": values[0][0], "h": max(x[1] for x in values),
            "l": min(x[2] for x in values), "c": values[-1][3], "vol": sum(x[4] for x in values)}


def build_context(month: str, entries: list[dict], holidays: set[date], data_root: Path) -> dict:
    first = date.fromisoformat(month + "-01")
    first_days = trading_days(first, first + timedelta(days=20), holidays)
    if not first_days or first_days[0].month != first.month:
        raise ValueError("month has no initial trading day")
    start = first_days[0]
    monday = start - timedelta(days=start.weekday())
    end = trading_days(monday, monday + timedelta(days=4), holidays)[-1]
    slices, unavailable = {}, []
    if monday < first:
        days = trading_days(first, end, holidays)
        for entry in entries:
            symbol, exchange = entry["vt_symbol"].split(".")
            code = symbol + "." + SUFFIX[exchange]
            cache = data_root / entry["cache_dir"] / "day" / f"{entry['cache_id']:08d}.dat"
            try:
                slices[code] = exact_boundary(cache, days, symbol.lower() in {"tjq00", "tfjq00", "tljq00", "tsjq00"})
            except (OSError, ValueError, OverflowError) as error:
                unavailable.append({"symbol": code, "reason": type(error).__name__ + ": " + str(error)})
    return {"schema": "formal-month-preview/v1", "month": month,
            "generated_at": datetime.now(SHANGHAI).isoformat(),
            "holidays": sorted(d.isoformat() for d in holidays),
            "calendar_source": "formal trading_holidays.csv + weekdays; verify holiday coverage before update",
            "boundary_week_required": monday < first,
            "boundary_slices": slices, "unavailable_boundaries": unavailable}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", default=datetime.now(SHANGHAI).strftime("%Y-%m"))
    parser.add_argument("--mapping", type=Path, default=ROOT / "handover/config/weighted-symbol-map.json")
    parser.add_argument("--holidays", type=Path, default=ROOT / "str/trading_holidays.csv")
    parser.add_argument("--data-root", type=Path, default=Path(r"D:\wh6通用版\Data"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--push", action="store_true")
    args = parser.parse_args()
    entries = json.loads(args.mapping.read_text(encoding="utf-8-sig"))["entries"]
    with args.holidays.open(encoding="utf-8-sig") as handle:
        holidays = {date.fromisoformat(r["date"]) for r in csv.DictReader(handle)}
    if not any(d.year == int(args.month[:4]) for d in holidays):
        raise ValueError("holiday file does not cover target year; verify before publication")
    context = build_context(args.month, entries, holidays, args.data_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        raise FileExistsError("Do not overwrite previous context evidence: " + str(args.output))
    args.output.write_text(json.dumps(context, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"month": args.month, "boundary_week_required": context["boundary_week_required"],
                      "boundary_ready": len(context["boundary_slices"]),
                      "boundary_unavailable": len(context["unavailable_boundaries"])}))
    if args.push:
        if args.month != datetime.now(SHANGHAI).strftime("%Y-%m"):
            raise ValueError("Only the actual current month context may be published")
        config = json.loads((ROOT / "str/web_snapshot_config.json").read_text(encoding="utf-8-sig"))
        body = json.dumps({"p_secret": config["import_secret"], "p_name": ASSET_NAME,
                           "p_content": json.dumps(context, ensure_ascii=False),
                           "p_mime": "application/json; charset=utf-8"}).encode("utf-8")
        request = urllib.request.Request(config["supabase_url"].rstrip("/") + "/rest/v1/rpc/put_web_asset",
            data=body, method="POST", headers={"apikey": config["publishable_key"],
                "Authorization": "Bearer " + config["publishable_key"], "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=120) as response:
            response.read()
        print("[push] " + ASSET_NAME)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
