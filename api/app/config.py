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

    @field_validator("api_run_id")
    @classmethod
    def _fill_run_id(cls, value: str) -> str:
        return value if value.strip() else _default_run_id()


def get_settings() -> Settings:
    return Settings()
