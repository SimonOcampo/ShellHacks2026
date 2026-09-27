/** Display-only shortest paths on the City's road centerlines. Engine timing is unchanged. */

export type MapPoint = [number, number];

type Edge = {
  points: MapPoint[];
  distances: number[];
  length: number;
  a: number;
  b: number;
};
type Link = { edge: number; to: number };
type Anchor = {
  edge: number;
  along: number;
  point: MapPoint;
  distance: number;
};
type HeapItem = { node: number; distance: number };

const CELL = 0.0015;
const METERS_PER_LATITUDE = 111_132;
const METERS_PER_LONGITUDE = 111_320 * Math.cos((41.82 * Math.PI) / 180);
const MAX_ANCHOR_DISTANCE_METERS = 500;

function meters(a: MapPoint, b: MapPoint) {
  return Math.hypot(
    (a[0] - b[0]) * METERS_PER_LONGITUDE,
    (a[1] - b[1]) * METERS_PER_LATITUDE,
  );
}

function mix(a: MapPoint, b: MapPoint, fraction: number): MapPoint {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

function nodeKey(point: MapPoint) {
  return `${point[0].toFixed(5)},${point[1].toFixed(5)}`;
}

function cellKey(x: number, y: number) {
  return `${x},${y}`;
}

class MinHeap {
  private items: HeapItem[] = [];

  get size() {
    return this.items.length;
  }

  push(item: HeapItem) {
    const items = this.items;
    let index = items.length;
    items.push(item);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].distance <= item.distance) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }

  pop(): HeapItem | undefined {
    const items = this.items;
    const first = items[0];
    const last = items.pop();
    if (!first || !last || !items.length) return first;
    let index = 0;
    while (index * 2 + 1 < items.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < items.length &&
        items[child + 1].distance < items[child].distance
      )
        child++;
      if (items[child].distance >= last.distance) break;
      items[index] = items[child];
      index = child;
    }
    items[index] = last;
    return first;
  }
}

export class DisplayRoute {
  readonly points: MapPoint[];
  private readonly distances: number[];
  readonly length: number;

  constructor(points: MapPoint[]) {
    this.points = points.filter(
      (point, index) => index === 0 || meters(point, points[index - 1]) > 0.01,
    );
    this.distances = [0];
    for (let index = 1; index < this.points.length; index++)
      this.distances.push(
        this.distances[index - 1] +
          meters(this.points[index - 1], this.points[index]),
      );
    this.length = this.distances.at(-1) ?? 0;
  }

  at(fraction: number): MapPoint {
    if (!this.points.length) return [0, 0];
    if (this.length === 0) return this.points[0];
    const target = Math.max(0, Math.min(1, fraction)) * this.length;
    let low = 0;
    let high = this.distances.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (this.distances[middle] <= target) low = middle;
      else high = middle;
    }
    const span = this.distances[high] - this.distances[low];
    return mix(
      this.points[low],
      this.points[high],
      span > 0 ? (target - this.distances[low]) / span : 0,
    );
  }
}

export class ProvidenceRoadNetwork {
  private readonly nodes: MapPoint[] = [];
  private readonly edges: Edge[] = [];
  private readonly links: Link[][] = [];
  private readonly grid = new Map<string, Array<[number, number]>>();
  private readonly cache = new Map<string, DisplayRoute>();

  constructor(data: GeoJSON.FeatureCollection) {
    const ids = new Map<string, number>();
    const getNode = (point: MapPoint) => {
      const key = nodeKey(point);
      let id = ids.get(key);
      if (id === undefined) {
        id = this.nodes.length;
        ids.set(key, id);
        this.nodes.push(point);
        this.links.push([]);
      }
      return id;
    };
    for (const feature of data.features) {
      if (feature.geometry?.type !== "LineString") continue;
      const points = feature.geometry.coordinates as MapPoint[];
      if (points.length < 2) continue;
      const distances = [0];
      for (let index = 1; index < points.length; index++)
        distances.push(
          distances[index - 1] + meters(points[index - 1], points[index]),
        );
      const length = distances.at(-1) ?? 0;
      if (length < 0.1) continue;
      const a = getNode(points[0]);
      const b = getNode(points[points.length - 1]);
      const edgeId = this.edges.length;
      this.edges.push({ points, distances, length, a, b });
      this.links[a].push({ edge: edgeId, to: b });
      this.links[b].push({ edge: edgeId, to: a });
    }

    // Ignore isolated fragments that cannot connect meaningful city routes.
    const component = new Int32Array(this.nodes.length).fill(-1);
    const componentSizes: number[] = [];
    for (let start = 0; start < this.nodes.length; start++) {
      if (component[start] !== -1) continue;
      const id = componentSizes.length;
      let size = 0;
      const queue = [start];
      component[start] = id;
      for (let index = 0; index < queue.length; index++) {
        size++;
        for (const link of this.links[queue[index]]) {
          if (component[link.to] !== -1) continue;
          component[link.to] = id;
          queue.push(link.to);
        }
      }
      componentSizes.push(size);
    }
    const largest = componentSizes.indexOf(Math.max(...componentSizes));
    for (let edgeId = 0; edgeId < this.edges.length; edgeId++) {
      const edge = this.edges[edgeId];
      if (component[edge.a] !== largest) continue;
      for (let index = 0; index < edge.points.length - 1; index++) {
        const a = edge.points[index];
        const b = edge.points[index + 1];
        const minX = Math.floor(Math.min(a[0], b[0]) / CELL);
        const maxX = Math.floor(Math.max(a[0], b[0]) / CELL);
        const minY = Math.floor(Math.min(a[1], b[1]) / CELL);
        const maxY = Math.floor(Math.max(a[1], b[1]) / CELL);
        for (let x = minX; x <= maxX; x++)
          for (let y = minY; y <= maxY; y++) {
            const key = cellKey(x, y);
            const entries = this.grid.get(key) ?? [];
            entries.push([edgeId, index]);
            this.grid.set(key, entries);
          }
      }
    }
  }

