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
      { path: "dashboard",  element: <Dashboard /> },
      { path: "orders",     element: <OrdersPage /> },
      { path: "restaurant", element: <RestaurantManagement /> },
      { path: "menu",       element: <MenuManagement /> },
      { path: "users",      element: <UserManagement /> },
    ],
  },
])

const App = () => {
  return (
    <RouterProvider router={appRouter} />
  )
}

export default App
