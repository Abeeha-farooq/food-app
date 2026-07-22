// src/components/ui/DeliveryMap.tsx
// ===============================
// Purpose: A small Leaflet/OpenStreetMap embed that shows a
//          delivery in progress — 2 or 3 pins (restaurant,
//          customer, rider) + the rider→customer distance.
//
// Why Leaflet (not Google Maps)?
//   - Free, no API key, no billing
//   - OpenStreetMap tiles
//   - Works in Vercel serverless / static deploys with no extra
//     config (the leaflet CSS is bundled, tiles are fetched
//     client-side from OSM)
//
// Usage:
//   <DeliveryMap
//     customer={{ lat: 31.5, lng: 73.1, label: "Customer" }}
//     restaurant={{ lat: 31.4, lng: 73.0, label: "Pizza Place" }}
//     rider={riderLocation ? { lat, lng, label: "Rider" } : null}
//   />
// ===============================

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { haversineMeters, formatDistance, formatEta } from "@/lib/distance";

// ============================================================
// ICON FIX
// ============================================================
// Leaflet's default marker icons reference paths via webpack-style
// imports that Vite doesn't resolve out of the box — the icons
// end up as broken images. We bypass that by setting the icon
// URLs to a public CDN (unpkg) and using a custom DivIcon for
// the rider so we can color it (orange = "on the way").
const defaultIcon = L.icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// Custom rider icon — a pulsing dot so it's easy to spot.
const riderIcon = L.divIcon({
  className: "rider-marker",
  html: `
    <div style="
      width: 22px;
      height: 22px;
      background: #d19254;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 0 2px #d19254, 0 0 8px rgba(0,0,0,.3);
    "></div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

interface MapPoint {
  lat: number;
  lng: number;
  label: string;
}

interface DeliveryMapProps {
  customer: MapPoint;
  restaurant?: MapPoint;
  rider?: MapPoint | null;
  /** Fixed height in px. Defaults to 320. */
  height?: number;
}

// ============================================================
// <FitBounds /> — auto-zoom the map to show all pins
// ============================================================
// A small inner component that uses the useMap() hook to call
// map.fitBounds() whenever the points change. We re-fit on each
// render because the rider pin moves every 15 seconds and the
// map should follow (with a small cushion so pins aren't on the
// very edge).
const FitBounds = ({ points }: { points: MapPoint[] }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length < 1) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    // 80px padding on all sides so the pins aren't flush against
    // the map's edge. maxZoom prevents the map from zooming in
    // too far when the rider + customer are very close.
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16 });
  }, [map, points]);
  return null;
};

const DeliveryMap = ({
  customer,
  restaurant,
  rider,
  height = 320,
}: DeliveryMapProps) => {
  // ----- Compute the rider → customer distance for the header -----
  // We render the distance + ETA OUTSIDE the map too, so it's
  // readable even on small screens where the map pins might be
  // hard to see. The map itself is for the visual route.
  const distance = useMemo(
    () =>
      rider
        ? haversineMeters(
            { lat: rider.lat, lng: rider.lng },
            { lat: customer.lat, lng: customer.lng }
          )
        : null,
    [rider, customer]
  );

  // ----- Determine initial center (before the FitBounds effect runs) -----
  // Default to the customer pin; FitBounds will re-center once mounted.
  const initialCenter: [number, number] = [customer.lat, customer.lng];

  // ----- Pin list for FitBounds (deduped) -----
  const allPoints = useMemo(() => {
    const pts: MapPoint[] = [customer];
    if (restaurant) pts.push(restaurant);
    if (rider) pts.push(rider);
    return pts;
  }, [customer, restaurant, rider]);

  return (
    <div className="w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
      {/* ----- Header: distance + ETA banner (above the map) ----- */}
      {rider && distance !== null && (
        <div className="px-3 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-orange animate-pulse" />
            <span className="text-gray-600">Rider is</span>
            <span className="font-semibold text-gray-900">
              {formatDistance(distance)}
            </span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-600">ETA</span>
            <span className="font-semibold text-gray-900">
              {formatEta(distance)}
            </span>
          </div>
          <span className="text-xs text-gray-400">live</span>
        </div>
      )}

      {/* ----- The map itself ----- */}
      <div style={{ height }}>
        <MapContainer
          center={initialCenter}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            // OpenStreetMap tiles — free, no key.
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {restaurant && (
            <Marker position={[restaurant.lat, restaurant.lng]} icon={defaultIcon}>
              <Popup>
                <strong>Pickup</strong>
                <br />
                {restaurant.label}
              </Popup>
            </Marker>
          )}

          <Marker position={[customer.lat, customer.lng]} icon={defaultIcon}>
            <Popup>
              <strong>Delivery</strong>
              <br />
              {customer.label}
            </Popup>
          </Marker>

          {rider && (
            <Marker
              position={[rider.lat, rider.lng]}
              icon={riderIcon}
            >
              <Popup>
                <strong>Rider</strong>
                <br />
                {rider.label}
              </Popup>
            </Marker>
          )}

          <FitBounds points={allPoints} />
        </MapContainer>
      </div>
    </div>
  );
};

export default DeliveryMap;
