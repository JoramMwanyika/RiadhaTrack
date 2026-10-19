from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class AthleteCreate(BaseModel):
    athlete_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    display_name: str = Field(min_length=1, max_length=160)
    age_group: str | None = Field(default=None, max_length=40)
    school_club: str | None = Field(default=None, max_length=160)
    preferred_event: str | None = Field(default=None, max_length=80)
    consent_status: Literal["pending", "granted", "withdrawn"] = "pending"


class TestPayload(BaseModel):
    sport: Literal["athletics"] = "athletics"
    event: str = Field(min_length=1, max_length=80)
    distance_m: float = Field(gt=0, le=100000)


class TimingPayload(BaseModel):
    elapsed_ms: int = Field(gt=0, le=86400000)
    start_detected: bool
    finish_detected: bool
    quality: str = Field(min_length=1, max_length=80)


class DeviceResult(BaseModel):
    schema_version: Literal[1]
    event_type: Literal["timing.result.completed"]
    result_id: str = Field(min_length=1, max_length=128)
    device_id: str = Field(min_length=1, max_length=64)
    athlete_id: str = Field(min_length=1, max_length=64)
    test: TestPayload
    timing: TimingPayload
    device_time_utc: datetime | None = None
    sequence: int | None = Field(default=None, ge=0)


class DeviceStatus(BaseModel):
    schema_version: Literal[1]
    device_id: str = Field(min_length=1, max_length=64)
    wifi_connected: bool
    mqtt_connected: bool
    wifi_rssi: int | None = Field(default=None, ge=-127, le=0)
    firmware_version: str | None = Field(default=None, max_length=64)


class AccountRegistration(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=6, max_length=256)


class AccountLogin(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)
