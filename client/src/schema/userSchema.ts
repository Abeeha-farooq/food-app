// import { Contact } from "lucide-react"
import {z} from "zod"
// import { email } from "zod/v4"

// ----- Length caps -----
// Why these numbers:
//   - email 254 chars: RFC 5321 maximum. Anything beyond that is
//     rejected by every well-behaved mail server. Capping client-
//     side prevents a 500-char POST from making it to the server
//     and into the bcrypt pipeline (DoS guard).
//   - password 128 chars: bcrypt itself silently truncates beyond
//     72 bytes, and a 500-char POST triggers a slow bcrypt run
//     (CPU DoS). 128 chars is generous for any real human password
//     and short enough to keep hashing fast. The 6-char minimum
//     stays the same.
const EMAIL_MAX = 254;
const PASSWORD_MAX = 128;

export const userSignupSchema=z.object({
fullname:z.string().min(1,"Fullname is required"),
email:z.string()
  .email("Invalid email address")
  .max(EMAIL_MAX, `Email is too long (max ${EMAIL_MAX} characters)`),
password:z.string()
  .min(6,"Password must be at least 6 digits")
  .max(PASSWORD_MAX, `Password is too long (max ${PASSWORD_MAX} characters)`),
contact:z.string().min(7,"Contact number must be at least 7 digits")

});
export type SignupInputState=z.infer<typeof userSignupSchema>;

export const userLoginSchema=z.object({
email:z.string()
  .email("Invalid email address")
  .max(EMAIL_MAX, `Email is too long (max ${EMAIL_MAX} characters)`),
password:z.string()
  .min(6,"Password must be at least 6 digits")
  .max(PASSWORD_MAX, `Password is too long (max ${PASSWORD_MAX} characters)`),


});
export type LoginInputState=z.infer<typeof userLoginSchema>;