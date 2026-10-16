from dataclasses import dataclass
import os
from pathlib import Path

# Load local .env file if it exists and variables aren't already set
_env_file = Path(__file__).resolve().parent.parent / ".env"
if _env_file.exists():
    with open(_env_file, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                _k = _k.strip()
                _v = _v.strip().strip("'\"")
                if _k not in os.environ:
                    os.environ[_k] = _v


@dataclass
class Settings:
    database_url: str = os.getenv("RIADHA_DATABASE_URL", "sqlite:///./data/riadha.db")
    admin_username: str = os.getenv("RIADHA_ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("RIADHA_ADMIN_PASSWORD", "Admin123")
    mqtt_host: str = os.getenv("RIADHA_MQTT_HOST", "localhost")
    mqtt_port: int = int(os.getenv("RIADHA_MQTT_PORT", "1883"))
    mqtt_username: str | None = os.getenv("RIADHA_MQTT_USERNAME") or None
    mqtt_password: str | None = os.getenv("RIADHA_MQTT_PASSWORD") or None
    mqtt_topic_prefix: str = os.getenv("RIADHA_MQTT_TOPIC_PREFIX", "riadha/v1")
    cors_origins: str = os.getenv("RIADHA_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")
    session_hours: int = int(os.getenv("RIADHA_SESSION_HOURS", "12"))


settings = Settings()
