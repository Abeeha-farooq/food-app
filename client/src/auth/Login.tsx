import { Input } from "@/components/ui/input";
//import { Label } from "@/components/ui/label";
import { Separator } from "@radix-ui/react-separator";
import { Link } from 'react-router-dom';
import { Loader2 } from "lucide-react";

<Loader2 className="h-4 w-4 animate-spin" />

import { LockKeyhole, Mail } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { userLoginSchema, type LoginInputState } from "@/schema/userSchema";

//typescript mn type define krne ky 2 ways hote hn 
// interface LoginInputState{
// email:string;                      
// password:string;
// }
// interface LoginInputwithAge extends LoginInputState{
//     age:string;
// }

//2  
// type LoginInputState = {
//     email: string;
//     password: string;
// }

const Login = () => {

    const [input, setInput] = useState<LoginInputState>({
        email: "",
        password: "",
    });
    
    const [errors,setErrors]=useState<Partial<LoginInputState>>({});
    const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setInput({ ...input, [name]: value });

    }
    const loginSubmitHanlder = (e: FormEvent) => {
        e.preventDefault();//taky wo refresh na ho submit hote huay 
const result=userLoginSchema.safeParse(input);
if(!result.success){
const fieldErrors=result.error.formErrors.fieldErrors;
setErrors(fieldErrors as Partial<LoginInputState>)
return;
}

        console.log(input);
    }
    const loading = false;
    return (
        <div className="flex items-center justify-center h-screen w-screen">
            <form onSubmit={loginSubmitHanlder} className="md:p-3 w-full max-w-md rounded-lg md:border border-gray-200 mx-4 space-y-4">
                <div className="mb-4">
 
                    <h1 className="font-bold text-3xl">Food Ware</h1>
                </div> 
                <div className="mb-4">
                    <div className="relative">
                        <Input className="pl-9 focus-visible:ring-1"
                         id="email"
                          type="email"
                           placeholder="email"
                            name="email"
                            value={input.email}
                            onChange={changeEventHandler}
                        />
                        <Mail className="absolute inset-y-2 inset-x-2 text-gray-500 pointer-events-none" />
                        {
                            errors&&<span className="text-sm text-red-500">{errors.email}</span>
                        }
                    </div>
                </div>
                <div className="mb-4">
                    <div className="relative">
                        <Input className="pl-9 focus-visible:ring-1" id="password" type="password" placeholder="password"
                           name="password"
                           value={input.password}
                            onChange={changeEventHandler} />
                        <LockKeyhole className="absolute inset-y-2 inset-x-2 text-gray-500 pointer-events-none" />
                        {
                            errors&&<span className="text-sm text-red-500">{errors.password}</span>
                        }
                    </div>
                </div>

                <div className="mb-10">
                    {
                        loading ? (<button disabled className="bg-orange hover:bg-hoverOrange w-full"><Loader2 className="mr-2 h-4 w-4 animate-spin" />please wait</button>) : (

                            <button type="submit" className="bg-orange hover:bg-hoverOrange w-full">Login</button>
                        )
                    }
                     <div className=" mt-2 text-black ">
<Link to="/forgot-password"  >Forgot Password</Link>
                </div>
                <div className=" mt-2 text-black ">
<Link to="/reset-password"  >Reset Password</Link>
                </div>
                </div>
                <Separator />
                <p className="mt-2">
                    Don't have an account?{" "}

                    <Link to="/signup" className="text-blue-500"> Signup</Link>

                </p>
            </form>
        </div>
    );
};

export default Login;
