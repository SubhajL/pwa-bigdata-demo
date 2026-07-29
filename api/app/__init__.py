"""PWA demo POC API.

Slice S6 made this package import `pwa_ml` (the model lives in `ml/`, a sibling
directory). The container has no problem with that — `api/Dockerfile` copies the package
to `/srv/pwa_ml`, next to `app/`, so it is importable by name. A developer running
`uvicorn app.main:app` from `api/` has no such luck, and got

    ModuleNotFoundError: No module named 'pwa_ml'

before the app could start. Nothing caught it at first: the test suite's `conftest.py`
puts `ml/` on `sys.path` for its OWN interpreter, so every in-process test passed while
the two tests that spawn a real uvicorn subprocess failed to boot.

So the dev layout is resolved here, at the package root, before any submodule imports it.
The check is conditional: when `pwa_ml` already resolves — the container, or an installed
copy — nothing is touched.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

if importlib.util.find_spec("pwa_ml") is None:  # pragma: no cover - layout-dependent
    _ml_root = Path(__file__).resolve().parents[2] / "ml"
    if _ml_root.is_dir():
        sys.path.insert(0, str(_ml_root))
