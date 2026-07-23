// models/restaurant.model.js
// ===============================
// Purpose: Define a Restaurant document.
// ===============================

import mongoose from "mongoose";

const restaurantSchema = new mongoose.Schema(
  {
    // Basic info
    name: {
      type: String,
      required: [true, "Restaurant name is required"],
      trim: true,
      maxlength: 100,
    },

    // Cuisine types — array lets a restaurant serve multiple (e.g. ["Pizza", "Italian"])
    cuisines: {
      type: [String],
      required: true,
      default: [],
    },

    // Location
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    address: { type: String, default: "" },

    // ----- Geocoded coordinates (for distance / map features) -----
    // `address` is the human-readable string; `location` is the
    // machine-readable lat/lng pair that lets us compute distance
    // to the customer's delivery address (used by the rider
    // earnings system) and place the restaurant pin on the map.
    //
    // Both fields are nullable: geocoding happens lazily via
    // a one-off script (scripts/geocode-restaurants.js) or when
    // an admin saves a restaurant without a location. The
    // earnings system falls back to a flat fee when the location
    // is missing, so the feature works end-to-end even before
    // every restaurant has been geocoded.
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      // When the coordinates were last populated. Used by the
      // geocoding script to know which rows still need work.
      geocodedAt: { type: Date, default: null },
    },

    // Visuals
    imageUrl: { type: String, default: "" },

    // Price range tag for filtering (low / medium / high)
    priceRange: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    // Average delivery time in minutes (for the UI)
    estimatedDeliveryTime: { type: Number, default: 30 },

    // Owner of this restaurant (links to a User document).
    // A "restaurant_owner" user can have multiple restaurants if we want.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Helpful for searching/filtering in MongoDB
restaurantSchema.index({ name: "text", city: "text", country: "text" });

const Restaurant = mongoose.model("Restaurant", restaurantSchema);
export default Restaurant;