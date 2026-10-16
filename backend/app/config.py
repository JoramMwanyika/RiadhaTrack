from dataclasses import dataclass
import os


@dataclass
class Settings:
    database_url: str = os.getenv("RIADHA_DATABASE_URL", "sqlite:///./data/riadha.db")
    admin_username: str = os.getenv("RIADHA_ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("RIADHA_ADMIN_PASSWORD", "local-development-only")
    mqtt_host: str = os.getenv("RIADHA_MQTT_HOST", "localhost")
    mqtt_port: int = int(os.getenv("RIADHA_MQTT_PORT", "1883"))
    mqtt_username: str | None = os.getenv("RIADHA_MQTT_USERNAME") or None
    mqtt_password: str | None = os.getenv("RIADHA_MQTT_PASSWORD") or None
    mqtt_topic_prefix: str = os.getenv("RIADHA_MQTT_TOPIC_PREFIX", "riadha/v1")


settings = Settings()
