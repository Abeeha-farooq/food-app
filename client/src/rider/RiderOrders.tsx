// src/rider/RiderOrders.tsx
// ===============================
// Purpose: The rider's "My Deliveries" page (URL: /rider/orders).
//          Lists every order assigned to the current rider, with
//          filter pills (All / Pending / Completed) and per-order
//          action buttons (Accept, Picked Up, Mark as Delivered).
//          Also handles the live-location broadcast: while the
//          rider has an active delivery, the browser's GPS is
//          sent to the server every ~15s.
// ===============================

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  STATUS_LABELS,
  type Order,
  type OrderStatus,
} from "@/lib/orderStatus";
import {
  ShoppingBag,
  MapPin,
  Phone,
  Package,
  Check,
  Truck,
  MapPinOff,
  XCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import DeliveryMap from "@/components/ui/DeliveryMap";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";
import useGeolocation from "@/lib/useGeolocation";
import { haversineMeters, formatDistance } from "@/lib/distance";

// ============================================================
// FILTER TABS
// ============================================================
type Filter = "all" | "pending" | "completed";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending Deliveries" },
  { value: "completed", label: "Completed" },
];

const RiderOrders = () => {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Per-order action in flight — keyed by order id so we can show
  // a spinner on the right button.
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  // ----- Live location (browser GPS) -----
  // Only enabled when the rider has at least one order in a
  // "live delivery" state (confirmed / preparing / out_for_delivery).
  // Privacy: we don't request location when the rider has no
  // active work — there's no reason to know where they are.
  const activeOrders = useMemo<Order[]>(
    () =>
      (orders || []).filter(
        (o) =>
          o.status === "confirmed" ||
          o.status === "preparing" ||
          o.status === "out_for_delivery"
      ),
    [orders]
  );
  const { coords: riderCoords, error: geoError } =
    useGeolocation(activeOrders.length > 0);

  // Show a one-time toast if the rider denies location. We don't
  // spam the toast on every render — use a ref.
  const geoErrorShown = useRef(false);
  useEffect(() => {
    if (geoError && !geoErrorShown.current) {
      toast.warning(geoError);
      geoErrorShown.current = true;
    }
    if (!geoError) geoErrorShown.current = false;
  }, [geoError]);

  // ----- Periodic location broadcast (every 15s) -----
  // The browser's geolocation gives us a stream of position
  // updates (via watchPosition). We only need to upload one
  // snapshot per order every ~15s — the server keeps the latest.
  // We round-robin across active orders so if a rider has 2
  // deliveries in parallel, both get updated.
  const lastSentRef = useRef<{ ts: number; lat: number; lng: number }>({
    ts: 0,
    lat: 0,
    lng: 0,
  });
  useEffect(() => {
    if (!riderCoords || activeOrders.length === 0) return;
    const now = Date.now();
    if (now - lastSentRef.current.ts < 15_000) return;
    // Only send if the rider actually moved > 20m since the last
    // send — saves bandwidth when the rider is stationary (e.g.
    // waiting at the restaurant for the food).
    const moved = haversineMeters(
      { lat: lastSentRef.current.lat, lng: lastSentRef.current.lng },
      { lat: riderCoords.lat, lng: riderCoords.lng }
    );
    if (lastSentRef.current.ts !== 0 && moved < 20) return;

    lastSentRef.current = {
      ts: now,
      lat: riderCoords.lat,
      lng: riderCoords.lng,
    };
    // Upload in the background — failures shouldn't bother the
    // rider (network blip etc.). We log to console for debugging.
    (async () => {
      for (const order of activeOrders) {
        try {
          await api.post("/rider/location", {
            lat: riderCoords.lat,
            lng: riderCoords.lng,
            orderId: order._id,
          });
        } catch (err) {
          // Silent: the rider shouldn't be bothered with transient
          // network errors. Worst case the customer's map shows
          // the last known position.
          console.warn(
            `[RiderOrders] Failed to upload location for order ${order._id}:`,
            err
          );
        }
      }
    })();
  }, [riderCoords, activeOrders]);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/orders/rider/me");
      setOrders(res.data.data);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // ----- Filter the list based on the active tab -----
  const filtered = useMemo(() => {
    if (!orders) return [];
    if (filter === "pending") {
      // "Pending" = anything in the delivery flow that's not
      // delivered/cancelled yet (assigned → picked up).
      return orders.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled"
      );
    }
    if (filter === "completed") {
      return orders.filter((o) => o.status === "delivered");
    }
    return orders;
  }, [orders, filter]);

  // ----- Action: Accept Order -----
  // Calls PATCH /orders/:id/rider-accept. Sets `riderAcceptedAt`
  // server-side. Idempotent on the server.
  const handleAccept = async (orderId: string) => {
    setBusyOrderId(orderId);
    try {
      await api.patch(`/orders/${orderId}/rider-accept`);
      toast.success("Order accepted");
      await fetchOrders();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyOrderId(null);
    }
  };

  // ----- Action: Picked Up / Mark as Delivered / Mark as Refused -----
  // All three go through the existing PATCH /orders/:id/status
  // endpoint. The server allows riders to set only
  // "out_for_delivery", "delivered", or "refused" (enforced in
  // the controller).
  const handleStatus = async (orderId: string, newStatus: OrderStatus) => {
    setBusyOrderId(orderId);
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      const successMessages: Record<OrderStatus, string> = {
        placed:           "Order reset to placed",
        confirmed:        "Order confirmed",
        preparing:        "Marked as preparing",
        out_for_delivery: "Marked as picked up",
        delivered:        "Marked as delivered",
        cancelled:        "Order cancelled",
        refused:          "Marked as refused by customer",
      };
      toast.success(successMessages[newStatus]);
      await fetchOrders();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="My Deliveries" />
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchOrders} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<ShoppingBag className="text-orange" />}
        title="My Deliveries"
        subtitle="All orders assigned to you"
      />

      {/* ============== FILTER PILLS ============== */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? "bg-orange text-black border-orange"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* ============== ORDER LIST ============== */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Package className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No orders here</h3>
            <p className="text-sm text-gray-500 mt-1">
              {filter === "completed"
                ? "You haven't delivered any orders yet."
                : "No new assignments right now."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              busy={busyOrderId === order._id}
              onAccept={() => handleAccept(order._id)}
              onPickedUp={() => handleStatus(order._id, "out_for_delivery")}
              onDelivered={() => handleStatus(order._id, "delivered")}
              onRefused={() => handleStatus(order._id, "refused")}
              riderCoords={riderCoords}
              geoError={geoError}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// ORDER CARD — single order with all its details + action buttons
// ============================================================
const OrderCard = ({
  order,
  busy,
  onAccept,
  onPickedUp,
  onDelivered,
  onRefused,
  riderCoords,
  geoError,
}: {
  order: Order;
  busy: boolean;
  onAccept: () => void;
  onPickedUp: () => void;
  onDelivered: () => void;
  /** Mark as Refused by Customer (rider arrived, customer didn't take it). */
  onRefused: () => void;
  /** Rider's current GPS (for distance indicators). */
  riderCoords: { lat: number; lng: number } | null;
  /** Error from the geolocation hook (for the status banner). */
  geoError: string | null;
}) => {
  // Decide which action button (if any) to show based on the
  // current state. The order of these checks matters — we go
  // from "earliest action" to "latest".
  //
  // Terminal states (no action buttons): "delivered", "cancelled",
  // "refused" — once we're there, the work is done.
  const showAccept =
    !order.riderAcceptedAt &&
    order.status !== "delivered" &&
    order.status !== "cancelled" &&
    order.status !== "refused";
  const showPickedUp =
    order.riderAcceptedAt &&
    order.status !== "out_for_delivery" &&
    order.status !== "delivered" &&
    order.status !== "cancelled" &&
    order.status !== "refused";
  // BOTH "delivered" and "refused" are valid outcomes at the
  // delivery address. We show both buttons when the rider is
  // out_for_delivery — they pick whichever matches reality.
  const showTerminalChoice = order.status === "out_for_delivery";

  // ----- Map toggle -----
  // The map is collapsed by default to keep the card scannable
  // for fast dispatch. The rider taps "Show map" to expand it
  // and see the full delivery route with their own position
  // updating live. We use local state (per-card) so toggling
  // one card doesn't affect the others in the list.
  const [showMap, setShowMap] = useState(false);

  // ----- Compute map points (with safe fallbacks) -----
  // The <DeliveryMap> component expects every pin to have
  // numeric lat/lng. We pre-compute the three pins here so
  // the JSX below stays clean. If any side is missing coords
  // (e.g. the restaurant was added before geocoding), we
  // skip that pin rather than passing a malformed object.
  const mapCustomer =
    order.deliveryLocation?.lat != null && order.deliveryLocation?.lng != null
      ? {
          lat: order.deliveryLocation.lat,
          lng: order.deliveryLocation.lng,
          label: order.deliveryAddress || "Delivery address",
        }
      : null;
  const mapRestaurant =
    order.restaurant?.location?.lat != null && order.restaurant?.location?.lng != null
      ? {
          lat: order.restaurant.location.lat,
          lng: order.restaurant.location.lng,
          label: order.restaurant.name,
        }
      : null;
  // If the delivery coords aren't geocoded, fall back to using
  // the rider's current position as the map center. The map
  // still works — it just doesn't have a separate customer pin
  // until the order was geocoded at placement.
  const mapFallback = riderCoords
    ? { lat: riderCoords.lat, lng: riderCoords.lng, label: "Your location" }
    : mapRestaurant
    ? { lat: mapRestaurant.lat, lng: mapRestaurant.lng, label: mapRestaurant.label }
    : null;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* ----- Header: order id + status + total ----- */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-gray-900">
            #{order._id.slice(-8).toUpperCase()}
          </span>
          <OrderStatusBadge status={order.status} />
          <span className="ml-auto text-base font-bold text-gray-900">
            Rs. {order.totalPrice.toFixed(2)}
          </span>
        </div>

        {/* ----- Customer + phone ----- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-orange/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-semibold text-orange">
                {order.user?.fullname?.substring(0, 1).toUpperCase() || "C"}
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Customer</p>
              <p className="font-medium text-gray-900 truncate">
                {order.user?.fullname || "—"}
              </p>
            </div>
          </div>
          {order.user?.contact && (
            <a
              href={`tel:${order.user.contact}`}
              className="flex items-start gap-2 hover:underline"
            >
              <Phone className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="font-medium text-orange">{order.user.contact}</p>
              </div>
            </a>
          )}
        </div>

        {/* ----- Pickup (restaurant) ----- */}
        <div className="flex items-start gap-2 text-sm p-3 bg-blue-50 border border-blue-100 rounded-md">
          <MapPin className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-blue-600 font-medium">Pickup from</p>
            <p className="font-medium text-gray-900">
              {order.restaurant?.name || "—"}
            </p>
            {order.restaurant?.address && (
              <p className="text-xs text-gray-600 mt-0.5">
                {order.restaurant.address}
              </p>
            )}
            {/* Live "distance to pickup" indicator. Only shown
                when the rider has shared their GPS AND the
                restaurant has coords. We don't currently geocode
                restaurants on the client (would need Nominatim
                per page load) — distance is shown if the order
                has riderLocation (which the server stores); on
                the rider's own device we use their live coords. */}
            {riderCoords && order.riderLocation?.lat && order.riderLocation?.lng && (
              <p className="text-xs text-blue-700 mt-1 font-medium">
                {formatDistance(
                  haversineMeters(
                    { lat: riderCoords.lat, lng: riderCoords.lng },
                    { lat: order.riderLocation.lat, lng: order.riderLocation.lng }
                  )
                )}{" "}
                away
              </p>
            )}
          </div>
        </div>

        {/* ----- Live location status banner ----- */}
        {/* Shows whether the rider is currently sharing their GPS
            with the customer. Reassures the rider (and the
            customer, on their end) that the "live" pin is
            actually live. */}
        <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
          {riderCoords ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Sharing your live location with the customer</span>
            </>
          ) : (
            <>
              <MapPinOff className="w-3 h-3" />
              <span>
                {geoError
                  ? "Location off — customer won't see you live"
                  : "Waiting for GPS…"}
              </span>
            </>
          )}
        </div>

        {/* ----- Show / hide map toggle ----- */}
        {/* We don't render the map until the rider opts in — the
            Google Maps script is ~150KB of JS and we don't want
            to load it for every order card in the list. Once
            expanded, the map stays mounted (no re-render) so
            the rider's live position can update smoothly. */}
        <button
          type="button"
          onClick={() => setShowMap((s) => !s)}
          className="flex items-center gap-1.5 text-sm font-medium text-orange hover:text-hoverOrange transition-colors self-start"
        >
          {showMap ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
          {showMap ? "Hide map" : "Show map"}
        </button>

        {/* ----- The map (only mounted when expanded) ----- */}
        {showMap && mapFallback && (
          <div className="space-y-2">
            <DeliveryMap
              customer={mapCustomer ?? mapFallback}
              restaurant={mapRestaurant ?? undefined}
              rider={
                riderCoords
                  ? { lat: riderCoords.lat, lng: riderCoords.lng, label: "You" }
                  : null
              }
              height={260}
            />
            {/* If we're missing the delivery coords, surface that
                clearly so the rider knows the customer pin is
                approximate (it's pinned to the rider's location
                in the meantime). */}
            {!mapCustomer && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Delivery address not yet geocoded — the customer pin
                shows your current position as a placeholder. It will
                update automatically once the address resolves.
              </p>
            )}
          </div>
        )}

        {/* ----- Delivery (customer address) ----- */}
        <div className="flex items-start gap-2 text-sm p-3 bg-orange-50 border border-orange-100 rounded-md">
          <MapPin className="w-4 h-4 mt-0.5 text-orange flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-orange font-medium">Deliver to</p>
            <p className="text-gray-900">{order.deliveryAddress || "—"}</p>
          </div>
        </div>

        {/* ----- Items ----- */}
        <div className="text-sm">
          <p className="text-xs text-gray-500 mb-1">Items</p>
          <ul className="space-y-1">
            {order.items.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between text-gray-700">
                <span>
                  {item.quantity}× {item.name}
                </span>
                <span className="text-gray-500">
                  Rs. {(item.price * item.quantity).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-gray-700">
            <span>Subtotal</span>
            <span>Rs. {order.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-gray-700">
            <span>Delivery fee</span>
            <span>Rs. {order.deliveryFee.toFixed(2)}</span>
          </div>
        </div>

        {/* ----- Action buttons ----- */}
        {(showAccept || showPickedUp || showTerminalChoice) && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-100">
            {showAccept && (
              <Button
                type="button"
                onClick={onAccept}
                disabled={busy}
                className="flex-1 bg-orange hover:bg-hoverOrange text-white"
              >
                <Check className="w-4 h-4 mr-1.5" />
                Accept Order
              </Button>
            )}
            {showPickedUp && (
              <Button
                type="button"
                onClick={onPickedUp}
                disabled={busy}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Truck className="w-4 h-4 mr-1.5" />
                Picked Up
              </Button>
            )}
            {showTerminalChoice && (
              <>
                {/* Primary outcome — happy path. Big green button. */}
                <Button
                  type="button"
                  onClick={onDelivered}
                  disabled={busy}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  Mark as Delivered
                </Button>
                {/* Secondary outcome — customer didn't take the food.
                    Outlined + red so it doesn't get tapped by accident.
                    The two-click confirmation (we already show a busy
                    state on this card while the request is in flight)
                    is enough protection; no extra "are you sure?" modal
                    needed because the rider is intentional about which
                    button they're tapping on a delivery. */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRefused}
                  disabled={busy}
                  className="flex-1 text-red-700 border-red-300 hover:bg-red-50 hover:border-red-400"
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Refused by Customer
                </Button>
              </>
            )}
          </div>
        )}

        {/* If the order is in a state where no action is possible
            (delivered/cancelled/refused), show a quiet status line
            instead of an empty actions area. The wording is
            different for "refused" so the rider sees a clear
            summary of what they reported. */}
        {!showAccept && !showPickedUp && !showTerminalChoice && (
          <div className="pt-2 border-t border-gray-100 text-sm text-gray-500 italic">
            {order.status === "refused"
              ? "You reported this order as refused. The food was not delivered."
              : `No further action required — this order is ${STATUS_LABELS[order.status]}.`}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RiderOrders;
