/**
 * AttackCanvasLayer — Canvas-based attack arc renderer.
 *
 * Replaces the previous SVG-based AttackArc.tsx (<Polyline> + <CircleMarker>)
 * with a single HTML5 Canvas overlay on Leaflet.  All arcs, particles, pulse
 * rings, and source dots are painted in ONE draw call per animation frame,
 * eliminating hundreds of SVG DOM elements and CSS animation conflicts.
 *
 * Architecture:
 *   1. A Leaflet pane ("attackCanvas") holds a single <canvas> element that
 *      fills the map container.
 *   2. On every `requestAnimationFrame` tick we:
 *        a) Clear the canvas.
 *        b) For each bundled arc: compute Bezier points in *pixel* space
 *           (via `map.latLngToContainerPoint`), then draw the static base
 *           arc, the animated particle dot (position based on real path
 *           length), the pulsing target ring, and the source dot.
 *   3. The component receives pre-bundled events so it never does its own
 *      grouping — that responsibility stays in MapCore's `EventRenderer`.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useMap, useMapEvent } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import Supercluster from 'supercluster';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CanvasArcEvent {
  key: string;
  sourceLat: number;
  sourceLng: number;
  destLat: number;
  destLng: number;
  /** 'local_sensor' → cyan, 'global_threat_feed' → purple */
  sourceKind: string;
  count: number;
  /** Event type for tooltip (not rendered on canvas — tooltip is a separate concern) */
  type: string;
  /** ms timestamp when the event was received, used for fade-out */
  receivedAt: number;
  /** true when arc has no dest (point-only) */
  isPointOnly?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COLOR_CYAN  = '#06b6d4';
const COLOR_PURPLE= '#c084fc';
const COLOR_WHITE = '#ffffff';
const ARC_SEGMENTS = 24;           // Bezier resolution (per arc)
const PARTICLE_DURATION_MS = 1200; // One particle trip along the arc
const PULSE_DURATION_MS = 1500;    // Target pulse cycle
const FADE_DURATION_MS = 10_000;   // Match the 10-second TTL

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Quadratic Bezier with perpendicular control point (in pixel space). */
function bezierPoints(
  sx: number, sy: number,
  ex: number, ey: number,
  segments: number
): { points: Float64Array; totalLength: number } {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(len * 0.15, 80); // px offset for control point

  // Perpendicular direction
  const nx = -dy / (len || 1);
  const ny =  dx / (len || 1);

  const cpx = (sx + ex) / 2 + nx * offset;
  const cpy = (sy + ey) / 2 + ny * offset;

  // Pre-allocate typed array: x,y pairs
  const points = new Float64Array((segments + 1) * 2);
  let totalLength = 0;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * sx + 2 * mt * t * cpx + t * t * ex;
    const y = mt * mt * sy + 2 * mt * t * cpy + t * t * ey;
    points[i * 2]     = x;
    points[i * 2 + 1] = y;
    if (i > 0) {
      const px = points[(i - 1) * 2];
      const py = points[(i - 1) * 2 + 1];
      totalLength += Math.sqrt((x - px) ** 2 + (y - py) ** 2);
    }
  }
  return { points, totalLength };
}

/** Point along polyline at a normalised `t ∈ [0,1]`. */
function pointAtFraction(
  points: Float64Array,
  totalLength: number,
  t: number
): [number, number] {
  const targetDist = t * totalLength;
  let accum = 0;
  const n = points.length / 2;
  for (let i = 1; i < n; i++) {
    const px = points[(i - 1) * 2];
    const py = points[(i - 1) * 2 + 1];
    const cx = points[i * 2];
    const cy = points[i * 2 + 1];
    const segLen = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
    if (accum + segLen >= targetDist) {
      const frac = (targetDist - accum) / (segLen || 1);
      return [px + (cx - px) * frac, py + (cy - py) * frac];
    }
    accum += segLen;
  }
  // Fallback: end point
  return [points[(n - 1) * 2], points[(n - 1) * 2 + 1]];
}

// ─── Cluster threshold — cluster source dots when zoom <= this level ──────────
const CLUSTER_ZOOM_THRESHOLD = 4;

// ─── React component ─────────────────────────────────────────────────────────


