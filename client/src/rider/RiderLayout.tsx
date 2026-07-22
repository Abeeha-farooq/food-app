// src/rider/RiderLayout.tsx
// ===============================
// Purpose: The shared layout for all rider pages.
//          - Left sidebar with navigation links (Dashboard, My Deliveries)
//          - Top bar with mobile menu trigger
//          - Main content area that renders the current child route via <Outlet />
//
// Pattern is the same as AdminLayout (just a smaller sidebar — only 2
// sections) so the rider gets a focused, delivery-centric view.
//
// Usage in App.tsx:
//   <Route path="/rider" element={<RiderLayout />}>
//     <Route index element={<RiderDashboard />} />
//     <Route path="orders" element={<RiderOrders />} />
//   </Route>
// ===============================

import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Bike,
  Menu as MenuIcon,
  X,
  LogOut,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/useAuth";

// ============================================================
// SIDEBAR LINKS — single source of truth
// ============================================================
const sidebarLinks = [
  { label: "Dashboard",      to: "/rider",        icon: LayoutDashboard, end: true },
  { label: "My Deliveries",  to: "/rider/orders", icon: ShoppingBag },
];

const RiderLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setMobileOpen(false);
    navigate("/");
  };

  // Shared link renderer — used by both the desktop sidebar and the
  // mobile drawer so the active-state styling is identical.
  const renderLink = (link: typeof sidebarLinks[number], onClick?: () => void) => (
    <NavLink
      key={link.to}
      to={link.to}
      end={link.end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-orange text-white"
            : "text-gray-700 hover:bg-gray-100"
        }`
      }
    >
      <link.icon className="w-4 h-4" />
      <span>{link.label}</span>
    </NavLink>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col xl:flex-row bg-gray-50">
      {/* ============ MOBILE TOP BAR (visible < xl) ============ */}
      <div className="xl:hidden flex items-center justify-between p-4 bg-white border-b sticky top-16 z-30">
        <div className="flex items-center gap-2">
          <Bike className="w-5 h-5 text-orange" />
          <span className="font-bold text-gray-900">Rider Mode</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <MenuIcon className="w-6 h-6" />
        </Button>
      </div>

      {/* ============ DESKTOP SIDEBAR (visible ≥ xl) ============ */}
      <aside className="hidden xl:flex w-72 2xl:w-80 bg-white border-r flex-col">
        <div className="p-5 border-b">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-orange/10 flex items-center justify-center">
              <Bike className="w-5 h-5 text-orange" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Rider Mode</h1>
              <p className="text-xs text-gray-500">Delivery dashboard</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {sidebarLinks.map((link) => renderLink(link))}
        </nav>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-9 h-9 rounded-full bg-orange/10 flex items-center justify-center text-orange font-semibold text-sm">
              {user?.fullname?.substring(0, 2).toUpperCase() || "R"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.fullname || "Rider"}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleLogout}
            className="w-full justify-center"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* ============ MOBILE DRAWER (slides in from the right) ============ */}
      {mobileOpen && (
        <div className="xl:hidden fixed inset-0 z-[60] flex">
          <div
            className="absolute inset-0 bg-black/50 animate-in fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative ml-auto w-full max-w-sm bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-right">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Bike className="w-5 h-5 text-orange" />
                <span className="font-bold">Rider Mode</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <nav className="flex-1 p-4 space-y-1">
              {sidebarLinks.map((link) => renderLink(link, () => setMobileOpen(false)))}
            </nav>

            <div className="p-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handleLogout}
                className="w-full"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MAIN CONTENT ============ */}
      <main className="flex-1 min-w-0 p-4 md:p-6 xl:p-8 max-w-full overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
};

export default RiderLayout;
