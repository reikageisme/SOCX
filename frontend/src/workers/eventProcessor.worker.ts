/**
 * Web Worker for threat event processing — offloads bundling, filtering,
 * and TTL cleanup from the main thread.
 *
 * Messages IN:
 *   { type: 'process', events: ThreatEvent[], activeLayers: string[], bounds: BoundsData }
 *
 * Messages OUT:
 *   { type: 'result', arcs: CanvasArcEvent[] }
 */

interface Coords {
  lat: number;
  lng: number;
  country: string;
  query?: string;
  is_local?: boolean;
}

interface WorkerEvent {
  id: string;
  source_kind?: string;
  source: Coords;
  dest?: Coords;
  type: string;
  _receivedAt?: number;
}

interface BoundsData {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface WorkerArc {
  key: string;
  sourceLat: number;
  sourceLng: number;
  destLat: number;
  destLng: number;
  sourceKind: string;
  count: number;
  type: string;
  receivedAt: number;
  isPointOnly: boolean;
}

function getEventLayer(type: string): string {
  if (type === 'malicious_ip' || type === 'Malware') return 'malicious_ip';
  return type;
}

function inBounds(lat: number, lng: number, b: BoundsData, pad: number): boolean {
  const latRange = (b.north - b.south) * pad;
  const lngRange = (b.east - b.west) * pad;
  return (
    lat >= b.south - latRange && lat <= b.north + latRange &&
    lng >= b.west - lngRange && lng <= b.east + lngRange
  );
}

self.onmessage = (e: MessageEvent) => {
  if (e.data.type !== 'process') return;

  const { events, activeLayers, bounds } = e.data as {
    events: WorkerEvent[];
    activeLayers: string[];
    bounds: BoundsData | null;
  };

  // Step 1: Filter by active layers
  const visible = events.filter(ev => {
    if (ev.source?.is_local) return false;
    if (!activeLayers || activeLayers.length === 0) return true;
    return activeLayers.includes(getEventLayer(ev.type));
  });

  // Step 2: Viewport culling (30% padding)
  const inView = bounds
    ? visible.filter(ev => {
        const srcIn = ev.source?.lat && ev.source?.lng
          ? inBounds(ev.source.lat, ev.source.lng, bounds, 0.3)
          : false;
        const dstIn = ev.dest?.lat && ev.dest?.lng
          ? inBounds(ev.dest.lat, ev.dest.lng, bounds, 0.3)
          : false;
        return srcIn || dstIn || !ev.dest;
      })
    : visible;

  // Step 3: Bundle
  const bundles: Record<string, WorkerArc> = {};

  for (const ev of inView) {
    if (ev.dest) {
      const srcKey = ev.source.country || `${Math.round(ev.source.lat)},${Math.round(ev.source.lng)}`;
      const dstKey = ev.dest.country || `${Math.round(ev.dest.lat)},${Math.round(ev.dest.lng)}`;
      const kind = ev.source_kind || 'local_sensor';
      const key = `${srcKey}::${dstKey}::${kind}`;

      if (!bundles[key]) {
        bundles[key] = {
          key,
          sourceLat: ev.source.lat,
          sourceLng: ev.source.lng,
          destLat: ev.dest.lat,
          destLng: ev.dest.lng,
          sourceKind: kind,
          count: 1,
          type: ev.type,
          receivedAt: ev._receivedAt || Date.now(),
          isPointOnly: false,
        };
      } else {
        bundles[key].count += 1;
        const ra = ev._receivedAt || Date.now();
        if (ra > bundles[key].receivedAt) {
          bundles[key].receivedAt = ra;
        }
      }
    } else {
      const key = `pt::${ev.id}`;
      bundles[key] = {
        key,
        sourceLat: ev.source?.lat || 0,
        sourceLng: ev.source?.lng || 0,
        destLat: 0,
        destLng: 0,
        sourceKind: ev.source_kind || 'local_sensor',
        count: 1,
        type: ev.type,
        receivedAt: ev._receivedAt || Date.now(),
        isPointOnly: true,
      };
    }
  }

  (self as unknown as Worker).postMessage({
    type: 'result',
    arcs: Object.values(bundles),
  });
};
