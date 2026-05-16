from __future__ import annotations

from dataclasses import dataclass
from typing import Any


ScoreResult = dict[str, Any]


@dataclass(frozen=True)
class CriterionScore:
    key: str
    name: str
    category: str
    score: float | None
    weight: float
    missing: bool
    excluded: bool
    explanation: str


def clamp(value: float, lower: float = 0, upper: float = 100) -> float:
    return max(lower, min(upper, value))


def _require_number(values: dict[str, Any], indicator: str) -> float | None:
    raw_value = values.get(indicator)
    if raw_value is None or raw_value == "":
        return None
    return float(raw_value)


def score_rule(rule: dict[str, Any], values: dict[str, Any]) -> ScoreResult:
    rule_type = rule["type"]

    if rule_type == "higher_is_better":
        indicator = rule["indicator"]
        value = _require_number(values, indicator)
        if value is None:
            return _missing(indicator)
        min_value = float(rule["min_value"])
        max_value = float(rule["max_value"])
        score = (value - min_value) / (max_value - min_value) * 100
        if rule.get("clamp", True):
            score = clamp(score)
        return _scored(score, indicator, value)

    if rule_type == "lower_is_better":
        indicator = rule["indicator"]
        value = _require_number(values, indicator)
        if value is None:
            return _missing(indicator)
        min_value = float(rule["min_value"])
        max_value = float(rule["max_value"])
        score = (max_value - value) / (max_value - min_value) * 100
        if rule.get("clamp", True):
            score = clamp(score)
        return _scored(score, indicator, value)

    if rule_type == "ideal_range":
        indicator = rule["indicator"]
        value = _require_number(values, indicator)
        if value is None:
            return _missing(indicator)
        min_ideal = float(rule["min_ideal"])
        max_ideal = float(rule["max_ideal"])
        min_acceptable = float(rule["min_acceptable"])
        max_acceptable = float(rule["max_acceptable"])
        if min_ideal <= value <= max_ideal:
            score = 100
        elif value < min_ideal:
            score = (value - min_acceptable) / (min_ideal - min_acceptable) * 100
        else:
            score = (max_acceptable - value) / (max_acceptable - max_ideal) * 100
        return _scored(clamp(score), indicator, value)

    if rule_type == "steps":
        indicator = rule["indicator"]
        value = _require_number(values, indicator)
        if value is None:
            return _missing(indicator)
        for step in rule["steps"]:
            if "max" not in step or value <= float(step["max"]):
                return _scored(float(step["score"]), indicator, value)
        return _scored(0, indicator, value)

    if rule_type == "categorical":
        indicator = rule["indicator"]
        raw_value = values.get(indicator)
        if raw_value is None or raw_value == "":
            return _missing(indicator)
        value_key = str(raw_value).lower()
        score = float(rule["mapping"].get(value_key, 0))
        excluded = value_key in {str(value).lower() for value in rule.get("exclude_if", [])}
        result = _scored(clamp(score), indicator, raw_value)
        result["excluded"] = excluded
        return result

    if rule_type == "weighted_composite":
        total_weight = 0.0
        weighted_score = 0.0
        children: list[ScoreResult] = []
        excluded = False
        for component in rule["components"]:
            component_rule = dict(component["rule"])
            component_rule["indicator"] = component["indicator"]
            child = score_rule(component_rule, values)
            children.append(child)
            if child["excluded"]:
                excluded = True
            if child["score"] is None:
                continue
            weight = float(component["weight"])
            weighted_score += child["score"] * weight
            total_weight += weight
        if total_weight == 0:
            return {
                "score": None,
                "indicator": None,
                "value": None,
                "missing": True,
                "excluded": excluded,
                "children": children,
            }
        return {
            "score": clamp(weighted_score / total_weight),
            "indicator": None,
            "value": None,
            "missing": False,
            "excluded": excluded,
            "children": children,
        }

    raise ValueError(f"Unsupported rule type: {rule_type}")


def score_territory(
    criteria: list[dict[str, Any]],
    values: dict[str, Any],
    weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    weights = weights or {}
    criterion_scores: list[CriterionScore] = []
    global_weight = 0.0
    global_score = 0.0
    category_totals: dict[str, float] = {}
    category_weights: dict[str, float] = {}
    missing: list[str] = []
    exclusions: list[str] = []

    for criterion in criteria:
        result = score_rule(criterion["rule"], values)
        weight = float(weights.get(criterion["key"], criterion.get("default_weight", 1)))
        score = result["score"]
        is_missing = bool(result["missing"])
        is_excluded = bool(result["excluded"])

        if is_missing:
            missing.append(criterion["key"])
        elif score is not None and weight > 0:
            global_score += score * weight
            global_weight += weight
            category = criterion["category"]
            category_totals[category] = category_totals.get(category, 0) + score * weight
            category_weights[category] = category_weights.get(category, 0) + weight

        if is_excluded:
            exclusions.append(criterion["key"])

        criterion_scores.append(
            CriterionScore(
                key=criterion["key"],
                name=criterion["name"],
                category=criterion["category"],
                score=None if score is None else round(score, 1),
                weight=weight,
                missing=is_missing,
                excluded=is_excluded,
                explanation=_explain(result),
            )
        )

    category_scores = {
        category: round(category_totals[category] / category_weights[category], 1)
        for category in category_totals
    }

    return {
        "global_score": None if global_weight == 0 else round(global_score / global_weight, 1),
        "category_scores": category_scores,
        "criteria": [criterion.__dict__ for criterion in criterion_scores],
        "missing_criteria": missing,
        "exclusions": exclusions,
        "excluded": bool(exclusions),
    }


def _missing(indicator: str) -> ScoreResult:
    return {
        "score": None,
        "indicator": indicator,
        "value": None,
        "missing": True,
        "excluded": False,
    }


def _scored(score: float, indicator: str, value: Any) -> ScoreResult:
    return {
        "score": score,
        "indicator": indicator,
        "value": value,
        "missing": False,
        "excluded": False,
    }


def _explain(result: ScoreResult) -> str:
    if result["missing"]:
        return "Donnee manquante pour ce critere."
    if result.get("children"):
        available = [child for child in result["children"] if not child["missing"]]
        return f"Score composite calcule avec {len(available)} composantes disponibles."
    return f"Valeur {result['value']} transformee en score normalise."
