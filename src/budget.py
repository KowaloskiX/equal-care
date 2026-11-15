"""Spend guard for the public demo's live (paid) engine calls.

Thread-safe in-memory counters over rolling windows; they reset on restart, which is acceptable for
a demo (and documented in the README). Cached paths never call take(): the caller checks the budget
only on a cache miss, before any paid call runs, so a rejected request costs nothing and an approved
one is charged exactly once (no partial spending).

Limits come from env vars; a value of 0 disables that kind of live call entirely.
"""
import os, threading, time

_DAY, _HOUR = 24 * 3600, 3600


class Exceeded(Exception):
    """take() raises this when a live-call window is spent. The API maps it to HTTP 429."""


_LOCK = threading.Lock()
_BUCKETS: dict[str, list[tuple[float, int]]] = {}   # window key -> [(timestamp, units)], oldest first


def _lim(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _spent(name: str, now: float, window: int) -> int:
    evs = _BUCKETS.setdefault(name, [])
    cut = now - window
    while evs and evs[0][0] <= cut:
        evs.pop(0)
    return sum(u for _, u in evs)


# window key -> (env limit, window seconds, units charged per run; None = the caller's `units`)
def _rules(kind: str, ip: str | None):
    if kind == "report":
        return [("report/day", _lim("REPORT_LIVE_PER_DAY", 20), _DAY, 1,
                 "The public demo's live report budget is used up for today. "
                 "The map and cached counties still work."),
                (f"report/ip/{ip}", _lim("REPORT_LIVE_PER_IP_HOUR", 3), _HOUR, 1,
                 "You have generated several reports in the last hour — try again later.")]
    if kind == "decisions":
        return [("decisions/day", _lim("DECISIONS_LIVE_PER_DAY", 2000), _DAY, None,
                 "The public demo's live budget is used up for today. "
                 "Cached counties and interventions still work."),
                (f"whatif/ip/{ip}", _lim("WHATIF_LIVE_PER_IP_HOUR", 2), _HOUR, 1,
                 "Too many live simulations in a row from your address — "
                 "cached combinations still work.")]
    raise ValueError(f"unknown budget kind {kind!r}")


def take(kind: str, ip: str | None = None, units: int = 1):
    """Reserve budget for a live engine call (units = number of engine calls, e.g. len(todo)).
    Checks every window first and records nothing when any is spent."""
    now = time.time()
    rules = [(name, limit, window, units if u is None else u, msg)
             for name, limit, window, u, msg in _rules(kind, ip)]
    with _LOCK:
        for name, limit, window, n, msg in rules:
            if _spent(name, now, window) + n > limit:
                raise Exceeded(msg)
        for name, _, _, n, _ in rules:
            _BUCKETS[name].append((now, n))


def reset():
    """Drop every counter (tests; a process restart already resets this in-memory state)."""
    with _LOCK:
        _BUCKETS.clear()
