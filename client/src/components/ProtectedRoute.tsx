// src/components/ProtectedRoute.tsx
// ===============================
// Purpose: Wrap any route that requires login.
//
// Usage in App.tsx:
//   <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
// ===============================

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: Props) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // While we're checking "is the user logged in?", show a simple loading state.
  // Without this, the page would briefly flash "login required" then show content.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // Not logged in? Send them to /login.
  // `state={{ from: location }}` lets Login know where to send them back after success.
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Logged in — render the protected page.
  return <>{children}</>;
};

export default ProtectedRoute;
