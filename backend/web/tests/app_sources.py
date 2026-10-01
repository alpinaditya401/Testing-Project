"""Read app.js together with the modules it imports.

app.js used to be one file, and several checkers assert on its text. Fase 4 splits
it into ES modules, so a plain read of app.js would only see the shrinking remainder
and those assertions would pass or fail for the wrong reason. Following the import
graph keeps them looking at the same code as before.
"""
import re
from pathlib import Path

IMPORT = re.compile(r"""^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"](\./[^'"]+)['"]""", re.M)


def app_js_text(js_dir, entry='app.js'):
    """Concatenate the entry module and every local module reachable from it."""
    js_dir = Path(js_dir)
    seen, order, pending = set(), [], [entry]
    while pending:
        name = pending.pop(0)
        path = (js_dir / name).resolve()
        if path in seen or not path.exists():
            continue
        seen.add(path)
        text = path.read_text(encoding='utf-8')
        order.append(text)
        for spec in IMPORT.findall(text):
            pending.append(str((path.parent / spec).resolve().relative_to(js_dir.resolve())))
    return '\n'.join(order)
