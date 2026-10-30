"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { Listing } from "@/lib/directory";
import { shortDate } from "@/lib/share";
import { formatSignTime } from "@/lib/utils";

// Pins drawn as HTML (no image files to bundle).
const salePin = L.divIcon({
  className: "",
  html: '<div style="font-size:30px;line-height:30px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">📍</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 30], // the pin's tip sits on the spot
  popupAnchor: [0, -28],
});
const youPin = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function FitToPins({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    // the map may be measured before it's laid out; re-measure, then frame the pins
    const t = setTimeout(() => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 13);
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Map of sales in the current results (and the buyer's chosen location). */
export default function SalesMap({
  listings,
  center,
}: {
  listings: Listing[];
  center: { lat: number; lng: number } | null;
}) {
  const mapped = listings.filter((l) => l.coords);
  const points: [number, number][] = [
    ...mapped.map((l) => [l.coords!.lat, l.coords!.lng] as [number, number]),
    ...(center ? [[center.lat, center.lng] as [number, number]] : []),
  ];
  const start: [number, number] = points[0] ?? [39.5, -98.35]; // middle of the US

  return (
    <div className="relative z-0 rounded-xl overflow-hidden border-2 border-cardboard-dark shadow-tag">
      <MapContainer center={start} zoom={points.length ? 12 : 4} scrollWheelZoom={false} style={{ height: 460 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPins points={points} />
        {center && <Marker position={[center.lat, center.lng]} icon={youPin} />}
        {mapped.map((l) => (
          <Marker key={l.slug} position={[l.coords!.lat, l.coords!.lng]} icon={salePin}>
            <Popup>
              <a href={`/s/${l.slug}?src=directory`} style={{ fontWeight: 700 }}>
                {l.name}
              </a>
              <br />
              {shortDate(l.days[0].date)}, {formatSignTime(l.days[0].start_time)}–{formatSignTime(l.days[0].end_time)}
              {l.distanceMiles != null && <> · {l.distanceMiles.toFixed(1)} mi</>}
              <br />
              <span style={{ opacity: 0.7 }}>{l.location}</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {listings.length > mapped.length && (
        <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 text-[11px] font-semibold px-2 py-1 rounded-md">
          {listings.length - mapped.length} sale{listings.length - mapped.length === 1 ? "" : "s"} not on the map yet
        </div>
      )}
    </div>
  );
}
