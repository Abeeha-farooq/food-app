// src/auth/ResetPassword.tsx
// ===============================
// Purpose: User enters the reset code we emailed + their new password.
//          Calls /api/auth/reset-password, then redirects to login.
// ===============================

import { Input } from "@/components/ui/input";
import { Loader2, LockKeyhole, KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = (location.state as { email?: string })?.email || "";

  const [email] = useState(emailFromState);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submitHandler = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !otp || !newPassword) {
      toast.error("All fields are required");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", { email, otp, newPassword });
      toast.success("Password reset successfully. Please log in.");
      navigate("/login");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen w-screen min-h-screen">
      <form
        onSubmit={submitHandler}
        className="flex flex-col gap-5 md:p-8 w-full max-w-md rounded-lg mx-4"
      >
        <div className="text-center">
          <h1 className="font-extrabold text-2xl mb-2">Reset your password</h1>
          <p className="text-m text-gray-500">
            We sent a 6-digit code to <b>{email || "your email"}</b>
          </p>
        </div>

        <div className="relative w-full">
          <Input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="6-digit code"
            maxLength={6}
            className="pl-10 tracking-widest"
            autoComplete="one-time-code"
          />
          <KeyRound className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
        </div>

        <div className="relative w-full">
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 6 chars)"
            className="pl-10"
            autoComplete="new-password"
          />
          <LockKeyhole className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
        </div>

        {loading ? (
          <button
            disabled
            type="button"
            className="bg-orange hover:bg-hoverOrange flex items-center justify-center gap-2"
          >
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Resetting...
          </button>
        ) : (
          <button type="submit" className="bg-orange hover:bg-hoverOrange">
            Reset password
          </button>
        )}

        <span className="text-center">
          Back to{" "}
          <Link to="/login" className="text-blue-500">
            Login
          </Link>
        </span>
      </form>
    </div>
  );
};

export default ResetPassword;
