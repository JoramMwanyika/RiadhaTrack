import json
import logging
from paho.mqtt.client import Client, CallbackAPIVersion
from pydantic import ValidationError

from .config import settings
from .schemas import DeviceResult, DeviceStatus
from .services import queue_device_result, store_device_status
from .topics import device_results, device_status, result_ack

LOGGER = logging.getLogger(__name__)
class MqttIngestor:
    def __init__(self) -> None:
        self.client = Client(CallbackAPIVersion.VERSION2, client_id="riadha-backend")
        if settings.mqtt_username:
            self.client.username_pw_set(settings.mqtt_username, settings.mqtt_password)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def start(self) -> None:
        self.client.connect_async(settings.mqtt_host, settings.mqtt_port, 60)
        self.client.loop_start()

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()

    def on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code.is_failure:
            LOGGER.error("MQTT connection failed: %s", reason_code)
            return
        client.subscribe(device_results(), qos=1)
        client.subscribe(device_status("+"), qos=1)

    def on_message(self, client, userdata, message) -> None:
        parts = message.topic.split("/")
        prefix_parts = settings.mqtt_topic_prefix.split("/")
        if len(parts) != len(prefix_parts) + 3 or parts[:len(prefix_parts)] != prefix_parts or parts[-3] != "devices":
            return
        device_id = parts[-2]
        if parts[-1] == "status":
            try:
                body = json.loads(message.payload.decode("utf-8"))
                validate_fn = getattr(DeviceStatus, "model_validate", getattr(DeviceStatus, "parse_obj", None))
                payload = validate_fn(body)
                if payload.device_id == device_id:
                    store_device_status(payload)
            except (json.JSONDecodeError, ValidationError):
                LOGGER.warning("Ignored invalid status message from %s", device_id)
            return
        if parts[-1] != "results":
            return
        result_id = "unknown"
        try:
            body = json.loads(message.payload.decode("utf-8"))
            result_id = body.get("result_id", result_id)
            validate_fn = getattr(DeviceResult, "model_validate", getattr(DeviceResult, "parse_obj", None))
            payload = validate_fn(body)
            if payload.device_id != device_id:
                status, reason = "rejected", "topic_device_mismatch"
            else:
                status, reason = queue_device_result(payload)
        except (json.JSONDecodeError, ValidationError):
            status, reason = "rejected", "invalid_payload"
        # Pending results deliberately remain unacknowledged until a coach reviews
        # them in the dashboard. The device will safely retry in the meantime.
        if status == "pending":
            return
        ack = {"result_id": result_id, "status": "stored" if status in ("stored", "duplicate") else "rejected"}
        if reason:
            ack["reason"] = reason
        client.publish(result_ack(device_id, result_id), json.dumps(ack), qos=1, retain=False)

    def publish_result_ack(self, device_id: str, result_id: str, status: str, reason: str | None = None) -> None:
        ack = {"result_id": result_id, "status": status}
        if reason:
            ack["reason"] = reason
        self.client.publish(result_ack(device_id, result_id), json.dumps(ack), qos=1, retain=False)
