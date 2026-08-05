"""Runtime settings (env-driven)."""
from __future__ import annotations

import os
import uuid

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_run_id() -> str:
    """Fresh per process, so one demo run's counts never contaminate another's."""
    pinned = os.environ.get("API_RUN_ID", "").strip()
    return pinned or f"api-{uuid.uuid4().hex[:12]}"


class Settings(BaseSettings):
    # env_ignore_empty: an empty env var means "unset", so field defaults and factories
    # still apply rather than yielding "". compose writes some vars as "" deliberately.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    database_url: str = "postgresql://pwa:pwa@localhost:5432/pwa"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic: str = "pwa/telemetry/#"
    mqtt_enabled: bool = False

    #: Stable client id + clean_session=False give a DURABLE session, so a broker restart
    #: does not discard the subscription or any in-flight QoS-1 message.
    mqtt_client_id: str = "pwa-api-ingest"

    #: paho defaults to 60s, which alone exceeds the 30s recovery budget scored by R1.2.
    mqtt_keepalive_s: int = 10

    #: paho's reconnect backoff defaults to a 120s cap — four times the budget.
    mqtt_reconnect_max_delay_s: int = 4

    #: Bounded hand-off queue. Unbounded, a database outage would let paho keep acking
    #: while memory grew until the process died; bounded, an overflowing message is
    #: simply not acked and the broker redelivers it.
    ingest_queue_max: int = 10_000

    api_run_id: str = ""

    #: Explicit path to the serialized model. Blank means "discover it" — see
    #: `app.model.resolve_model_path`, which prefers the copy baked into the image.
    model_path: str = ""

    #: The periodic scoring pass behind scored item 3.3. Switchable so a test, or a demo
    #: rehearsal that only exercises topic ๑, can run the API without it.
    scoring_enabled: bool = True

    #: Seconds between scoring passes. Item 3.3 budgets 30s for the whole chain.
    scoring_interval_s: float = 10.0

    #: Path to the REAL curated dataset. Blank means "not mounted", which degrades the
    #: /api/curated routes to 503 and leaves every other route untouched — the API image
    #: does not bake `data/` in, compose bind-mounts it (see infra/docker-compose.yml).
    curated_path: str = ""

    #: The demo-scenario endpoint (`POST /api/demo/scenario`). Default OFF, so the
    #: injection surface simply does not respond outside an explicitly-configured demo
    #: stack — compose turns it on; nothing else does.
    demo_controls: bool = False

    #: The Rayong pipe-GIS view (PR-G). Default OFF — the code lands dark; turning it on
    #: is a deliberate, permission-gated act (docs/data/pipe-ry-provenance.md). Off, the
    #: /api/twin/gis routes answer 404 and nothing else changes.
    pipe_gis_enabled: bool = False

    #: Directory holding the pre-built bundle: manifest.json, network.geojson,
    #: map_ta_phut.geojson. Blank + enabled is a broken configuration -> routes 503.
    pipe_gis_dir: str = ""

    #: Upper bound on a served GeoJSON file. The audited full network is ~6.6 MB; 50 MB
    #: leaves growth room while refusing to stream an absurd or swapped file.
    pipe_gis_max_bytes: int = 50_000_000

    #: Comma-separated browser origins allowed to call this API cross-origin.
    #:
    #: Defaulted, not required, so every existing `Settings()` call site keeps working.
    #: The default is the Vite dev server. In the normal setup the browser talks to the
    #: API THROUGH the Vite proxy and is therefore same-origin, so CORS is the belt to
    #: that braces: it covers a judge hitting the API directly, or a built `dist/` served
    #: from another origin.
    #:
    #: Deliberately never "*": `allow_credentials` with a wildcard is rejected by every
    #: browser anyway, and reflecting an arbitrary origin is not something to ship.
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        """`cors_origins` split and cleaned. Empty entries are dropped, not sent as "".

        A `*` entry is REJECTED here rather than passed through. The middleware is
        configured with `allow_credentials=True`; combined with a wildcard that is both
        rejected outright by every browser and, if a browser did honour it, a
        credentialed request from any origin on the internet. Refusing at configuration
        time turns a silent misconfiguration into a startup failure.

        Raises:
            ValueError: if any entry is `*`.
        """
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if "*" in origins:
            raise ValueError(
                "CORS_ORIGINS must not contain '*': the API sends credentials, and a "
                "wildcard origin with credentials is invalid. List the exact origins."
            )
        return origins

    @field_validator("api_run_id")
    @classmethod
    def _fill_run_id(cls, value: str) -> str:
        return value if value.strip() else _default_run_id()


def get_settings() -> Settings:
    return Settings()
