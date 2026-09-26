from shapely.geometry import LineString, Polygon

from src.datasets.roads.process import (
    ARTERIAL_CODES,
    FREEWAY_CODES,
    INCLUDED_CODES,
    LOCAL_CODES,
    _clustered_junctions,
    _network_intersections,
)


def test_mtfcc_groups_are_disjoint_and_cover_included_roads():
    assert FREEWAY_CODES.isdisjoint(ARTERIAL_CODES)
    assert FREEWAY_CODES.isdisjoint(LOCAL_CODES)
    assert ARTERIAL_CODES.isdisjoint(LOCAL_CODES)
    assert INCLUDED_CODES == FREEWAY_CODES | ARTERIAL_CODES | LOCAL_CODES


def test_intersections_count_junctions_not_line_vertices():
    roads = [
        LineString([(-100, 0), (0, 0)]),
        LineString([(0, 0), (100, 0)]),
        LineString([(0, -100), (0, 0)]),
        LineString([(0, 0), (0, 100)]),
    ]
    assert _clustered_junctions(roads, Polygon([(-200, -200), (200, -200), (200, 200), (-200, 200)])) == 1


def test_border_clip_nodes_are_not_counted_as_intersections():
    roads = [
        LineString([(-100, 0), (0, 0)]),
        LineString([(0, 0), (100, 0)]),
        LineString([(0, -100), (0, 0)]),
    ]
    boundary = Polygon([(0, -200), (200, -200), (200, 200), (0, 200)])
    assert _clustered_junctions(roads, boundary) == 0


def test_tiger_topological_node_counts_distinct_incident_edges():
    edges = {
        "a": {"nodes": [("n1", (50, 50)), ("n2", (10, 10))]},
        "b": {"nodes": [("n1", (50, 50)), ("n3", (20, 20))]},
        "c": {"nodes": [("n1", (50, 50)), ("n4", (30, 30))]},
        "d": {"nodes": [("n1", (50, 50)), ("n5", (40, 40))]},
    }
    boundary = Polygon([(0, 0), (100, 0), (100, 100), (0, 100)])
    assert _network_intersections(edges, boundary) == 1
