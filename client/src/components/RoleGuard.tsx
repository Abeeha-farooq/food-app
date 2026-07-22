// src/components/RoleGuard.tsx
// ===============================
// Purpose: Block pages that need a specific user role.
//          Different from ProtectedRoute (which only checks "logged in").
//
// Usage:
//   <Route path="/admin/orders" element={
//     <ProtectedRoute>
//       <RoleGuard allow={["admin"]}>
//         <OrdersPage />
//       </RoleGuard>
//     </ProtectedRoute>
//   } />
// ===============================

import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import type { ReactNode } from "react";

interface Props {
  // Roles that are allowed to see the wrapped content
  // E.g. allow={["admin"]}  → only admins
  //      allow={["admin", "restaurant_owner"]}  → admins OR owners
  //      allow={["rider"]}  → only riders (for the /rider dashboard)
  allow: ("user" | "admin" | "restaurant_owner" | "rider")[];
  children: ReactNode;
}

const RoleGuard = ({ allow, children }: Props) => {
  const { user } = useAuth();

  // If we somehow get here without a user, send to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If the user's role isn't in the allowed list, show a "forbidden" page
  if (!allow.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <h1 className="text-3xl font-bold text-red-600 mb-2">403 — Forbidden</h1>
        <p className="text-gray-600">
          You don't have permission to view this page.
        </p>
        <p className="text-sm text-gray-400 mt-2">
          Required role: {allow.join(" or ")}. Your role: {user.role}.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGuard;