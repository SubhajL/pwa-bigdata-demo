"""Runtime settings (env-driven)."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://pwa:pwa@localhost:5432/pwa"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic: str = "pwa/telemetry/#"
    # S0 skeleton runs broker-less; S2 flips this on.
    mqtt_enabled: bool = False


def get_settings() -> Settings:
    return Settings()
