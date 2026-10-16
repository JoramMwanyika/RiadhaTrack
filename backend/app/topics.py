"""The single source of truth for RiadhaTrac MQTT topic names.

Keep this module in sync with `infra/mosquitto/aclfile`. The dashboard must
consume stored results through the HTTP API, not by using broker credentials.
"""
from .config import settings


def device_status(device_id: str) -> str:
    return f"{settings.mqtt_topic_prefix}/devices/{device_id}/status"


def device_results(device_id: str = "+") -> str:
    return f"{settings.mqtt_topic_prefix}/devices/{device_id}/results"


def device_events(device_id: str) -> str:
    return f"{settings.mqtt_topic_prefix}/devices/{device_id}/events"


def device_commands(device_id: str) -> str:
    return f"{settings.mqtt_topic_prefix}/devices/{device_id}/commands"


def result_ack(device_id: str, result_id: str) -> str:
    return f"{settings.mqtt_topic_prefix}/devices/{device_id}/acks/{result_id}"
