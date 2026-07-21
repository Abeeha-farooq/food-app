// src/auth/Login.tsx
// ===============================
// Purpose: Login form. Wires the existing UI to /api/auth/login.
//
// Special UX: when the backend returns 403 (email not verified), we
// show a dedicated panel with two CTAs:
//   - "Verify your email" → navigates to /verify-email (the existing
//     signup-time OTP page) with the email pre-filled
//   - "Resend the code"  → calls /api/auth/resend-verification to send
//     a fresh OTP, in case the original email was lost or expired
// ===============================

import { Input } from "@/components/ui/input";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Loader2,
  LockKeyhole,
  Mail,
  ShieldAlert,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { userLoginSchema, type LoginInputState } from "@/schema/userSchema";
import { useAuth } from "@/context/useAuth";
import api, { getErrorMessage } from "@/lib/api";
import { ForgotPasswordFlow } from "./ForgotPasswordFlow";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // The page where the user was trying to go (ProtectedRoute stored it
  // in location.state.from). After successful login, we send them back.
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const [input, setInput] = useState<LoginInputState>({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  // ----- Forgot password flow toggle -----
  // When true, the login form is replaced with the 3-step forgot
  // password flow (see ForgotPasswordFlow.tsx). The user can click
  // "Back to login" at any step to return to the regular form.
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);

  // Special state for the "email not verified" UX
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);

  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent) => {
    e.preventDefault();

    // Validate with zod before sending
    const result = userLoginSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues;
      toast.error(errors[0]?.message || "Invalid input");
      return;
    }

    setLoading(true);
    try {
      const loggedInUser = await login(result.data.email, result.data.password);
      toast.success("Logged in");

      // Role-based redirect. Riders and admins get sent to their
      // own dashboards; regular users get the page they were
      // trying to reach (or the home page). This prevents the
      // bug where a rider logs in and lands on a regular user
      // page like /profile or /cart just because that was the
      // "from" location.
      if (loggedInUser.role === "admin") {
        navigate("/admin", { replace: true });
      } else if (loggedInUser.role === "rider") {
        navigate("/rider", { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      // AxiosError with 403 + the "verify your email" message → special UX
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
      if (
        axiosErr.response?.status === 403 &&
        axiosErr.response.data?.message?.toLowerCase().includes("verify")
      ) {
        setNeedsVerification(true);
      } else {
        toast.error(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  // Resend the OTP — same security model as forgot-password: always
  // returns success even if the email doesn't exist, to avoid
  // leaking which emails are registered.
  const handleResend = async () => {
    setResending(true);
    try {
      await api.post("/auth/resend-verification", { email: input.email });
      toast.success("A new verification code has been sent");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen w-screen min-h-screen">
      <div className="flex flex-col gap-5 md:p-8 w-full max-w-md rounded-lg mx-4">
        {/* ----- Brand mark (always visible) ----- */}
        <div className="text-center">
          <h1 className="font-extrabold text-2xl mb-2">
            {forgotPasswordMode ? "Reset your password" : "Welcome back"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {forgotPasswordMode
              ? "We'll help you get back in"
              : "Log in to your FlavorCourt account"}
          </p>
        </div>

        {/* ----- Forgot password flow (3-step inline) ----- */}
        {forgotPasswordMode ? (
          <ForgotPasswordFlow
            // Prefill the email from the login form so the user doesn't
            // have to retype it.
            initialEmail={input.email}
            onBackToLogin={() => setForgotPasswordMode(false)}
          />
        ) : !needsVerification ? (
          /* ----- Normal login form ----- */
          <form onSubmit={submitHandler} className="flex flex-col gap-4">
            <div className="relative w-full">
              <Input
                type="email"
                name="email"
                value={input.email}
                onChange={changeEventHandler}
                placeholder="Enter your email"
                className="pl-10"
                autoComplete="email"
              />
              <Mail className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
            </div>
            <div className="relative w-full">
              <Input
                type="password"
                name="password"
                value={input.password}
                onChange={changeEventHandler}
                placeholder="Enter your password"
                className="pl-10"
                autoComplete="current-password"
              />
              <LockKeyhole className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
            </div>

            <div className="text-right -mt-2">
              <button
                type="button"
                onClick={() => setForgotPasswordMode(true)}
                className="text-sm text-orange-500 hover:text-orange-600 font-medium"
              >
                Forgot password?
              </button>
            </div>

            {loading ? (
              <button
                disabled
                type="button"
                className="bg-orange hover:bg-hoverOrange text-white font-semibold flex items-center justify-center gap-2"
              >
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Please wait
              </button>
            ) : (
              <button
                type="submit"
                className="bg-orange hover:bg-hoverOrange text-white font-semibold flex items-center justify-center gap-2"
              >
                Login <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <span className="text-center text-sm">
              Don't have an account?{" "}
              <Link to="/signup" className="text-orange-500 hover:text-orange-600 font-medium">
                Sign up
              </Link>
            </span>
          </form>
        ) : (
          /* ----- Email-not-verified UX ----- */
          <div className="flex flex-col gap-4 p-4 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
            <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
              <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-semibold mb-1">Verify your email</h2>
                <p className="text-sm">
                  Your account exists but your email isn't verified yet.
                  Check your inbox for the 6-digit code, or get a new one.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to="/verify-email"
                state={{ email: input.email }}
                className="flex-1 bg-orange hover:bg-hoverOrange text-white py-2 px-4 rounded-lg text-center font-semibold"
              >
                Verify your email
              </Link>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="flex items-center gap-1 px-4 py-2 border border-orange-500 text-orange-500 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/30"
              >
                {resending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Resend
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNeedsVerification(false)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ← Back to login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
