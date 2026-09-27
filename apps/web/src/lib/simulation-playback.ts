import type { Simulation } from "./api/types";

export type Playback = NonNullable<Simulation["playback"]>;
export type Segment = Playback["segments"][number];
export const vehicleStates: Record<
  Segment["state"],
  { label: string; color: string }
> = {
  IDLE: { label: "Idle · empty", color: "#64748b" },
  PICKUP_TRAVEL: { label: "To pickup · empty", color: "#eab308" },
  PICKUP_DWELL: { label: "Picking up", color: "#f97316" },
  PASSENGER_TRAVEL: { label: "Passenger onboard", color: "#10b981" },
  DROPOFF_DWELL: { label: "Dropping off", color: "#3b82f6" },
  DEPOT_TRAVEL: { label: "To depot · empty", color: "#a855f7" },
  CHARGING_QUEUE: { label: "Charging queue", color: "#ec4899" },
  CHARGING: { label: "Charging", color: "#06b6d4" },
};

export function indexPlayback(playback?: Playback | null) {
  const vehicles = new Map<number, Segment[]>();
  for (const segment of playback?.segments ?? []) {
    const segments = vehicles.get(segment.vehicle_id) ?? [];
    segments.push(segment);
    vehicles.set(segment.vehicle_id, segments);
  }
  for (const segments of vehicles.values())
    segments.sort((a, b) => a.start_minute - b.start_minute);
  return vehicles;
}

// Presentation only: locate the API state and interpolate its supplied endpoints.
export function vehicleAt(segments: Segment[], minute: number) {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (segments[middle].start_minute <= minute) low = middle + 1;
    else high = middle;
  }
  const segment = segments[low - 1];
  if (!segment || minute > segment.end_minute) return undefined;
  const fraction = Math.max(
    0,
    Math.min(
      1,
      (minute - segment.start_minute) /
        (segment.end_minute - segment.start_minute),
    ),
  );
  return {
    segment,
    x:
      segment.from_x_miles +
      fraction * (segment.to_x_miles - segment.from_x_miles),
    y:
      segment.from_y_miles +
      fraction * (segment.to_y_miles - segment.from_y_miles),
    angle: Math.atan2(
      segment.to_y_miles - segment.from_y_miles,
      segment.to_x_miles - segment.from_x_miles,
    ),
  };
}

export function geographicFrame(playback?: Playback | null) {
  if (
    !playback ||
    playback.origin_longitude == null ||
    playback.origin_latitude == null ||
    !playback.miles_per_degree_longitude ||
    !playback.miles_per_degree_latitude
  )
    return undefined;
  const {
    origin_longitude: lon,
    origin_latitude: lat,
    miles_per_degree_longitude: lonScale,
    miles_per_degree_latitude: latScale,
  } = playback;
  return (x: number, y: number): [number, number] => [
    lon + x / lonScale,
    lat + y / latScale,
  ];
}
