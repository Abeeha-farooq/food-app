// seed.js
// ===============================
// Purpose: Populate the database with sample data so the app
//          has something to show during development.
//
// Usage:
//   npm run seed           → seed only if data is missing (idempotent)
//   npm run seed:reset     → wipe everything first, then seed (full reset)
//
// Why a separate file (not in server.js)?
//   You don't want to seed your production database by accident.
//   Keeping it separate means it only runs when YOU tell it to.
// ===============================

import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "./config/db.js";
import User from "./models/user.model.js";
import Restaurant from "./models/restaurant.model.js";
import MenuItem from "./models/menu.model.js";
import Order from "./models/order.model.js";

// ============================================================
// STEP 0: Parse CLI flags
// ============================================================
// process.argv is an array: ["node", "seed.js", "--reset", ...]
const RESET = process.argv.includes("--reset");

// ============================================================
// STEP 1: Define the sample data
// ============================================================
// Keeping data in a clear structure (vs scattered `await User.create()` calls)
// makes it easy to add more later and to see exactly what you're seeding.

const USERS = [
  {
    fullname: "Admin User",
    email: "admin@foodapp.com",
    password: "admin123",
    contact: "03000000001",
    role: "admin",
    isVerified: true,
  },
  {
    fullname: "Ahmad Khan",
    email: "owner@foodapp.com",
    password: "owner123",
    contact: "03000000002",
    role: "restaurant_owner",
    isVerified: true,
  },
  {
    fullname: "Test Customer",
    email: "customer@foodapp.com",
    password: "customer123",
    contact: "03000000003",
    role: "user",
    isVerified: true,
  },
  {
    fullname: "Sara Ahmed",
    email: "sara@foodapp.com",
    password: "sara123",
    contact: "03000000004",
    role: "user",
    isVerified: true,
  },
  {
    fullname: "Ali Raza",
    email: "ali@foodapp.com",
    password: "ali123",
    contact: "03000000005",
    role: "user",
    isVerified: true,
  },
];

const RESTAURANTS = [
  {
    name: "Pizza Palace",
    city: "Lahore",
    country: "Pakistan",
    cuisines: ["Pizza", "Italian"],
    imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800",
    priceRange: "medium",
    estimatedDeliveryTime: 30,
    menu: [
      { name: "Margherita Pizza", description: "Classic tomato + mozzarella", price: 1200, imageUrl: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400", category: "Pizza" },
      { name: "Pepperoni Pizza", description: "Spicy pepperoni + cheese", price: 1500, imageUrl: "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400", category: "Pizza" },
    ],
  },
  {
    name: "Burger Hub",
    city: "Karachi",
    country: "Pakistan",
    cuisines: ["Burger", "American"],
    imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800",
    priceRange: "low",
    estimatedDeliveryTime: 25,
    menu: [
      { name: "Classic Cheeseburger", description: "Beef patty + cheese + lettuce", price: 600, imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400", category: "Burger" },
    ],
  },
  {
    name: "Dragon Wok",
    city: "Islamabad",
    country: "Pakistan",
    cuisines: ["Chinese", "Asian"],
    imageUrl: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800",
    priceRange: "medium",
    estimatedDeliveryTime: 35,
    menu: [
      { name: "Chicken Fried Rice", description: "Wok-fried rice + chicken", price: 750, imageUrl: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400", category: "Starter" },
    ],
  },
  {
    name: "Sweet Tooth Desserts",
    city: "Lahore",
    country: "Pakistan",
    cuisines: ["Dessert", "Bakery"],
    imageUrl: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800",
    priceRange: "high",
    estimatedDeliveryTime: 40,
    menu: [
      { name: "Chocolate Lava Cake", description: "Warm chocolate + vanilla ice cream", price: 850, imageUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400", category: "Dessert" },
    ],
  },
  {
    name: "Desi Dhaba",
    city: "Lahore",
    country: "Pakistan",
    cuisines: ["Desi", "Pakistani"],
    imageUrl: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=800",
    priceRange: "low",
    estimatedDeliveryTime: 30,
    menu: [
      { name: "Chicken Karahi", description: "Spicy tomato-based chicken curry", price: 1100, imageUrl: "https://images.unsplash.com/photo-1604908554049-29db8c0e2e2e?w=400", category: "Starter" },
    ],
  },
];

// ============================================================
// STEP 2: Run the seed
// ============================================================
const run = async () => {
  await connectDB();

  if (RESET) {
    console.log("🗑️  RESET flag set — wiping all collections first");
    await Promise.all([
      User.deleteMany({}),
      Restaurant.deleteMany({}),
      MenuItem.deleteMany({}),
      Order.deleteMany({}),
    ]);
  }

  // ----- Seed users (idempotent on email) -----
  console.log("👤 Seeding users...");
  for (const u of USERS) {
    // We pre-hash the password so the pre-save hook doesn't double-hash
    // (findOneAndUpdate bypasses hooks, so we need the hash ready).
    const hash = await bcrypt.hash(u.password, 10);
    await User.findOneAndUpdate(
      { email: u.email },
      { ...u, password: hash },
      { upsert: true, new: true }
    );
  }
  const userCount = await User.countDocuments();
  console.log(`   → ${userCount} user(s) in DB`);

  // ----- Seed restaurants + menu items (idempotent on name) -----
  console.log("🍕 Seeding restaurants + menu items...");
  const adminUser = await User.findOne({ role: "admin" });
  for (const r of RESTAURANTS) {
    const { menu, ...restData } = r;
    const restaurant = await Restaurant.findOneAndUpdate(
      { name: restData.name },
      { ...restData, owner: adminUser?._id },
      { upsert: true, new: true }
    );
    // Wipe + recreate menu items for this restaurant
    await MenuItem.deleteMany({ restaurant: restaurant._id });
    for (const item of menu) {
      await MenuItem.create({ ...item, restaurant: restaurant._id });
    }
  }
  const restaurantCount = await Restaurant.countDocuments();
  const menuCount = await MenuItem.countDocuments();
  console.log(`   → ${restaurantCount} restaurant(s), ${menuCount} menu item(s)`);

  console.log("\n✅ Seed complete.\n");
  console.log("Try logging in as:");
  console.log("  admin@foodapp.com     / admin123     (admin)");
  console.log("  owner@foodapp.com     / owner123     (restaurant_owner)");
  console.log("  customer@foodapp.com  / customer123  (user)");
  console.log("  sara@foodapp.com      / sara123      (user)");
  console.log("  ali@foodapp.com       / ali123       (user)\n");

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
