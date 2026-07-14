// src/auth/Signup.tsx
// ===============================
// Purpose: Signup form. On submit, calls POST /api/auth/signup,
//          which sends a 6-digit OTP to the user's email. The user
//          is then redirected to /verify-email to enter the code.
// ===============================

import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Mail, LockKeyhole, User as UserIcon, Phone, ArrowRight } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { userSignupSchema, type SignupInputState } from "@/schema/userSchema";
import { useAuth } from "@/context/useAuth";
import { getErrorMessage } from "@/lib/api";

const Signup = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [input, setInput] = useState<SignupInputState>({
    fullname: "",
    email: "",
    contact: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const submitHandler = async (e: FormEvent) => {
    e.preventDefault();

    const result = userSignupSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues;
      toast.error(errors[0]?.message || "Invalid input");
      return;
    }

    setLoading(true);
    try {
      await signup(result.data);
      // Note: the user is NOT created yet — they only exist in the
      // PendingSignup collection until they verify the OTP.
      toast.success("Check your email for the verification code");
      navigate("/verify-email", { state: { email: result.data.email } });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen w-screen">
      <form
        onSubmit={submitHandler}
        className="flex flex-col gap-5 md:p-8 w-full max-w-md rounded-lg mx-4"
      >
        <div className="text-center">
          <h1 className="font-extrabold text-2xl mb-2">Create your account</h1>
          <p className="text-m text-gray-500">Sign up to start ordering</p>
        </div>

        <div className="relative w-full">
          <Input
            type="text"
            name="fullname"
            value={input.fullname}
            onChange={changeEventHandler}
            placeholder="Full name"
            className="pl-10"
            autoComplete="name"
          />
          <UserIcon className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
        </div>

        <div className="relative w-full">
          <Input
            type="email"
            name="email"
            value={input.email}
            onChange={changeEventHandler}
            placeholder="Email"
            className="pl-10"
            autoComplete="email"
          />
          <Mail className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
        </div>

        <div className="relative w-full">
          <Input
            type="tel"
            name="contact"
            value={input.contact}
            onChange={changeEventHandler}
            placeholder="Contact number"
            className="pl-10"
            autoComplete="tel"
          />
          <Phone className="absolute inset-y-2 left-2 text-gray-500 pointer-events-none" />
        </div>

        <div className="relative w-full">
          <Input
            type="password"
            name="password"
            value={input.password}
            onChange={changeEventHandler}
            placeholder="Password (min 6 chars)"
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
            Creating account...
          </button>
        ) : (
          <button type="submit" className="bg-orange hover:bg-hoverOrange flex items-center justify-center gap-2">
            Sign up <ArrowRight className="w-4 h-4" />
          </button>
        )}

        <span className="text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-orange hover:text-hoverOrange">
            Log in
          </Link>
        </span>
      </form>
    </div>
  );
};

export default Signup;
