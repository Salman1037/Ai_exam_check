import json

import pytest
from pydantic import ValidationError

from app.grading import NotPaperError, normalize_grade


def question(**changes):
    return {
        "q": 1,
        "question": "2 + 2?",
        "student_answer": "4",
        "correct_answer": "4",
        "marks": 1,
        "out_of": 1,
        "reason": "Correct.",
        "confidence": "high",
        **changes,
    }


def test_clamp_and_recalculate():
    result = normalize_grade(
        json.dumps(
            {
                "subject": "Math",
                "results": [
                    question(marks=50),
                    question(q=2, marks=-5, out_of=2),
                    question(q=3, marks=1.5, out_of=3),
                ],
            }
        )
    )
    assert result["total"] == 2.5
    assert result["out_of"] == 6
    assert [q["marks"] for q in result["results"]] == [1, 0, 1.5]


@pytest.mark.parametrize(
    "changes",
    [
        {"out_of": 0},
        {"marks": "NaN"},
        {"confidence": "medium"},
        {"q": "1"},
        {"out_of": -1},
        {"correct_answer": ""},
    ],
)
def test_invalid_question(changes):
    with pytest.raises(ValidationError):
        normalize_grade(
            json.dumps({"subject": "Math", "results": [question(**changes)]})
        )


def test_duplicate_question():
    with pytest.raises(ValidationError):
        normalize_grade(
            json.dumps({"subject": "Math", "results": [question(), question()]})
        )


def test_no_paper():
    with pytest.raises(NotPaperError, match="No readable test"):
        normalize_grade('{"subject":"Not a paper","results":[]}')


def test_rejects_ai_totals_and_non_json():
    with pytest.raises(ValidationError):
        normalize_grade(
            json.dumps({"subject": "Math", "results": [question()], "total": 99})
        )
    with pytest.raises(ValidationError):
        normalize_grade("not JSON")
