// src/auth/ForgotPassword.tsx
// ===============================
// Purpose: User enters email, we send them a reset code via email.
//          Calls /api/auth/forgot-password.
// ===============================

import { Input } from "@/components/ui/input";
import { Loader2, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Pre-fill the email if the user came from the login page
  const prefilledEmail = (location.state as { email?: string })?.email || "";

  const [email, setEmail] = useState<string>(prefilledEmail);
  const [loading, setLoading] = useState(false);

  const submitHandler = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      toast.success("If that email is registered, a reset code has been sent.");
      // Move to reset-password page with the email pre-filled
      navigate("/reset-password", { state: { email } });
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
          <h1 className="font-extrabold text-2xl mb-2">Forgot Password</h1>
          <p className="text-m text-gray-500">Enter your email to reset</p>
        </div>

        <div className="relative w-full">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="pl-10"
            autoComplete="email"
          />
          <Mail className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
        </div>

        {loading ? (
          <button
            disabled
            type="button"
            className="bg-orange hover:bg-hoverOrange flex items-center justify-center gap-2"
          >
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </button>
        ) : (
          <button type="submit" className="bg-orange hover:bg-hoverOrange">
            Send reset code
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

export default ForgotPassword;
