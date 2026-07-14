// routes/restaurant.route.js
import express from "express";
import {
  getRestaurants,
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
