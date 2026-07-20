// routes/restaurant.route.js
import express from "express";
import {
  getRestaurants,
  suggestRestaurants,
  getRestaurantById,
  getRestaurantMenu,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/restaurant.controller.js";
import { verifyJWT, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// ---- PUBLIC ----
router.get("/", getRestaurants);
// IMPORTANT: /suggest is mounted BEFORE /:id so "suggest" isn't
// matched as an ObjectId parameter. Express matches in declaration
// order, and a literal-segment path always wins over a parameter.
router.get("/suggest", suggestRestaurants);
router.get("/:id", getRestaurantById);
router.get("/:id/menu", getRestaurantMenu);

// ---- ADMIN (need to be logged in AND be an admin) ----
router.post("/", verifyJWT, requireRole("admin"), createRestaurant);
router.put("/:id", verifyJWT, requireRole("admin"), updateRestaurant);
router.delete("/:id", verifyJWT, requireRole("admin"), deleteRestaurant);

// Menu items nested under a restaurant
router.post("/:id/menu", verifyJWT, requireRole("admin"), createMenuItem);
router.put("/:id/menu/:itemId", verifyJWT, requireRole("admin"), updateMenuItem);
router.delete("/:id/menu/:itemId", verifyJWT, requireRole("admin"), deleteMenuItem);

export default router;
