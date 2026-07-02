import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const VerifyEmail = () => {
  const inputRef = useRef<any>([]);
  const navigate = useNavigate();
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
const loading=false;
  const handleChange = (index: number, value: string) => {
    if (/^[a-zA-Z0-9]$/.test(value) || value == "") {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
    }
//move to the next input field
    if (value != "" && index < 5) {
      inputRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key == "Backspace" && index > 0 && !otp[index]) {
      inputRef.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center h-screen w-full">
      <div className="p-8 rounded-md w-full max-w-md flex flex-col gap-9 border border-gray-200">
        <div className="text-center">
          <h1 className="font-extrabold text-2xl">Verify your email</h1>
          <p className="text-sm text-gray-600">Enter the 6-digit code sent to your email address</p>
        </div>

        <form action="">
          <div className="p-2 flex justify-between gap-5 border border-transparent ">
            {otp.map((letter: string, idx: number) => (
              <Input
                key={idx}
                ref={(element) =>{ (inputRef.current[idx] = element)}}
                maxLength={1}
                type="text"
                value={letter}
                onChange={(e:React.ChangeEvent<HTMLInputElement>) => {handleChange(idx, e.target.value)}
            }
                onKeyDown={(e:React.KeyboardEvent<HTMLInputElement>)=>{handleKeyDown(idx,e)}
            }
                className=" w-12 h-12 text-center text-xl font-bold 
             border border-gray-300 

             rounded-md
             focus:outline-none
             focus:ring-2 focus:ring-indigo-400
             hover:border-indigo-500 
             transition-all duration-500"
              />
            ))}
          </div>

          {
  loading ? (
    <button disabled className="bg-orange hover:bg-hoverOrange mt-6 w-full flex items-center justify-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      Please wait
    </button>
  ) : (
    <button className="bg-orange hover:bg-hoverOrange mt-6 w-full">
      Verify
    </button>
  )
}
        </form>
      </div>
    </div>
  );
};

export default VerifyEmail;
