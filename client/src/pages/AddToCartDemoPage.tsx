// src/pages/AddToCartDemoPage.tsx
// ===============================
// Demo page that adds a few sample items to the cart.
// Helpful for testing the CartPage without a full restaurant flow.
// In a real app, "Add to cart" buttons would live on a restaurant detail page.
// ===============================

import { useCart } from "@/context/useCart";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

// A small curated list of items from our seeded restaurants
const SAMPLE_ITEMS = [
  {
    menuItemId: "sample-pizza-margherita",
    restaurantId: "pizza-palace",
    restaurantName: "Pizza Palace",
    name: "Margherita Pizza",
    price: 12.99,
    imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600",
  },
  {
    menuItemId: "sample-pizza-pepperoni",
    restaurantId: "pizza-palace",
    restaurantName: "Pizza Palace",
    name: "Pepperoni Pizza",
    price: 14.99,
    imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600",
  },
  {
    menuItemId: "sample-burger-classic",
    restaurantId: "burger-hub",
    restaurantName: "Burger Hub",
    name: "Classic Cheeseburger",
    price: 8.99,
    imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600",
  },
  {
    menuItemId: "sample-biryani",
    restaurantId: "desi-dhaba",
    restaurantName: "Desi Dhaba",
    name: "Chicken Biryani",
    price: 9.99,
    imageUrl: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600",
  },
  {
    menuItemId: "sample-dessert-lava",
    restaurantId: "sweet-tooth",
    restaurantName: "Sweet Tooth Desserts",
    name: "Chocolate Lava Cake",
    price: 6.99,
    imageUrl: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600",
  },
  {
    menuItemId: "sample-drink-lassi",
    restaurantId: "desi-dhaba",
    restaurantName: "Desi Dhaba",
    name: "Lassi",
    price: 3.00,
    imageUrl: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600",
  },
];

const AddToCartDemoPage = () => {
  const { addItem, items, clearCart } = useCart();
  // Track which items have been added (for the green checkmark)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleAdd = (item: typeof SAMPLE_ITEMS[number]) => {
    addItem(item, 1);
    setAddedIds((prev) => new Set(prev).add(item.menuItemId));
    // Revert the checkmark after 1.5s
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.menuItemId);
        return next;
      });
    }, 1500);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Add to Cart (Demo)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Click any item to add it to your cart. Useful for testing the cart flow.
        </p>
      </div>

      <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-md p-3 text-sm">
        <span className="text-orange-900">
          🛒 {items.length} item{items.length === 1 ? "" : "s"} in cart
        </span>
        <div className="flex gap-2">
          <Link to="/cart">
            <Button size="sm" className="bg-orange hover:bg-hoverOrange">
              Go to cart
            </Button>
          </Link>
          {items.length > 0 && (
            <Button size="sm" variant="outline" onClick={clearCart}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SAMPLE_ITEMS.map((item) => {
          const added = addedIds.has(item.menuItemId);
          return (
            <Card key={item.menuItemId} className="overflow-hidden">
              <div className="aspect-video bg-gray-100">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                )}
              </div>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">{item.restaurantName}</p>
                <h3 className="font-semibold text-gray-900">{item.name}</h3>
                <p className="text-sm text-gray-700 my-2">Rs. {item.price.toFixed(2)}</p>
                <Button
                  onClick={() => handleAdd(item)}
                  className="w-full bg-orange hover:bg-hoverOrange"
                  size="sm"
                >
                  {added ? (
                    <>
                      <Check className="w-4 h-4 mr-1" /> Added
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-1" /> Add to cart
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AddToCartDemoPage;