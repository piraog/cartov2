#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


SUPPORTED_RULES = {
    "higher_is_better",
    "lower_is_better",
    "ideal_range",
    "steps",
    "categorical",
    "weighted_composite",
}


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: validate_catalog.py <catalog.json>", file=sys.stderr)
        return 2

    catalog_path = Path(sys.argv[1])
    with catalog_path.open(encoding="utf-8") as catalog_file:
        catalog = json.load(catalog_file)

    errors = validate_catalog(catalog)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(
        "Catalog valid: "
        f"{len(catalog['sources'])} sources, "
        f"{len(catalog['indicators'])} indicators, "
        f"{len(catalog['criteria'])} criteria"
    )
    return 0


def validate_catalog(catalog: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in ("sources", "indicators", "criteria"):
        if key not in catalog or not isinstance(catalog[key], list):
            errors.append(f"Missing list '{key}'")

    if errors:
        return errors

    source_keys = _unique_keys(catalog["sources"], "sources", errors)
    indicator_keys = _unique_keys(catalog["indicators"], "indicators", errors)
    _unique_keys(catalog["criteria"], "criteria", errors)

    for indicator in catalog["indicators"]:
        if indicator.get("source") not in source_keys:
            errors.append(f"Indicator {indicator.get('key')} references unknown source {indicator.get('source')}")

    for criterion in catalog["criteria"]:
        if "rule" not in criterion:
            errors.append(f"Criterion {criterion.get('key')} has no rule")
            continue
        _validate_rule(criterion["rule"], indicator_keys, f"criteria.{criterion.get('key')}.rule", errors)

    return errors


def _unique_keys(items: list[dict[str, Any]], label: str, errors: list[str]) -> set[str]:
    keys: set[str] = set()
    for item in items:
        key = item.get("key")
        if not key:
            errors.append(f"{label} item has no key")
            continue
        if key in keys:
            errors.append(f"Duplicate key in {label}: {key}")
        keys.add(key)
    return keys


def _validate_rule(rule: dict[str, Any], indicator_keys: set[str], path: str, errors: list[str]) -> None:
    rule_type = rule.get("type")
    if rule_type not in SUPPORTED_RULES:
        errors.append(f"{path} has unsupported type {rule_type}")
        return

    if rule_type == "weighted_composite":
        components = rule.get("components")
        if not isinstance(components, list) or not components:
            errors.append(f"{path} must define non-empty components")
            return
        weight_sum = 0.0
        for index, component in enumerate(components):
            indicator = component.get("indicator")
            if indicator not in indicator_keys:
                errors.append(f"{path}.components[{index}] references unknown indicator {indicator}")
            weight_sum += float(component.get("weight", 0))
            if "rule" not in component:
                errors.append(f"{path}.components[{index}] has no nested rule")
            else:
                nested_rule = dict(component["rule"])
                nested_rule["indicator"] = indicator
                _validate_rule(nested_rule, indicator_keys, f"{path}.components[{index}].rule", errors)
        if weight_sum <= 0:
            errors.append(f"{path} component weights must sum to a positive value")
        return

    indicator = rule.get("indicator")
    if indicator not in indicator_keys:
        errors.append(f"{path} references unknown indicator {indicator}")


if __name__ == "__main__":
    raise SystemExit(main())
