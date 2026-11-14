"""What the public data says, printed with sources. The starting point for the story; re-run after `make data`.

Usage: python src/findings.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import datastore as ds

SHORT = lambda n: n   # datastore already returns short English names


def ranking(key, n=5):
    v = ds.values(key)
    xs = sorted(v["values"].items(), key=lambda kv: kv[1]["value"], reverse=not v["higher_is_better"])
    print(f"\n## {v['label']} ({v['year']}), Finland {v['national']}{' · target ' + str(v['target']) if v['target'] else ''}")
    print("   worst:", ", ".join(f"{SHORT(r['name'])} {r['value']}" for _, r in xs[:n]))
    print("   best: ", ", ".join(f"{SHORT(r['name'])} {r['value']}" for _, r in xs[-n:][::-1]))
    if v["target"]:
        below = [SHORT(r["name"]) for _, r in xs if r["value"] < v["target"]]
        print(f"   below target: {len(below)}/{len(xs)}: {', '.join(below)}")
    print(f"   source: {v['source']['url']}")


def main():
    print("# Findings from public data (THL Sotkanet, Finnish Cancer Registry figures)")
    for k in ("screen_breast", "screen_cervix", "screen_bowel", "surv_bowel", "surv_cervix", "surv_breast"):
        ranking(k)

    print("\n## Screening gap to 80 %, people per year (computed: invited = attended / rate)")
    for k in ("screen_breast", "screen_cervix", "screen_bowel"):
        gaps = [g for c in ds.values(k)["values"] if (g := ds.screening_gap(k, c)) and g["missing_per_year"] > 0]
        total = sum(g["missing_per_year"] for g in gaps)
        top = sorted(gaps, key=lambda g: -g["missing_per_year"])[:4]
        print(f"   {k}: {total} in {len(gaps)} counties; largest: " + ", ".join(f"{SHORT(g['name'])} {g['missing_per_year']}" for g in top))

    print("\n## Does detection line up with outcome? (county level, n = 23, ecological)")
    for a, b in (("screen_cervix", "surv_cervix"), ("screen_breast", "surv_breast"), ("screen_bowel", "surv_bowel")):
        c = ds.correlation(a, b, "county")
        print(f"   {a} vs {b}: r = {c['r']} (n = {c['n']}, {c['year']})" if c else f"   {a} vs {b}: no common year")
    print("   note: colorectal screening started in 2022; survival covers patients diagnosed 2015-2024, so it cannot reflect screening yet")

    print("\n## Is low attendance about language? (municipality level)")
    for k in ("screen_breast", "screen_cervix", "screen_bowel"):
        c = ds.correlation(k, "foreign_lang")
        print(f"   {k} vs foreign-language share: r = {c['r']} (n = {c['n']}, {c['year']})")
    print("   caveat: ecological; private and occupational mammography count as non-attendance (likely in the capital region)")


if __name__ == "__main__":
    main()
