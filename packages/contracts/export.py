import json
from pathlib import Path
from odd_scout.api.main import app


def main():
    path = Path(__file__).with_name("openapi.json")
    path.write_text(
        json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(path)


if __name__ == "__main__":
    main()