  private nearest(point: MapPoint): Anchor | undefined {
    const x = Math.floor(point[0] / CELL);
    const y = Math.floor(point[1] / CELL);
    const candidates = new Set<string>();
    for (let dx = -4; dx <= 4; dx++)
      for (let dy = -4; dy <= 4; dy++)
        for (const [edgeId, index] of this.grid.get(cellKey(x + dx, y + dy)) ??
          [])
          candidates.add(`${edgeId}:${index}`);
    let best: Anchor | undefined;
    for (const key of candidates) {
      const [edgeId, index] = key.split(":").map(Number);
      const edge = this.edges[edgeId];
      const a = edge.points[index];
      const b = edge.points[index + 1];
      const abX = (b[0] - a[0]) * METERS_PER_LONGITUDE;
      const abY = (b[1] - a[1]) * METERS_PER_LATITUDE;
      const apX = (point[0] - a[0]) * METERS_PER_LONGITUDE;
      const apY = (point[1] - a[1]) * METERS_PER_LATITUDE;
      const squared = abX * abX + abY * abY;
      const fraction = squared
        ? Math.max(0, Math.min(1, (apX * abX + apY * abY) / squared))
        : 0;
      const projected = mix(a, b, fraction);
      const distance = meters(point, projected);
      if (!best || distance < best.distance)
        best = {
          edge: edgeId,
          along:
            edge.distances[index] +
            fraction * (edge.distances[index + 1] - edge.distances[index]),
          point: projected,
          distance,
        };
    }
    return best && best.distance <= MAX_ANCHOR_DISTANCE_METERS
      ? best
      : undefined;
  }

  private pointOnEdge(edge: Edge, along: number): MapPoint {
    if (along <= 0) return edge.points[0];
    if (along >= edge.length) return edge.points[edge.points.length - 1];
    let index = 0;
    while (edge.distances[index + 1] < along) index++;
    const span = edge.distances[index + 1] - edge.distances[index];
    return mix(
      edge.points[index],
      edge.points[index + 1],
      span ? (along - edge.distances[index]) / span : 0,
    );
  }

  private slice(edge: Edge, from: number, to: number): MapPoint[] {
    if (from > to) return this.slice(edge, to, from).reverse();
    const points = [this.pointOnEdge(edge, from)];
    for (let index = 1; index < edge.points.length - 1; index++)
      if (edge.distances[index] > from && edge.distances[index] < to)
        points.push(edge.points[index]);
    points.push(this.pointOnEdge(edge, to));
    return points;
  }

  route(from: MapPoint, to: MapPoint): DisplayRoute | undefined {
    const cacheKey = `${from.join(",")}|${to.join(",")}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const start = this.nearest(from);
    const end = this.nearest(to);
    if (!start || !end) return undefined;
    const startEdge = this.edges[start.edge];
    const endEdge = this.edges[end.edge];
    let bestCost =
      start.edge === end.edge ? Math.abs(end.along - start.along) : Infinity;
    let bestPoints =
      start.edge === end.edge
        ? this.slice(startEdge, start.along, end.along)
        : undefined;

    const distances = new Float64Array(this.nodes.length).fill(Infinity);
    const previousNode = new Int32Array(this.nodes.length).fill(-1);
    const previousEdge = new Int32Array(this.nodes.length).fill(-1);
    const heap = new MinHeap();
    for (const [node, cost] of [
      [startEdge.a, start.along],
      [startEdge.b, startEdge.length - start.along],
    ]) {
      if (cost >= distances[node]) continue;
      distances[node] = cost;
      heap.push({ node, distance: cost });
    }
    let chosenEnd = -1;
    while (heap.size) {
      const next = heap.pop()!;
      if (next.distance !== distances[next.node]) continue;
      if (next.distance >= bestCost) break;
      for (const [node, tail] of [
        [endEdge.a, end.along],
        [endEdge.b, endEdge.length - end.along],
      ])
        if (next.node === node && next.distance + tail < bestCost) {
          bestCost = next.distance + tail;
          chosenEnd = node;
        }
      for (const link of this.links[next.node]) {
        const cost = next.distance + this.edges[link.edge].length;
        if (cost >= distances[link.to] || cost >= bestCost) continue;
        distances[link.to] = cost;
        previousNode[link.to] = next.node;
        previousEdge[link.to] = link.edge;
        heap.push({ node: link.to, distance: cost });
      }
    }
    if (chosenEnd !== -1) {
      const steps: Array<{ edge: number; from: number; to: number }> = [];
      let node = chosenEnd;
      while (previousNode[node] !== -1) {
        steps.push({
          edge: previousEdge[node],
          from: previousNode[node],
          to: node,
        });
        node = previousNode[node];
      }
      const points = this.slice(
        startEdge,
        start.along,
        node === startEdge.a ? 0 : startEdge.length,
      );
      for (const step of steps.reverse()) {
        const edge = this.edges[step.edge];
        points.push(
          ...(step.from === edge.a ? edge.points : [...edge.points].reverse()),
        );
      }
      points.push(
        ...this.slice(
          endEdge,
          chosenEnd === endEdge.a ? 0 : endEdge.length,
          end.along,
        ),
      );
      bestPoints = points;
    }
    if (!bestPoints) return undefined;
    const route = new DisplayRoute(bestPoints);
    this.cache.set(cacheKey, route);
    if (this.cache.size > 512)
      this.cache.delete(this.cache.keys().next().value!);
    return route;
  }
}
