// src/components/ui/DeliveryMap.tsx
// ===============================
// Purpose: A small Google Maps embed that shows a delivery in
//          progress — 2 or 3 pins (restaurant, customer, rider)
//          + the rider→customer distance + ETA banner.
//
// Why Google Maps (vs Leaflet/OSM):
//   - More accurate for Pakistan addresses
//   - Same API key powers the geocoding (server) + the map (client)
//   - Familiar UX for users
//   - Free tier is $200/month credit — enough for a small app
//
// Usage:
//   <DeliveryMap
//     customer={{ lat: 31.5, lng: 73.1, label: "Customer" }}
//     restaurant={{ lat: 31.4, lng: 73.0, label: "Pizza Place" }}
//     rider={riderLocation ? { lat, lng, label: "Rider" } : null}
//   />
//
// Loading model:
//   - The Google Maps JS API is loaded ONCE per page (via
//     importLibrary). All <DeliveryMap> instances on the same
//     page share the same `google.maps` namespace.
//   - We use the modern functional API (setOptions + importLibrary)
//     instead of the deprecated Loader class.
// ===============================

import { useEffect, useMemo, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { haversineMeters, formatDistance, formatEta } from "@/lib/distance";

// ============================================================
// Singleton bootstrap
// ============================================================
// setOptions() can be called many times — only the first call
// actually configures the loader. We guard with a module-level
// flag so subsequent calls (e.g. from a second <DeliveryMap> on
// the same page) are no-ops. importLibrary() deduplicates
// internally so multiple simultaneous calls share one network
// request.
let configured = false;
const ensureConfigured = () => {
  if (configured) return;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VITE_GOOGLE_MAPS_API_KEY is not set. Add it to client/.env.local."
    );
  }
  setOptions({
    key: apiKey,
    v: "weekly",
    // "places" is included so future autocomplete for the
    // delivery address input "just works" without a config
    // change. Cost is the same — Google bills per request, not
    // per library.
    libraries: ["maps", "marker", "places"],
  });
  configured = true;
};

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

