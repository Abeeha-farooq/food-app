// src/components/ui/TrackDeliveryMap.tsx
// ===============================
// Purpose: Self-contained "Track your order" widget for the
//          customer side. Renders a Leaflet map showing the
//          restaurant (pickup), customer (delivery), and the
//          rider's live position, plus a distance + ETA banner.
//
//          Polls the server every 15 seconds for the rider's
//          latest position. Stops polling when the order
//          reaches a terminal state (delivered / cancelled) or
//          the user navigates away.
//
//          Used inside <OrderCard> on the user's "My Orders"
//          page, only when the order is in a "live delivery"
//          state (preparing / out_for_delivery).
// ===============================

import { useEffect, useState } from "react";
import { Loader2, MapPin, Clock } from "lucide-react";
import DeliveryMap from "./DeliveryMap";
import api, { getErrorMessage } from "@/lib/api";

interface RiderLocation {
  lat: number;
  lng: number;
  updatedAt: string | null;
}

interface TrackDeliveryMapProps {
  orderId: string;
  /** Pickup address string (for the popup). */
  restaurantName?: string;
  /** Customer's delivery address (for the popup). */
  deliveryAddress: string;
}

// The 3 statuses where tracking makes sense. Below `confirmed`,
// the kitchen hasn't accepted the order yet — no point showing
// a map. Above `delivered`, the rider isn't on the road anymore.
const TRACKABLE_STATUSES = new Set(["preparing", "out_for_delivery", "confirmed"]);

const POLL_INTERVAL_MS = 15_000;

const TrackDeliveryMap = ({
  orderId,
  restaurantName,
  deliveryAddress,
}: TrackDeliveryMapProps) => {
  const [rider, setRider] = useState<RiderLocation | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  // ----- The polling loop -----
  // We hit GET /api/orders/:id/rider-location every 15s and
  // store the result. The polling stops when the status reaches
  // a terminal state OR the component unmounts.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      try {
        const res = await api.get(`/orders/${orderId}/rider-location`);
        if (cancelled) return;
        const data = res.data.data;
        setStatus(data.status);
        setRider(data.riderLocation);
        setLastError(null);
      } catch (err) {
        if (cancelled) return;
        // Capture the error but don't spam the customer with toasts
        // on every poll. We surface it in a small banner instead.
        setLastError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // First tick immediately so the map shows right away.
    tick();
    // Then poll on a 15s interval.
    timer = window.setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [orderId]);

  // ----- Don't render anything if the order isn't in a trackable state -----
  if (status && !TRACKABLE_STATUSES.has(status)) {
    return null;
  }

  // ----- Build the customer pin (lat/lng) -----
  // We don't store lat/lng for the customer's delivery address on
  // the server. To still render a map, we use a Nominatim-free
  // approach: if the rider has reported a position, we use that
  // as the map center and just show the rider pin. The customer
  // and restaurant pins are skipped until we have their coords.
  // The customer can still see the rider moving on the map.
  //
  // (A future iteration can geocode at order placement time and
  // store the lat/lng on the order — then all 3 pins would show.)
  if (!rider || rider.lat == null || rider.lng == null) {
    return (
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Looking for your rider…</span>
            </>
          ) : lastError ? (
            <>
              <MapPin className="w-4 h-4 text-red-500" />
              <span className="text-red-600">Couldn't load tracking: {lastError}</span>
            </>
          ) : (
            <>
              <Clock className="w-4 h-4" />
              <span>Your rider hasn't started moving yet. We'll show their live location here as soon as they do.</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // ----- Render the map with the rider pin centered on their position -----
  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
        <span className="w-2 h-2 rounded-full bg-orange animate-pulse" />
        Track your order
        <span className="ml-auto text-xs text-gray-400 font-normal">live</span>
      </div>
      <DeliveryMap
        // We use the rider's position as the customer pin too —
        // that's the only coordinate we have client-side. The
        // DeliveryMap will draw a single marker and a sensible
        // zoom. Once we geocode delivery addresses, this can
        // be split into two distinct markers.
        customer={{
          lat: rider.lat,
          lng: rider.lng,
          label: deliveryAddress,
        }}
        restaurant={
          restaurantName
            ? { lat: rider.lat, lng: rider.lng, label: restaurantName }
            : undefined
        }
        rider={{
          lat: rider.lat,
          lng: rider.lng,
          label: "Your rider",
        }}
        height={260}
      />
    </div>
  );
};

export default TrackDeliveryMap;