function createGlowSprite(color: string, radius: number, blur: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const size = (radius + blur) * 2;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const center = size / 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = COLOR_WHITE;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

const cyanParticleSprite = createGlowSprite(COLOR_CYAN, 5, 12);
const purpleParticleSprite = createGlowSprite(COLOR_PURPLE, 5, 12);
const cyanClusterSprite = createGlowSprite(COLOR_CYAN, 30, 10);

export const AttackCanvasLayer: React.FC<{ arcs: CanvasArcEvent[] }> = ({ arcs }) => {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const arcsRef = useRef<CanvasArcEvent[]>(arcs);
  const zoomRef = useRef<number>(map.getZoom());

  // Track zoom for clustering decisions
  useMapEvent('zoomend', () => { zoomRef.current = map.getZoom(); });

  // Keep arcsRef in sync without causing re-renders
  useEffect(() => {
    arcsRef.current = arcs;
  }, [arcs]);

  // ── Supercluster index — rebuilt when arcs change ───────────────────────
  const clusterIndex = useMemo(() => {
    const index = new Supercluster({
      radius: 60,             // cluster radius in pixels
      maxZoom: CLUSTER_ZOOM_THRESHOLD,
      minPoints: 2,
    });

    // Build GeoJSON features from source points of ALL arcs (both arc and point-only)
    const features: GeoJSON.Feature<GeoJSON.Point>[] = arcs.map((arc, i) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [arc.sourceLng, arc.sourceLat],
      },
      properties: { index: i, sourceKind: arc.sourceKind },
    }));

    index.load(features);
    return index;
  }, [arcs]);

  // ── Bootstrap canvas ────────────────────────────────────────────────────
  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '450'; // above tiles, below controls
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    map.on('resize', resize);

    return () => {
      ro.disconnect();
      map.off('resize', resize);
      container.removeChild(canvas);
      canvasRef.current = null;
    };
  }, [map]);

  // ── Draw loop ───────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);

    const now = performance.now();
    const currentArcs = arcsRef.current;

    // Store unique destinations to draw pulse rings only once per target
    const destMap = new Map<string, { x: number, y: number, color: string, fadeAlpha: number, count: number }>();

    for (let i = 0; i < currentArcs.length; i++) {
      const arc = currentArcs[i];
      const color = arc.sourceKind === 'global_threat_feed' ? COLOR_PURPLE : COLOR_CYAN;

      // ── Fade-out opacity based on TTL ───────────────────────────────
      const age = Date.now() - arc.receivedAt;
      if (age > FADE_DURATION_MS) continue; // skip expired
      const fadeAlpha = age < FADE_DURATION_MS * 0.7
        ? 1.0
        : 1.0 - (age - FADE_DURATION_MS * 0.7) / (FADE_DURATION_MS * 0.3);

      // ── Convert lat/lng → container px ──────────────────────────────
      const srcPt = (map as LeafletMap).latLngToContainerPoint([arc.sourceLat, arc.sourceLng]);

      if (arc.isPointOnly || arc.destLat === 0 && arc.destLng === 0) {
        // Point-only: just draw source dot with pulse
        drawPulse(ctx, srcPt.x, srcPt.y, color, fadeAlpha, now, 4);
        drawDot(ctx, srcPt.x, srcPt.y, 4, color, COLOR_WHITE, fadeAlpha);
        continue;
      }

      const dstPt = (map as LeafletMap).latLngToContainerPoint([arc.destLat, arc.destLng]);

      // ── Bezier curve in pixel space ─────────────────────────────────
      const { points, totalLength } = bezierPoints(
        srcPt.x, srcPt.y, dstPt.x, dstPt.y, ARC_SEGMENTS
      );
      if (totalLength < 2) continue; // degenerate

      const weight = Math.min(1.5 + arc.count * 0.4, 5);

      // ── 1. Base arc (static glow) ──────────────────────────────────
      ctx.save();
      ctx.globalAlpha = 0.35 * fadeAlpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.shadowColor = color;
      ctx.shadowBlur = 0; // Disabled for performance, using offscreen sprite for glow
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let j = 1; j <= ARC_SEGMENTS; j++) {
        ctx.lineTo(points[j * 2], points[j * 2 + 1]);
      }
      ctx.stroke();
      ctx.restore();

      // ── 2. Animated particle (Comet tail using Canvas Path) ─
      const particleT = ((now % PARTICLE_DURATION_MS) / PARTICLE_DURATION_MS);
      const particleRadius = Math.min(2.5 + arc.count * 0.3, 5);
      const sprite = color === COLOR_CYAN ? cyanParticleSprite : purpleParticleSprite;

      const tailLength = 0.20; // 20% of arc length

      if (particleT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        // Find tail start t
        const tailStartT = Math.max(0, particleT - tailLength);
        
        // Collect points along the bezier curve from tailStartT to particleT
        ctx.beginPath();
        const [startX, startY] = pointAtFraction(points, totalLength, tailStartT);
        ctx.moveTo(startX, startY);
        
        const steps = 10;
        for (let s = 1; s <= steps; s++) {
           const t = tailStartT + (particleT - tailStartT) * (s / steps);
           const [tx, ty] = pointAtFraction(points, totalLength, t);
           ctx.lineTo(tx, ty);
        }
        
        // Create linear gradient from tail to head
        const [headX, headY] = pointAtFraction(points, totalLength, particleT);
        const grad = ctx.createLinearGradient(startX, startY, headX, headY);
        const colorTransparent = color + '00'; // Append 00 for 0 opacity
        grad.addColorStop(0, colorTransparent); 
        grad.addColorStop(1, color); 
        
        ctx.strokeStyle = grad;
        ctx.lineWidth = particleRadius * 1.5;
        ctx.lineCap = 'round';
        ctx.globalAlpha = fadeAlpha;
        ctx.stroke();
        
        // Draw the glowing head (sprite) at the very front
        const scale = particleRadius / 5;
        const spriteSize = (5 + 12) * 2 * scale;
        ctx.drawImage(sprite, headX - spriteSize / 2, headY - spriteSize / 2, spriteSize, spriteSize);
        
        ctx.restore();
      }

      // ── 3. Target pulse ring (Deferred to deduplicate) ────────────
      const key = `${arc.destLat},${arc.destLng}`;
      if (!destMap.has(key)) {
        destMap.set(key, { x: dstPt.x, y: dstPt.y, color, fadeAlpha, count: arc.count });
      } else {
        const existing = destMap.get(key)!;
        existing.count += arc.count;
        existing.fadeAlpha = Math.max(existing.fadeAlpha, fadeAlpha);
      }

      // ── 5. Source dot (NO conflicting animation — simple static) ───
      drawDot(ctx, srcPt.x, srcPt.y, Math.min(2 + arc.count * 0.3, 5), color, color, fadeAlpha * 0.8);
    }

    // ── Draw Deduplicated Target Pulses & Dots ────────────────────────────
    destMap.forEach((target) => {
      const targetRadius = Math.min(3 + target.count * 0.5, 8);
      drawPulse(ctx, target.x, target.y, target.color, target.fadeAlpha, now, targetRadius);
      drawDot(ctx, target.x, target.y, targetRadius, target.color, COLOR_WHITE, target.fadeAlpha);
    });

    // ── Cluster overlay at low zoom ──────────────────────────────────────
    const zoom = zoomRef.current;
    if (zoom <= CLUSTER_ZOOM_THRESHOLD && currentArcs.length > 0) {
      const bounds = (map as LeafletMap).getBounds();
      const clusters = clusterIndex.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        Math.floor(zoom)
      );

      for (const cluster of clusters) {
        if (!cluster.properties.cluster) continue; // Skip individual points (already drawn above)

        const [lng, lat] = cluster.geometry.coordinates;
        const pt = (map as LeafletMap).latLngToContainerPoint([lat, lng]);
        const pointCount = cluster.properties.point_count || 1;

        // Cluster dot size scales with count
        const clusterRadius = Math.min(10 + Math.log2(pointCount) * 4, 30);

        // Draw cluster circle
        ctx.save();
        ctx.globalAlpha = 0.85;
        const scale = clusterRadius / 30;
        const spriteSize = (30 + 10) * 2 * scale;
        // Draw glow sprite
        ctx.drawImage(cyanClusterSprite, pt.x - spriteSize / 2, pt.y - spriteSize / 2, spriteSize, spriteSize);
        // Draw sharp border
        ctx.strokeStyle = COLOR_CYAN;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, clusterRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Draw count label
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = COLOR_WHITE;
        ctx.font = `bold ${Math.min(11 + Math.log2(pointCount), 16)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          pointCount >= 1000 ? `${(pointCount / 1000).toFixed(1)}k` : String(pointCount),
          pt.x, pt.y
        );
        ctx.restore();
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [map, clusterIndex]);

  // ── Start / stop animation loop + redraw on map move ────────────────────
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);

    // Redraw when map moves/zooms (latLngToContainerPoint changes)
    const onMove = () => {
      // The rAF loop already runs continuously, but we want an immediate
      // refresh after a pan/zoom so arcs don't visually lag the tiles.
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };
    map.on('move', onMove);
    map.on('zoom', onMove);

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.off('move', onMove);
      map.off('zoom', onMove);
    };
  }, [map, draw]);

  return null; // Renders nothing to React DOM — the canvas is imperative
};

// ─── Drawing primitives ───────────────────────────────────────────────────────

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  stroke: string, fill: string, alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPulse(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, color: string,
  fadeAlpha: number, now: number, baseRadius: number
) {
  const pulseT = (now % PULSE_DURATION_MS) / PULSE_DURATION_MS;
  const pulseRadius = baseRadius + pulseT * baseRadius * 3;
  const pulseAlpha = (1 - pulseT) * 0.6 * fadeAlpha;

  ctx.save();
  ctx.globalAlpha = pulseAlpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2 - pulseT * 1.5, 0.5);
  ctx.beginPath();
  ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
