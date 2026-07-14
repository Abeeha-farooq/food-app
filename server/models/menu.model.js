// models/menu.model.js
// ===============================
// Purpose: A single menu item that belongs to a Restaurant.
//          e.g. "Margherita Pizza" -> price 12.99, category "Pizza"
// ===============================

import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Menu item name is required"],
      trim: true,
      maxlength: 80,
    },

    description: {
      type: String,
      default: "",
      maxlength: 300,
    },

    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },

    imageUrl: { type: String, default: "" },

    // Category: "Pizza", "Burger", "Drinks", "Dessert", etc.
    category: {
      type: String,
      required: true,
      trim: true,
    },

    // Tags for filtering/searching (e.g. ["spicy", "vegetarian", "bestseller"])
    tags: { type: [String], default: [] },

    // Availability toggle (out of stock? flip this to false)
    available: {
      type: Boolean,
      default: true,
    },

    // Link back to the parent restaurant
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
  },
  { timestamps: true }
);

// When we fetch menu items for a restaurant, we usually want them sorted by category
menuItemSchema.index({ restaurant: 1, category: 1 });

const MenuItem = mongoose.model("MenuItem", menuItemSchema);
export default MenuItem;
