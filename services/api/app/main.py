from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.scoring import score_territory


ROOT_DIR = Path(__file__).resolve().parents[3]
CATALOG_PATH = ROOT_DIR / "data" / "criteria" / "prototype_catalog.json"

app = FastAPI(title="Carto Residence API", version="0.1.0")


class ScoreRequest(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)
    weights: dict[str, float] = Field(default_factory=dict)


def load_catalog() -> dict[str, Any]:
    with CATALOG_PATH.open(encoding="utf-8") as catalog_file:
        return json.load(catalog_file)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/catalog")
def catalog() -> dict[str, Any]:
    return load_catalog()


@app.get("/criteria")
def criteria() -> list[dict[str, Any]]:
    catalog_data = load_catalog()
    return catalog_data["criteria"]


@app.post("/score")
def score(request: ScoreRequest) -> dict[str, Any]:
    catalog_data = load_catalog()
    return score_territory(catalog_data["criteria"], request.values, request.weights)


@app.get("/score/sample/{territory_code}")
def sample_score(territory_code: str) -> dict[str, Any]:
    catalog_data = load_catalog()
    territory = next(
        (
            sample
            for sample in catalog_data.get("sample_territories", [])
            if sample["code"] == territory_code
        ),
        None,
    )
    if territory is None:
        raise HTTPException(status_code=404, detail="Sample territory not found")
    score_result = score_territory(catalog_data["criteria"], territory["values"])
    return {
        "territory": {
            "code": territory["code"],
            "name": territory["name"],
        },
        "score": score_result,
    }
