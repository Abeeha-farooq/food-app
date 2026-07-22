// src/lib/useGeolocation.ts
// ===============================
// Purpose: Browser-side hook that returns the current GPS
//          position via navigator.geolocation.watchPosition().
//
//          Used by the rider dashboard to:
//            1. Get the rider's current location on mount
//            2. Keep watching for changes (so walking around
//               keeps the map fresh)
//            3. Surface errors (permission denied, no GPS,
//               timeout) so the UI can show a "Location
//               unavailable" message instead of silently
//               failing.
//
//          Returns:
//            coords   — { lat, lng, accuracy } | null
//            error    — string | null
//            loading  — true while we're waiting for the first fix
//            source   — "live" | "cached" | "none"
// ===============================

import { useEffect, useState } from "react";

interface Coords {
  lat: number;
  lng: number;
  /** GPS accuracy in meters (lower = more accurate). */
  accuracy: number;
}

interface GeolocationState {
  coords: Coords | null;
  error: string | null;
  loading: boolean;
  source: "live" | "cached" | "none";
}

const initialState: GeolocationState = {
  coords: null,
  error: null,
  loading: true,
  source: "none",
};

const useGeolocation = (enabled = true): GeolocationState => {
  const [state, setState] = useState<GeolocationState>(initialState);

  useEffect(() => {
    // If the hook is disabled (e.g. rider isn't on a delivery),
    // don't even try to get GPS. Reset to a clean "off" state.
    if (!enabled) {
      setState({ coords: null, error: null, loading: false, source: "none" });
      return;
    }

    // Browser support check. Older browsers and some embedded
    // webviews don't have geolocation.
    if (!("geolocation" in navigator)) {
      setState({
        coords: null,
        error: "Your browser doesn't support location services",
        loading: false,
        source: "none",
      });
      return;
    }

    let watchId: number | null = null;

    const onSuccess = (pos: GeolocationPosition) => {
      setState({
        coords: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        },
        error: null,
        loading: false,
        source: "live",
      });
    };

    const onError = (err: GeolocationPositionError) => {
      // Map the standard error codes to user-friendly strings.
      //   1 = PERMISSION_DENIED  → user clicked "block"
      //   2 = POSITION_UNAVAILABLE → GPS off / no signal
      //   3 = TIMEOUT → took too long to get a fix
      let message: string;
      switch (err.code) {
        case err.PERMISSION_DENIED:
          message = "Location permission denied. Enable it in your browser to share your position with customers.";
          break;
        case err.POSITION_UNAVAILABLE:
          message = "Location unavailable. Check that GPS is enabled.";
          break;
        case err.TIMEOUT:
          message = "Location request timed out. Retrying…";
          break;
        default:
          message = "Failed to get your location.";
      }
      setState({
        coords: null,
        error: message,
        loading: false,
        source: "none",
      });
    };

    // Start watching. Options:
    //   enableHighAccuracy: true  → use GPS, not just WiFi/IP-based
    //   maximumAge: 10s          → accept a cached fix up to 10s old
    //                             (faster first paint)
    //   timeout: 30s             → give up if no fix in 30s
    watchId = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 30_000,
      }
    );

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [enabled]);

  return state;
};

export default useGeolocation;
