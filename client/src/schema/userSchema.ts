// import { Contact } from "lucide-react"
import {z} from "zod"
// import { email } from "zod/v4"

export const userSignupSchema=z.object({
fullname:z.string().min(1,"Fullname is required"),
email:z.string().email("Invalid email address"),
password:z.string().min(6,"Password must be at least 6 digits"),
contact:z.string().min(7,"Contact number must be at least 7 digits")

});
export type SignupInputState=z.infer<typeof userSignupSchema>;

export const userLoginSchema=z.object({
email:z.string().email("Invalid email address"),
password:z.string().min(6,"Password must be at least 6 digits"),


});
export type LoginInputState=z.infer<typeof userLoginSchema>;