import { Input } from "@/components/ui/input";
import { Separator } from "@radix-ui/react-separator";
import { Link } from 'react-router-dom';
import { PhoneOutgoing, User} from "lucide-react";

import { LockKeyhole, Mail } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { userSignupSchema, type SignupInputState } from "@/schema/userSchema";

// type SignupInputState = {
//     fullName: string;
//     email: string;              zod ny create krdia schema c 
//     password: string;
//     contact: string;

// }
const Signup = () => {
    //setup 
    const [input, setInput] = useState<SignupInputState>({
        fullname: "",
        email: "",
        password: "",
        Contact: "",
    });
    //partial error in ts
const [errors,setErrors]=useState<Partial<SignupInputState>>({});
    const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setInput({ ...input, [name]: value });

    };

    const loginSubmitHandler = (e: FormEvent) => {
        e.preventDefault();
        //form validation check start
const result=userSignupSchema.safeParse(input);
if(!result.success){
    const fieldErrors=result.error.formErrors.fieldErrors;
setErrors(fieldErrors as Partial<SignupInputState>);
return;
}
//login api implementation 

        console.log(input);
    };
    return (
        <div className="flex items-center justify-center h-screen w-screen">
            <form onSubmit={loginSubmitHandler} className="md:p-3 w-full max-w-md rounded-lg md:border border-gray-200 mx-4 space-y-4">
                <div className="mb-4">
                    <h1 className="font-bold text-3xl">Sign Up</h1>
                </div>
                <div className="mb-4"> 
                    <div className="relative">
                        <Input className="pl-9 focus-visible:ring-1"
                            id="fullName"
                            type="text"
                            placeholder="Enter full Name"
                            name="fullname"
                            value={input.fullname}
                            onChange={changeEventHandler}
                        />
                        <User className="absolute inset-y-2 inset-x-2 text-gray-500 pointer-events-none" />
                        {
                           errors&&<span className="text-sm text-red-500">{errors.fullname}</span>
                        }
                    </div>

                </div>

                <div className="mb-4">
                    <div className="relative">
                        <Input className="pl-9 focus-visible:ring-1"
                            id="email"
                            type="email"
                            placeholder="Email"
                            name="email"
                            value={input.email}
                            onChange={changeEventHandler}
                        />
                        <Mail className="absolute inset-y-2 inset-x-2 text-gray-500 pointer-events-none" />
                        {
                            errors&&<span className="text-sm text-red-500">{ errors.email}</span>
                        }
                    </div>
                </div>
                <div className="mb-4">
                    <div className="relative">
                        <Input className="pl-9 focus-visible:ring-1"
                            id="password" type="password"
                            placeholder="password"
                            name="password"
                            value={input.password}
                            onChange={changeEventHandler} />
                        <LockKeyhole className="absolute inset-y-2 inset-x-2 text-gray-500 pointer-events-none" />
                        {
                            errors &&<span className="text-sm text-red-500">{errors.password}</span>
                        }
                    </div>
                </div>

                <div className="mb-4">
                    <div className="relative">
                        <Input className="pl-9 focus-visible:ring-1"
                            id="contact" type="text"
                            placeholder="contact"
                            name="Contact"
                            value={input.Contact}
                            onChange={changeEventHandler} />
                        <PhoneOutgoing className="absolute inset-y-2 inset-x-2 text-gray-500 pointer-events-none" />
{
    errors &&<span className="text-sm text-red-500 ">{errors.Contact}</span>
}
                    </div>
                </div>
<div className="mb-4">
    <button type="submit" className="font-bold text-500 border-orange  ">SignUp</button>

</div>
                <Separator />
                <p className="mt-2">
                    Already have an account?{" "}
                    <Link to="/Login" className="text-blue-500">Login</Link>

                </p>

            </form>
        </div>

    );

};

export default Signup;