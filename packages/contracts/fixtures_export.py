"""Export fixture responses from actual mock-data engines, never hand-maintained shapes."""

from pathlib import Path
from fastapi.testclient import TestClient
from odd_scout.api.main import app


def main():
    root = Path(__file__).resolve().parents[2]
    targets = [root / "packages/contracts/fixtures", root / "apps/web/public/fixtures"]
    for target in targets:
        target.mkdir(parents=True, exist_ok=True)

    def write(name, response):
        response.raise_for_status()
        import json

        value = json.dumps(response.json(), indent=2, allow_nan=False) + "\n"
        for target in targets:
            (target / f"{name}.json").write_text(value, encoding="utf-8")

    with TestClient(app) as client:
        if client.get("/health").json()["versions"]["data_mode"] != "mock":
            raise ValueError("Fixtures must be generated from mock release")
        cities = client.get("/api/v1/cities")
        write("cities", cities)
        write("config", client.get("/api/v1/config"))
        write("ranking", client.post("/api/v1/rankings", json={}))
        for city in cities.json()["cities"]:
            cid = city["city_id"]
            slug = cid.replace(":", "-")
            write(f"city-{slug}", client.get(f"/api/v1/cities/{cid}"))
            write(
                f"explanation-{slug}",
                client.post(f"/api/v1/cities/{cid}/explanation", json={}),
            )
            write(
                f"simulation-{slug}",
                client.post("/api/v1/simulations", json={"city_id": cid}),
            )
        for reference in client.get("/api/v1/config").json()["references"]:
            cid = reference["city_id"]
            write(f"city-{cid.replace(':', '-')}", client.get(f"/api/v1/cities/{cid}"))
    print("Fixtures exported to contracts and web")


if __name__ == "__main__":
    main()
