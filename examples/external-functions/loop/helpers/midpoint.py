"""Ordinary Python, independent of CSO."""


def midpoint_square(*, upper_limit: float, intervals: int):
    if intervals <= 0:
        raise ValueError("The midpoint method requires a positive interval count")
    width = upper_limit / intervals
    total = 0.0
    for index in range(intervals):
        coordinate = (index + 0.5) * width
        total += coordinate * coordinate
    return {"value": total * width, "interval_width": width}
