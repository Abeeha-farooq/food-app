// src/auth/VerifyEmail.tsx
// ===============================
// Purpose: User enters the 6-digit OTP we emailed to verify their
//          account. On success, the backend creates the User and
//          auto-logs them in (sets cookie + returns token).
// ===============================

import { useState, type FormEvent, type ChangeEvent, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ShieldCheck, RefreshCw, Mail } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/useAuth";

const VerifyEmail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCurrentUser } = useAuth();
  const emailFromState = (location.state as { email?: string })?.email || "";

  // Six 1-digit boxes, one per OTP digit. Each box auto-advances to
  // the next on input, and backspaces to the previous on empty.
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize refs for the 6 boxes
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, 6);
  }, []);

  const otp = digits.join("");

  const handleChange = (idx: number, e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 1);  // single digit only
    const next = [...digits];
    next[idx] = val;
    setDigits(next);
    // Auto-advance to the next box
    if (val && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace on an empty box → go back to the previous box
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      setDigits(pasted.split(""));
      inputRefs.current[5]?.focus();
    }
  };

  const submitHandler = async (e: FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }
    if (!emailFromState) {
      toast.error("No email provided. Please go back to the signup page.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/verify-email", {
        email: emailFromState,
        otp,
      });
      // Backend auto-logs in: sets the httpOnly cookie + returns the token + user.
      const { token, ...userData } = res.data.data;
      if (token) localStorage.setItem("token", token);
      setCurrentUser(userData);
      toast.success("Email verified — you're in!");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!emailFromState) {
      toast.error("No email provided. Please go back to the signup page.");
      return;
    }
    setResending(true);
    try {
      await api.post("/auth/resend-verification", { email: emailFromState });
      toast.success("A new code has been sent");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen w-screen">
      <form
        onSubmit={submitHandler}
        className="flex flex-col gap-6 md:p-8 w-full max-w-md rounded-lg mx-4"
      >
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <Mail className="w-12 h-12 text-orange-500" />
          </div>
          <h1 className="font-extrabold text-2xl mb-2">Verify your email</h1>
          <p className="text-m text-gray-500">
            We sent a 6-digit code to{" "}
            <b>{emailFromState || "your email"}</b>
          </p>
        </div>

        {/* 6-digit OTP input */}
        <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
          {digits.map((d, idx) => (
            <input
              key={idx}
              ref={(el) => { inputRefs.current[idx] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(idx, e)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className="w-11 h-12 sm:w-12 sm:h-14 text-center text-xl font-semibold border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
              aria-label={`Digit ${idx + 1}`}
            />
          ))}
        </div>

        {loading ? (
          <button
            disabled
            type="button"
            className="bg-orange hover:bg-hoverOrange flex items-center justify-center gap-2"
          >
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying...
          </button>
        ) : (
          <button
            type="submit"
            disabled={otp.length !== 6}
            className="bg-orange hover:bg-hoverOrange flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck className="w-4 h-4" />
            Verify
          </button>
        )}

        <div className="text-center text-sm text-gray-500">
          Didn't get a code?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-orange hover:text-hoverOrange inline-flex items-center gap-1"
          >
            {resending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Resend
          </button>
        </div>

        <span className="text-center text-sm text-gray-500">
          Wrong email?{" "}
          <Link to="/signup" className="text-orange hover:text-hoverOrange">
            Sign up again
          </Link>
        </span>
      </form>
    </div>
  );
};

export default VerifyEmail;
