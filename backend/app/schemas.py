from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class EmbedResponse(BaseModel):
    embedding: list[float]
    dim: int
    model: str


class Candidate(BaseModel):
    id: str
    embedding: list[float]


class MatchRequest(BaseModel):
    embedding: list[float]
    candidates: list[Candidate] = Field(max_length=5000)
    top_k: int = Field(default=3, ge=1, le=20)
    threshold: float | None = Field(default=None, ge=-1.0, le=1.0)


class Match(BaseModel):
    id: str
    score: float


class MatchResponse(BaseModel):
    matched: bool
    matches: list[Match]
    threshold: float


class WeekTotal(BaseModel):
    week_start: date
    total: float = Field(ge=0)


class ForecastRequest(BaseModel):
    weekly_totals: list[WeekTotal] = Field(min_length=1, max_length=520)
    horizon: int = Field(default=4, ge=1, le=13)
    target_weekly: float = Field(gt=0)


class ForecastPoint(BaseModel):
    week_start: date
    total: float


class ForecastResponse(BaseModel):
    method: Literal["arima", "moving_average"]
    weeks_used: int
    forecast: list[ForecastPoint]
    forecast_avg_weekly: float
    lower: float
    upper: float
    target_weekly: float
    verdict: Literal["warn", "keep_it_up"]
