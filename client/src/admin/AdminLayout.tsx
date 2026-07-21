// src/admin/AdminLayout.tsx
// ===============================
// Purpose: The shared layout for all admin pages.
//          - Left sidebar with navigation links
//          - Top bar with mobile menu trigger
//          - Main content area that renders the current child route via <Outlet />
//
// Usage in App.tsx:
//   <Route path="/admin" element={<AdminLayout />}>
//     <Route index element={<Dashboard />} />
//     <Route path="orders" element={<OrdersPage />} />
//     ...
//   </Route>
// ===============================

import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingBag,
  Store,
  Utensils,
  Menu as MenuIcon,
  X,
  LogOut,
  ChevronRight,
  Users,
  Tag,
  Bike,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/useAuth";

// ============================================================
// SIDEBAR LINKS — single source of truth
// ============================================================
// To add/remove sidebar items, edit this array. The same array powers
// both the desktop sidebar and the mobile drawer.
const sidebarLinks = [
  { label: "Dashboard",  to: "/admin",          icon: LayoutDashboard, end: true },
  { label: "Orders",     to: "/admin/orders",   icon: ShoppingBag },
  { label: "Restaurants", to: "/admin/restaurant", icon: Store },
  { label: "Menu Items", to: "/admin/menu",     icon: Utensils },
  { label: "Riders",     to: "/admin/riders",   icon: Bike },
  { label: "Users",      to: "/admin/users",    icon: Users },
  { label: "Coupons",    to: "/admin/coupons",  icon: Tag },
];

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ==================== MOBILE TOP BAR (only on small screens) ==================== */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 z-30 flex items-center px-4 justify-between">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 hover:bg-gray-100 rounded"
          aria-label="Open menu"
        >
          <MenuIcon className="w-6 h-6" />
        </button>
        <span className="font-bold text-gray-700">FlavorCourt Admin</span>
        <div className="w-9" /> {/* spacer for centering */}
      </header>

      {/* ==================== MOBILE SIDEBAR DRAWER ==================== */}
      {/* A dark backdrop that closes the menu when clicked */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* The actual sidebar — slides in from the left on mobile, fixed on desktop */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50
          transform transition-transform duration-200 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0   /* on desktop, always visible */
        `}
      >
        {/* Sidebar header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-gray-200">
          <Link to="/" className="text-xl font-extrabold text-gray-700">
            FlavorCourt
          </Link>
          {/* Mobile-only close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-2 hover:bg-gray-100 rounded"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar nav */}
        <nav className="p-4 space-y-1">
          {sidebarLinks.map((link) => (
            <SidebarLink
              key={link.to}
              to={link.to}
              icon={<link.icon className="w-5 h-5" />}
              label={link.label}
              end={link.end}
              onNavigate={() => setMobileOpen(false)}  // close drawer on mobile
            />
          ))}
        </nav>

        {/* Sidebar footer: user info + logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm">
              {user?.fullname ? user.fullname.substring(0, 2).toUpperCase() : "AD"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.fullname || "Admin"}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            onClick={handleLogout}
            disabled={loggingOut}
            variant="outline"
            className="w-full"
            size="sm"
          >
            <LogOut className="w-4 h-4 mr-1" />
            {loggingOut ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </aside>

      {/* ==================== MAIN CONTENT AREA ==================== */}
      {/* On mobile: pt-14 (top bar height) so content isn't hidden under it.
          On desktop: md:ml-64 (sidebar width) so content shifts right of the sidebar. */}
      <main className="pt-14 md:pt-0 md:ml-64 min-h-screen">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

// ============================================================
// SIDEBAR LINK — uses NavLink for automatic active highlighting
// ============================================================
// We render the icon as a prop (ReactNode) instead of importing
// lucide-react here — keeps the import list small and makes the
// icon easy to swap from the parent.
const SidebarLink = ({
  to,
  icon,
  label,
  end,
  onNavigate,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  onNavigate?: () => void;
}) => {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      // className as a function gets { isActive } — perfect for active styles
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? "bg-orange text-white shadow-sm"
            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
        }`
      }
    >
      {/* children as a function also gets { isActive } — we use it for the chevron */}
      {({ isActive }) => (
        <>
          {icon}
          <span className="flex-1">{label}</span>
          {isActive && <ChevronRight className="w-4 h-4" />}
        </>
      )}
    </NavLink>
  );
};