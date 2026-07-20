// src/main.tsx
// ===============================
// Purpose: The app's entry point. Mounts React to the DOM.
// ===============================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { ThemeProvider } from './components/ThemeProvider'
import { Toaster } from 'sonner'

// Provider order matters: outer providers wrap inner ones.
//   AuthProvider   → user/login state
//   CartProvider   → cart state
//   ThemeProvider  → light/dark/system theme
//   App            → the actual app
//   Toaster        → toast UI
//
// (Stripe <Elements> provider used to wrap App here. It was removed
// when the Stripe card / digital-wallet payment options were dropped
// from the checkout page — Safepay now covers the "pay online by
// card" use case and uses its own hosted checkout iframe, not our
// app's payment UI.)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CartProvider>
        <ThemeProvider>
          <App />
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </CartProvider>
    </AuthProvider>
  </StrictMode>,
)
