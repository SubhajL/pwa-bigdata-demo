"""Runtime settings for the simulator (env-driven), slice S1."""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .models import FaultMode

#: Repo-root default, used when running gates on the host. In the container the
#: curated CSV is bind-mounted and CURATED_PATH points at /srv/data/curated/...
DEFAULT_CURATED = (
    Path(__file__).resolve().parents[2] / "data" / "curated" / "water_sold_by_branch.csv"
)


def _default_run_id() -> str:
    """Fresh per process, so message_ids never collide across simulator restarts.

    Reads RUN_ID itself so an explicitly pinned scenario id still wins, but a blank
    or whitespace-only value is treated as absent rather than echoed back.
    """
    pinned = os.environ.get("RUN_ID", "").strip()
    return pinned or f"sim-{uuid.uuid4().hex[:12]}"


class SimSettings(BaseSettings):
    # env_ignore_empty: an empty env var (compose writes `RUN_ID: ""`) is treated as
    # absent rather than as the literal "", so field defaults/factories still apply.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    topic_prefix: str = "pwa/telemetry"
    rate_hz: float = 5.0
    #: Give up (and return) after this long with no usable broker connection.
    #: The publisher must OUTLIVE a broker restart — scored item 1.2 is demonstrated
    #: by restarting Mosquitto, and a producer that dies takes the evidence with it.
    connect_timeout_s: float = 30.0
    #: Cap paho's reconnect backoff. Its default max_delay is 120s, which is four
    #: times the 30s recovery budget the demo is scored against.
    reconnect_max_delay_s: int = 4
    curated_path: Path = DEFAULT_CURATED
    fault_mode: FaultMode = FaultMode.NORMAL
    run_id: str = Field(default_factory=_default_run_id)


    @field_validator("run_id")
    @classmethod
    def _reject_blank_run_id(cls, value: str) -> str:
        """An empty env var counts as "provided", so the factory never fires.

        `docker-compose` declares `RUN_ID: ""` as documentation of the knob. Without
        this, every container would start with run_id="" and therefore produce
        identical message_ids on every restart — which the consumer's ledger would
        discard as duplicates, silently ingesting nothing after the first run.
        """
        return value if value.strip() else _default_run_id()


def get_settings() -> SimSettings:
    return SimSettings()
