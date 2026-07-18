// src/auth/ForgotPasswordFlow.tsx
// ===============================
// Purpose: 3-step inline forgot-password flow, rendered ON the login
//          page (not a separate route). Replaces the login form when
//          the user clicks "Forgot password?".
//
// Flow (3 steps, all on the same screen with a stepper at the top):
//   1. Enter email     → POST /api/auth/forgot-password  → email sent
//   2. Enter OTP       → POST /api/auth/verify-reset-otp → 5-min reset
//                       window opens (server marks user as "verified")
//   3. New password    → POST /api/auth/reset-password    → password
//                       changed. We go back to the login form.
//
// Why 3 steps (not 2):
//   The user must PROVE they own the email by entering the OTP BEFORE
//   the server accepts a new password. Step 2 opens a 5-minute
//   "reset window" on the user record; step 3 checks that window.
//   If the user takes too long, they have to re-do step 1+2.
//
// Why on the login page (not a separate /forgot-password route):
//   Faster for the user (no page transition, no back button needed),
//   and keeps the brand context. They can always click "Back to
//   login" at any step to go back to the regular login form.
// ===============================

import { useState, type FormEvent } from "react";
import {
  Mail,
  KeyRound,
  LockKeyhole,
  ArrowRight,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// ============================================================
// TYPES
// ============================================================

type Step = "email" | "otp" | "password" | "done";

interface ForgotPasswordFlowProps {
  /** Called when the user clicks "Back to login" — parent restores the
   *  regular login form. */
  onBackToLogin: () => void;
  /** Optional: prefill the email (e.g. from the login form's email field). */
  initialEmail?: string;
}

// ============================================================
// COMPONENT
// ============================================================

export const ForgotPasswordFlow = ({ onBackToLogin, initialEmail = "" }: ForgotPasswordFlowProps) => {
  // ----- Step state machine -----
  const [step, setStep] = useState<Step>("email");

  // ----- Form data (persists across steps) -----
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ----- Per-step loading flags -----
  // Separate flags so the user knows which step is processing.
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  // ----- Resend cooldown (UX nicety: don't allow resend for 30s) -----
  const [resendCooldown, setResendCooldown] = useState(0);

  // ============================================================
  // STEP 1: Send OTP to the user's email
  // ============================================================
  const handleSendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email");
      return;
    }
    setSendingCode(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      toast.success("If that email is registered, a 6-digit code has been sent.");
      setStep("otp");
      // Start the resend cooldown
      setResendCooldown(30);
      const interval = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSendingCode(false);
    }
  };

  // ============================================================
  // STEP 2: Verify the OTP (opens the 5-min reset window)
  // ============================================================
  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      toast.error("Please enter the 6-digit code from your email");
      return;
    }
    setVerifyingOtp(true);
    try {
      await api.post("/auth/verify-reset-otp", {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });
      toast.success("Code verified. Now set your new password.");
      setStep("password");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setVerifyingOtp(false);
    }
  };

  // ============================================================
  // STEP 3: Set the new password (requires verified window)
  // ============================================================
  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setResettingPassword(true);
    try {
      await api.post("/auth/reset-password", {
        email: email.trim().toLowerCase(),
        newPassword,
      });
      toast.success("Password reset successfully. Please log in with your new password.");
      setStep("done");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setResettingPassword(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="flex flex-col gap-5 w-full">
      {/* ----- Stepper (visual progress indicator) ----- */}
      <Stepper currentStep={step} />

      {/* ----- Step content ----- */}
      {step === "email" && (
        <form onSubmit={handleSendCode} className="flex flex-col gap-4">
          <div className="text-center">
            <h1 className="font-extrabold text-2xl mb-2 text-gray-900 dark:text-white">Forgot password?</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your email and we'll send you a 6-digit code to reset your password.
            </p>
          </div>

          <div className="relative w-full">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="pl-10"
              autoComplete="email"
              autoFocus
            />
            <Mail className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
          </div>

          <ActionButton
            type="submit"
            loading={sendingCode}
            loadingText="Sending code..."
          >
            Send reset code <ArrowRight className="w-4 h-4" />
          </ActionButton>

          <BackToLoginLink onClick={onBackToLogin} />
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
          <div className="text-center">
            <h1 className="font-extrabold text-2xl mb-2 text-gray-900 dark:text-white">Check your email</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              We sent a 6-digit code to <b className="text-gray-900 dark:text-white">{email}</b>
            </p>
          </div>

          <div className="relative w-full">
            <Input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              maxLength={6}
              className="pl-10 tracking-widest text-center font-mono"
              autoComplete="one-time-code"
              autoFocus
            />
            <KeyRound className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
          </div>

          <ActionButton
            type="submit"
            loading={verifyingOtp}
            loadingText="Verifying..."
          >
            Verify code <ArrowRight className="w-4 h-4" />
          </ActionButton>

          {/* Resend code — only enabled after cooldown */}
          <button
            type="button"
            onClick={resendCooldown > 0 ? undefined : handleSendCode}
            disabled={resendCooldown > 0 || sendingCode}
            className={`text-sm flex items-center justify-center gap-1 ${
              resendCooldown > 0
                ? "text-gray-400 dark:text-gray-500 cursor-not-allowed"
                : "text-orange-500 hover:text-orange-600 cursor-pointer"
            }`}
          >
            {resendCooldown > 0 ? (
              <>
                <Clock className="w-3 h-3" />
                Resend code in {resendCooldown}s
              </>
            ) : (
              "Didn't get the code? Resend"
            )}
          </button>

          <BackToLoginLink onClick={onBackToLogin} label="Cancel" />
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
          <div className="text-center">
            <h1 className="font-extrabold text-2xl mb-2 text-gray-900 dark:text-white">Set new password</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Choose a strong password (min 6 characters).
            </p>
          </div>

          <div className="relative w-full">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 6 chars)"
              className="pl-10"
              autoComplete="new-password"
              autoFocus
            />
            <LockKeyhole className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
          </div>

          <div className="relative w-full">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="pl-10"
              autoComplete="new-password"
            />
            <LockKeyhole className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
          </div>

          <ActionButton
            type="submit"
            loading={resettingPassword}
            loadingText="Resetting password..."
          >
            Reset password <ArrowRight className="w-4 h-4" />
          </ActionButton>

          <BackToLoginLink onClick={onBackToLogin} label="Cancel" />
        </form>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-center">
            <h1 className="font-extrabold text-xl mb-1 text-gray-900 dark:text-white">Password reset!</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              You can now log in with your new password.
            </p>
          </div>
          <ActionButton
            type="button"
            onClick={onBackToLogin}
          >
            Back to login <ArrowRight className="w-4 h-4" />
          </ActionButton>
        </div>
      )}
    </div>
  );
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

