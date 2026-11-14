"""One-off migration: gemini Decisions cache v1 -> v2.

State v2 (see residents.state / residents.STATE_VERSION) describes the "capital region" municipality
type as "city of 50 000+", so every gemini cache file gets a new hash. For each existing v1 file in
data/decisions/:
- lines whose archetype is NOT a capital-region one are copied verbatim into the v2 file — their state
  text is byte-identical between v1 and v2 (only lives_in differs, and only for capital-region keys)
- capital-region keys are re-asked once against the Decisions API and appended to the v2 file
v1 files are left on disk during the run; delete them once the v2 files are verified (git keeps them).

Run:  .venv/bin/python src/migrate_decisions_v2.py            (needs GEMINI_API_KEY in .env)
      .venv/bin/python src/migrate_decisions_v2.py --dry-run  (counts only, no API calls)
"""
import argparse, asyncio, json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import residents as js

CAPITAL = "capital region"
MT = js.KEY.index("muni_type")
CONC = 10                     # Tier-1 Decisions quota is 1 500 RPM / 1M TPM — stay well under it
ENGINE = "gemini"
FILE_RE = re.compile(r"(?P<prog>breast|bowel|cervix)_(?P<sc>.+)_[0-9a-f]{8}\.jsonl$")


def migrate(path, dry=False):
    m = FILE_RE.match(path.name)
    if not m:
        print("skip (unrecognised name):", path.name)
        return 0, 0
    prog, sc = m["prog"], m["sc"]
    v2 = js.cache_path(prog, sc, ENGINE)
    if v2 == path:
        print("already v2:", path.name)
        return 0, 0
    have = set(js.read_cache(v2))
    keep, todo = [], []
    for line in path.read_text().splitlines():
        r = json.loads(line)
        key = tuple(r["key"])
        if key in have:
            continue                          # already migrated (resumable)
        if key[MT] == CAPITAL:
            todo.append((key, js.state(key, prog, sc, ENGINE)))
        else:
            keep.append(line)
    if dry:
        print(f"{path.name} -> {v2.name}: copy {len(keep)}, re-ask {len(todo)}")
        return len(keep), len(todo)
    v2.parent.mkdir(parents=True, exist_ok=True)
    if keep:
        with v2.open("a") as f:
            for line in keep:
                f.write(line + "\n")
    print(f"{path.name} -> {v2.name}: copied {len(keep)}, re-asking {len(todo)}")
    if todo:
        asyncio.run(js.ask(todo, prog, v2, conc=CONC, engine=ENGINE))
    return len(keep), len(todo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    files = sorted(js.CACHE[ENGINE].glob("*.jsonl"))
    tot_k = tot_t = 0
    for p in files:
        k, t = migrate(p, dry=args.dry_run)
        tot_k += k; tot_t += t
    print(f"total: copied {tot_k}, {'would re-ask' if args.dry_run else 're-asked'} {tot_t}")


if __name__ == "__main__":
    main()
