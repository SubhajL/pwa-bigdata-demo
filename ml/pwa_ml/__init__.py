"""PWA predictive-maintenance model (slice S5).

Named `pwa_ml`, deliberately NOT `app`: `api/app` and `simulator/app` are already two
distinct top-level packages called `app`, and a third would make the collision that
`api/tests/conftest.py` documents strictly worse.

Every value this package produces is SIMULATED, including the training data itself, which
is generated rather than observed.
"""