/**
 * Visual stepper showing 3 dots + labels. Highlights the current step.
 */
const Stepper = ({ currentStep }: { currentStep: Step }) => {
  const steps: { id: Step; label: string }[] = [
    { id: "email", label: "Email" },
    { id: "otp", label: "Verify" },
    { id: "password", label: "New password" },
  ];

  // Compute which step is "current" for the dot colors
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center justify-center gap-2 mb-2">
      {steps.map((s, i) => {
        const isCompleted = i < currentIndex || currentStep === "done";
        const isCurrent = i === currentIndex;
        return (
          <div key={s.id} className="flex items-center gap-2">
            {/* Dot */}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isCompleted
                  ? "bg-green-500 text-white"
                  : isCurrent
                  ? "bg-orange text-white"
                  : "bg-gray-200 dark:bg-neutral-700 text-gray-500"
              }`}
            >
              {isCompleted ? "✓" : i + 1}
            </div>
            {/* Label (only show on mobile if needed) */}
            <span
              className={`text-xs font-medium ${
                isCurrent
                  ? "text-orange-500"
                  : isCompleted
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
            {/* Connector line (not after the last step) */}
            {i < steps.length - 1 && (
              <div
                className={`w-6 h-0.5 ${
                  isCompleted ? "bg-green-500" : "bg-gray-200 dark:bg-neutral-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Primary action button (orange, full-width) with loading state.
 * Uses the plain <button> defaults from index.css for padding/radius.
 */
const ActionButton = ({
  children,
  loading = false,
  loadingText = "Please wait",
  ...rest
}: {
  children: React.ReactNode;
  loading?: boolean;
  loadingText?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className="bg-orange hover:bg-hoverOrange text-white font-semibold flex items-center justify-center gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
};

/**
 * "Back to login" / "Cancel" link below each step.
 */
const BackToLoginLink = ({ onClick, label = "Back to" }: { onClick: () => void; label?: string }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-center gap-1"
    >
      <ArrowLeft className="w-3 h-3" />
      {label} login
    </button>
  );
};

export default ForgotPasswordFlow;
