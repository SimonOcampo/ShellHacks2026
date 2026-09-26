"""Single-command ODD Scout build entry point."""
import argparse, logging
from src.pipeline.build_city_features import build_all

def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download",action="store_true",help="Fetch public data and preserve raw source snapshots")
    parser.add_argument("--process",action="store_true",help="Build validated outputs from raw snapshots (default action)")
    parser.add_argument("--cities",nargs="+",help="Market keys such as jacksonville columbus")
    args=parser.parse_args(); logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(name)s %(message)s")
    records=build_all(download=args.download,city_keys=args.cities)
    print(f"Built and validated {len(records)} CityFeature records under data/processed/cities")

if __name__ == "__main__": main()
