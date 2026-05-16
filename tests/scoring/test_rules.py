from __future__ import annotations

import json
import unittest
from pathlib import Path

from services.api.app.scoring import score_rule, score_territory


ROOT_DIR = Path(__file__).resolve().parents[2]


class ScoringRuleTest(unittest.TestCase):
    def test_lower_is_better(self) -> None:
        result = score_rule(
            {
                "type": "lower_is_better",
                "indicator": "minutes",
                "min_value": 60,
                "max_value": 360,
            },
            {"minutes": 210},
        )

        self.assertEqual(result["score"], 50)

    def test_ideal_range(self) -> None:
        result = score_rule(
            {
                "type": "ideal_range",
                "indicator": "minutes",
                "min_ideal": 15,
                "max_ideal": 45,
                "min_acceptable": 0,
                "max_acceptable": 90,
            },
            {"minutes": 30},
        )

        self.assertEqual(result["score"], 100)

    def test_categorical_exclusion(self) -> None:
        result = score_rule(
            {
                "type": "categorical",
                "indicator": "risk",
                "mapping": {"faible": 85, "fort": 5},
                "exclude_if": ["fort"],
            },
            {"risk": "fort"},
        )

        self.assertEqual(result["score"], 5)
        self.assertTrue(result["excluded"])

    def test_catalog_sample_scores(self) -> None:
        catalog_path = ROOT_DIR / "data" / "criteria" / "prototype_catalog.json"
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        sample = catalog["sample_territories"][0]

        result = score_territory(catalog["criteria"], sample["values"])

        self.assertIsNotNone(result["global_score"])
        self.assertIn("Culture", result["category_scores"])
        self.assertIn("Agriculture", result["category_scores"])


if __name__ == "__main__":
    unittest.main()