const DeliveryMap = ({
  customer,
  restaurant,
  rider,
  height = 320,
}: DeliveryMapProps) => {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Keep refs to the live google.maps.Map and each marker so we
  // can update positions without re-creating them on every render.
  // (Creating new markers every 15s when the rider moves would
  // be wasteful + cause a visible flicker.)
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{
    restaurant?: google.maps.Marker;
    customer?: google.maps.Marker;
    rider?: google.maps.Marker;
  }>({});

  // ----- Compute the rider → customer distance for the header -----
  // (rendered above the map) — useful even on small screens where
  // the map pins might be hard to see.
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

  // ----- Load the Maps JS API + create the map on mount -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        ensureConfigured();
        // Trigger the script load. We import "maps" first because
        // it includes the Map + Marker classes we need; "marker"
        // adds AdvancedMarkerElement (for future HTML markers).
        await importLibrary("maps");
        await importLibrary("marker");
        if (cancelled) return;
        if (!mapDivRef.current) return;
        const map = new google.maps.Map(mapDivRef.current, {
          center: { lat: customer.lat, lng: customer.lng },
          zoom: 13,
          // We disable scroll-wheel zoom so the page can scroll
          // past the map without zooming the map instead. Users
          // who want to zoom can use the +/- buttons or pinch.
          scrollwheel: false,
          // A clean, minimal map style. We could later add custom
          // styles via mapId + a Cloud-styled map.
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        setMapReady(true);
      } catch (err) {
        if (cancelled) return;
        const message =
          (err as Error)?.message || "Failed to load Google Maps";
        setLoadError(message);
        console.error("[DeliveryMap] Google Maps load failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // customer coords are only used for the initial center; we
    // re-fit bounds in a separate effect when the points change.
  }, [customer.lat, customer.lng]);

  // ----- Create / update markers when points change -----
  // SEPARATE effect from the load effect so markers can be
  // updated WITHOUT reloading the map. The map loads once on
  // mount; markers update on every render after the data
  // changes (e.g. rider moves every 15s).
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || typeof google === "undefined") return;

    // ----- Restaurant marker -----
    if (restaurant && !markersRef.current.restaurant) {
      markersRef.current.restaurant = new google.maps.Marker({
        position: { lat: restaurant.lat, lng: restaurant.lng },
        map,
        title: `Pickup: ${restaurant.label}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#d19254",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
    } else if (restaurant && markersRef.current.restaurant) {
      markersRef.current.restaurant.setPosition({
        lat: restaurant.lat,
        lng: restaurant.lng,
      });
    } else if (!restaurant && markersRef.current.restaurant) {
      // Restaurant was removed from props (e.g. user disabled
      // the restaurant layer). Tear down the marker.
      markersRef.current.restaurant.setMap(null);
      markersRef.current.restaurant = undefined;
    }

    // ----- Customer marker -----
    if (!markersRef.current.customer) {
      markersRef.current.customer = new google.maps.Marker({
        position: { lat: customer.lat, lng: customer.lng },
        map,
        title: `Delivery: ${customer.label}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#dc2626",  // red — "the destination"
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
    } else {
      markersRef.current.customer.setPosition({
        lat: customer.lat,
        lng: customer.lng,
      });
    }

    // ----- Rider marker (custom SVG with pulsing animation) -----
    if (rider && !markersRef.current.rider) {
      // Inline SVG so we get a colored ring + a CSS animation
      // for the "pulse" effect. We use the standard 32×40
      // anchor so the marker sits on the point correctly.
      markersRef.current.rider = new google.maps.Marker({
        position: { lat: rider.lat, lng: rider.lng },
        map,
        title: `Rider: ${rider.label}`,
        icon: {
          url:
            "data:image/svg+xml;charset=UTF-8," +
            encodeURIComponent(`
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
                <circle cx="16" cy="16" r="14" fill="#d19254" fill-opacity="0.25">
                  <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite"/>
                  <animate attributeName="fill-opacity" values="0.4;0.05;0.4" dur="2s" repeatCount="indefinite"/>
                </circle>
                <circle cx="16" cy="16" r="8" fill="#d19254" stroke="white" stroke-width="2"/>
              </svg>
            `),
          scaledSize: new google.maps.Size(32, 40),
          anchor: new google.maps.Point(16, 16),
        },
      });
    } else if (rider && markersRef.current.rider) {
      markersRef.current.rider.setPosition({
        lat: rider.lat,
        lng: rider.lng,
      });
    } else if (!rider && markersRef.current.rider) {
      // Rider went offline (e.g. their location is unknown
      // this tick). Remove the marker until they show up again.
      markersRef.current.rider.setMap(null);
      markersRef.current.rider = undefined;
    }

    // ----- Auto-fit bounds whenever any point changes -----
    // We include all 3 points (when available) so the map
    // always shows the full delivery context. padding keeps
    // the pins off the map edge; we manually cap the zoom
    // (Google's fitBounds doesn't have a maxZoom option).
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: customer.lat, lng: customer.lng });
    if (restaurant) bounds.extend({ lat: restaurant.lat, lng: restaurant.lng });
    if (rider) bounds.extend({ lat: rider.lat, lng: rider.lng });
    map.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 });
    const listener = google.maps.event.addListenerOnce(
      map,
      "bounds_changed",
      () => {
        if (map.getZoom()! > 16) map.setZoom(16);
      }
    );

    return () => {
      if (listener) google.maps.event.removeListener(listener);
    };
  }, [mapReady, customer, restaurant, rider]);

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
      <div style={{ height }} className="relative">
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 text-center p-4">
            <div>
              <p className="text-sm font-semibold text-red-600">
                Map failed to load
              </p>
              <p className="text-xs text-gray-500 mt-1">{loadError}</p>
              <p className="text-xs text-gray-400 mt-2">
                Check VITE_GOOGLE_MAPS_API_KEY in client/.env.local
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryMap;
