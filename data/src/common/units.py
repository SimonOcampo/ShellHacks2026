"""Explicit common unit conversions."""
INCH_TO_MM = 25.4
SQUARE_METERS_PER_SQ_KM = 1_000_000
def inches_to_mm(value: float) -> float:
    return value * INCH_TO_MM
