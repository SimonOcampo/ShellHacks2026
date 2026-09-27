import json
from pathlib import Path

from contracts.models import DataRelease, RankingRequest
from odd_ranking.engine import rank
from odd_scout.explanations.live import LiveExplanation
from odd_scout.explanations.template import explain


def verified_case():
    release = DataRelease.model_validate_json(
        Path("data/releases/verified.v2.json").read_text(encoding="utf-8")
    )
    ranking = rank(release, RankingRequest())
    city_id = ranking.ranked[0].city_id
    return release, ranking, city_id, explain(release, ranking, city_id)


class Response:
    def __init__(self, wording):
        self.content = b"{}"
        self.wording = wording

    def raise_for_status(self):
        pass

    def json(self):
        return {
            "candidates": [
                {"content": {"parts": [{"text": json.dumps(self.wording)}]}}
            ]
        }


def test_valid_wording_is_cached_and_cannot_replace_calculated_fields(monkeypatch):
    release, ranking, city_id, template = verified_case()
    calls = []

    def post(url, **kwargs):
        calls.append(kwargs)
        return Response(
            {
                "summary": "Public evidence supports this screening comparison, with meaningful limits.",
                "evidence_ids": [template.evidence_ids[0]],
            }
        )

    monkeypatch.setattr("odd_scout.explanations.live.httpx.post", post)
    service = LiveExplanation(api_key="server-secret")
    first = service.explain(release, ranking, city_id, template, "127.0.0.1")
    second = service.explain(release, ranking, city_id, template, "127.0.0.1")
    assert first == second
    assert first.mode == "llm"
    assert first.summary != template.summary
    assert first.evidence_ids == template.evidence_ids
    assert first.advantages == template.advantages
    assert first.tradeoffs == template.tradeoffs
    assert first.ranking_id == ranking.ranking_id
    assert len(calls) == 1
    assert calls[0]["headers"]["x-goog-api-key"] == "server-secret"
    assert "server-secret" not in json.dumps(calls[0]["json"])


def test_invalid_evidence_or_claim_falls_back(monkeypatch):
    release, ranking, city_id, template = verified_case()
    wording = {
        "summary": "This city is safe for deployment.",
        "evidence_ids": ["invented"],
    }
    monkeypatch.setattr(
        "odd_scout.explanations.live.httpx.post",
        lambda *args, **kwargs: Response(wording),
    )
    service = LiveExplanation(api_key="server-secret")
    assert service.explain(release, ranking, city_id, template, "127.0.0.1") == template
    wording.update(
        summary="The score is 99 points.", evidence_ids=[template.evidence_ids[0]]
    )
    assert service.explain(release, ranking, city_id, template, "127.0.0.1") == template


def test_request_limit_and_disabled_mode_fall_back(monkeypatch):
    release, ranking, city_id, template = verified_case()
    calls = []

    # Network failures use httpx exceptions and return the template.
    import httpx

    def network_failure(*args, **kwargs):
        calls.append(1)
        raise httpx.ConnectError("upstream down")

    monkeypatch.setattr("odd_scout.explanations.live.httpx.post", network_failure)
    service = LiveExplanation(api_key="server-secret", clock=lambda: 100.0)
    for _ in range(12):
        assert (
            service.explain(release, ranking, city_id, template, "127.0.0.1")
            == template
        )
    assert len(calls) == 10
    assert (
        LiveExplanation(api_key="").explain(
            release, ranking, city_id, template, "127.0.0.1"
        )
        == template
    )
