// src/main.tsx
// ===============================
// Purpose: The app's entry point. Mounts React to the DOM.
// ===============================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { ThemeProvider } from './components/ThemeProvider'
import { Toaster } from 'sonner'

// ============================================================
// STRIPE — load Stripe.js ONCE at app startup
// ============================================================
// loadStripe() returns a Promise<Stripe | null>. We use .then() to
// capture the resolved Stripe object and pass it to <Elements>.
//
// Why singleton:
//   Stripe.js is large (~80KB gzipped). Loading it once and reusing
//   the Stripe instance across the app is much faster than loading
//   on every page that needs a card form.
//
// Publishable key (pk_test_... or pk_live_...) is SAFE to expose in
// the browser — Stripe designed it that way. The SECRET key
// (sk_...) lives only on the server (server/.env).
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

// Provider order matters: outer providers wrap inner ones.
//   AuthProvider   → user/login state
//   CartProvider   → cart state
//   ThemeProvider  → light/dark/system theme
//   Elements       → Stripe context (provides Stripe instance + clientSecret to all Stripe components)
//   App            → the actual app
//   Toaster        → toast UI
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CartProvider>
        <ThemeProvider>
          {/* If Stripe isn't configured (no publishable key), we still
              render the app but without the Elements provider. The
              CheckoutPage will show a "Stripe not configured" banner
              in that case. */}
          {stripePromise ? (
            <Elements stripe={stripePromise}>
              <App />
            </Elements>
          ) : (
            <App />
          )}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </CartProvider>
    </AuthProvider>
  </StrictMode>,
)
