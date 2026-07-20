// src/App.tsx
// ===============================
// Purpose: The app's router. Defines which URL shows which page.
// ===============================

import './App.css'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

// Auth pages
import Login from './auth/Login'
import Signup from './auth/Signup'
import ForgotPassword from './auth/ForgotPassword'
import ResetPassword from './auth/ResetPassword'
import VerifyEmail from './auth/VerifyEmail'

// Main pages
import HereSection from './components/HereSection'
import MainLayout from './layout/MainLayout'
import Profile from './components/Profile'
import SearchPage from './components/SearchPage'
import ProtectedRoute from './components/ProtectedRoute'
import RoleGuard from './components/RoleGuard'

// User pages
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import UserOrdersPage from './pages/UserOrdersPage'
import RestaurantDetailPage from './pages/RestaurantDetailPage'
import AddToCartDemoPage from './pages/AddToCartDemoPage'

// Admin pages
import AdminLayout from './admin/AdminLayout'
import Dashboard from './admin/Dashboard'
import OrdersPage from './admin/OrdersPage'
import RestaurantManagement from './admin/RestaurantManagement'
import MenuManagement from './admin/MenuManagement'
import UserManagement from './admin/UserManagement'
import CouponManagement from './admin/CouponManagement'

// Global modals — mounted at the top of the router tree so
// they can pop up from any page (e.g. the CartConflictModal
// fires from any "Add to cart" button across the app).
import { CartConflictModal } from './components/ui/CartConflictModal'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import PaymentFailurePage from './pages/PaymentFailurePage'

const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { path: "/",            element: <HereSection /> },
      { path: "/profile",     element: <ProtectedRoute><Profile /></ProtectedRoute> },
      { path: "/search/:text", element: <SearchPage /> },
      { path: "/filterPage",  element: <SearchPage /> },
      { path: "/restaurant/:id", element: <RestaurantDetailPage /> },
      { path: "/order/status", element: <ProtectedRoute><UserOrdersPage /></ProtectedRoute> },
      { path: "/cart",        element: <ProtectedRoute><CartPage /></ProtectedRoute> },
      { path: "/checkout",    element: <ProtectedRoute><CheckoutPage /></ProtectedRoute> },
      { path: "/demo/add",    element: <ProtectedRoute><AddToCartDemoPage /></ProtectedRoute> },
    ],
  },
  { path: "/login",           element: <Login /> },
  { path: "/signup",          element: <Signup /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password",  element: <ResetPassword /> },
  { path: "/verify-email",    element: <VerifyEmail /> },
  // ============================================================
  // PAYMENT REDIRECT TARGETS
  // ============================================================
  // The RapidPAY / Rapid Gateway hosted checkout redirects the
  // customer back to one of these URLs after payment. Both are
  // PUBLIC (no auth required) — the gateway itself is the
  // authenticator (it knows which basket/order it was processing).
  // The basketId query param is the order ID we sent to the
  // gateway, so we can link the customer to their specific order.
  { path: "/payment/safepay/success", element: <PaymentSuccessPage /> },
  { path: "/payment/safepay/failure", element: <PaymentFailurePage /> },
  // ============================================================
  // ADMIN ROUTES — all nested under <AdminLayout> for the shared
  // sidebar + top bar. RoleGuard ensures only admins can reach them.
  // ============================================================
  {
    path: "/admin",
    element: (
      <ProtectedRoute>
        <RoleGuard allow={["admin"]}>
          <AdminLayout />
        </RoleGuard>
      </ProtectedRoute>
    ),
    children: [
      // `index: true` makes /admin render the Dashboard component.
      // Without this, the parent route matches but the <Outlet />
      // inside AdminLayout has no child route to render → blank
      // white screen. The "dashboard" sub-route is kept for
      // /admin/dashboard too, in case any other code (or a
      // browser-refresh from an old tab) lands there.
      { index: true,        element: <Dashboard /> },
      { path: "dashboard",  element: <Dashboard /> },
      { path: "orders",     element: <OrdersPage /> },
      { path: "restaurant", element: <RestaurantManagement /> },
      { path: "menu",       element: <MenuManagement /> },
      { path: "users",      element: <UserManagement /> },
      { path: "coupons",    element: <CouponManagement /> },
    ],
  },
])

const App = () => {
  return (
    <>
      <RouterProvider router={appRouter} />
      {/* Global modals — render alongside the router so they're
          available on every route. They read state from their
          own contexts and return null when nothing to show, so
          there's no visual cost when the user isn't triggering
          them. */}
      <CartConflictModal />
    </>
  )
}

export default App
