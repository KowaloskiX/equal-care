"""Every number in a generated text must come from the tool results it was written from.

Ported from krakow-sim (src/data_agent.py: unverified). A number in the answer passes if it matches a number in the
results (2 % tolerance), a percentage in the results, or a share of two result numbers. Anything else is returned as
unverified and the UI marks it. Years, small counts (<= 12) and numbers from the question itself are exempt.
"""
import re

NUM = re.compile(r"(?<![\w.])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?\s*(%|\s?per ?cent|\s?prosenttia)?", re.I)


def numbers(text):
    """-> [(value, is_percent)]. Handles '28 686', '74.3 %', '74,3 %'. Ranges like 63-74 give two numbers."""
    out = []
    for m in NUM.finditer(text.replace("–", " ").replace("—", " ")):
        whole = re.sub(r"[   ]", "", m.group(1))
        x = float(whole + ("." + m.group(2) if m.group(2) else ""))
        out.append((x, bool(m.group(3))))
    return out


def _nums(obj):
    if isinstance(obj, dict):
        for v in obj.values(): yield from _nums(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj: yield from _nums(v)
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool): yield float(obj)
    elif isinstance(obj, str):
        for x, _ in numbers(obj): yield x


def unverified(answer, results, question=""):
    vals = set(_nums(results))
    pct = {v * 100 for v in vals if 0 <= v <= 1}
    free = {x for x, _ in numbers(question)}
    bad = []
    for x, is_pct in numbers(answer):
        if x in free or (x <= 12 and x == int(x)) or 1990 <= x <= 2040:
            continue
        if any(abs(x - v) <= max(0.02 * abs(v), 0.51) for v in vals | pct):
            continue
        if is_pct and any(b and abs(100 * a / b - x) <= 1.0 for a in vals for b in vals if 0 < a < b):
            continue
        # a difference of two results ("5 points below the national 68 %")
        if any(abs(abs(a - b) - x) <= 0.51 for a in vals for b in vals if a != b and abs(a) < 1000 and abs(b) < 1000):
            continue
        bad.append(x)
    return bad
