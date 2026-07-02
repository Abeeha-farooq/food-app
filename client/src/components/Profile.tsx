import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { Input } from "./ui/input";
import { Loader2, Locate, LocateIcon, Mail, MapPin, MapPinnedIcon, Plus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Label } from "@radix-ui/react-dropdown-menu";

const Profile = () => {
const[profileData,setProfileData]=useState({
    fullname:"",
    email:"",
    phone:"",
    address:"",
    city:"",
    country:"",
    profilePicture:"",
})
const loading =false;
    const imageRef = useRef<HTMLInputElement | null>(null);
    const [selectedProfilePicture, setSelectedProfilePicture] = useState<string>("");

    const fileChangeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setSelectedProfilePicture(result);
                setProfileData((prevData)=>({
                    ...prevData,profilePicture:result

                }))
            };
            reader.readAsDataURL(file);
        }
    };
const changeHandler=(e:React.ChangeEvent<HTMLInputElement>)=>{
const {name,value}=e.target;
setProfileData({...profileData,[name]:value});

} 
const updateProfileHandler=(e:FormEvent<HTMLFormElement>)=>{
e.preventDefault();
console.log(profileData);

//api update implementation start


}
    return (
       <form className="max-w-7xl mx-auto my-10 px-4">
  {/* Avatar + Name */}
  <div className="flex flex-col md:flex-row md:items-start gap-4">
    {/* Avatar */}
    <div className="relative md:w-28 md:h-24 w-20 h-20 bg-gray-300 rounded-full flex items-center justify-center">
      <Avatar className="w-full h-full">
        <AvatarImage
          src={selectedProfilePicture}
          className="w-full h-full object-cover rounded-full"
        />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>

      <Input
        type="file"
        ref={imageRef}
        className="hidden"
        accept="image/*"
        onChange={fileChangeHandler}
      />

      <div
        onClick={() => imageRef.current?.click()}
        className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300 bg-black bg-opacity-50 rounded-full cursor-pointer"
      >
        <Plus className="text-white w-6 h-6" />
      </div>
    </div>

    {/* Name input */}
    <Input
      type="text"
      name="fullname"
      placeholder="|"
      value={profileData.fullname}
      onChange={changeHandler}
      className="font-bold text-xl md:text-2xl outline-none border-none bg-transparent w-full"
    />
  </div>

  {/* Form Grid */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-10">
    {/* Email */}
    <div className="flex items-center gap-4 p-2 bg-gray-200 rounded-sm">
      <Mail className="text-gray-500" />
      <div className="w-full">
        <Label>Email</Label>
        <input
          className="w-full text-gray-600 bg-transparent focus-visible:ring-transparent focus-visible:border-transparent outline-none border-none"
          name="email"
          value={profileData.email}
          onChange={changeHandler}
        />
      </div>
    </div>

    {/* Address */}
    <div className="flex items-center gap-4 p-2 bg-gray-200 rounded-sm">
      <LocateIcon className="text-gray-500" />
      <div className="w-full">
        <Label>Address</Label>
        <input
          className="w-full text-gray-600 bg-transparent focus-visible:ring-transparent focus-visible:border-transparent outline-none border-none"
          name="address"
          value={profileData.address}
          onChange={changeHandler}
        />
      </div>
    </div>

    {/* City */}
    <div className="flex items-center gap-4 p-2 bg-gray-200 rounded-sm">
      <MapPin className="text-gray-500" />
      <div className="w-full">
        <Label>City</Label>
        <input
          className="w-full text-gray-600 bg-transparent focus-visible:ring-transparent focus-visible:border-transparent outline-none border-none"
          name="city"
          value={profileData.city}
          onChange={changeHandler}
        />
      </div>
    </div>

    {/* Country */}
    <div className="flex items-center gap-4 p-2 bg-gray-200 rounded-sm">
      <MapPinnedIcon className="text-gray-500" />
      <div className="w-full">
        <Label>Country</Label>
        <input
          className="w-full text-gray-600 bg-transparent focus-visible:ring-transparent focus-visible:border-transparent outline-none border-none"
          name="country"
          value={profileData.country}
          onChange={changeHandler}
        />
      </div>
    </div>
  </div>

  {/* Submit Button */}
  <div className="text-center mt-4">
    {loading ? (
      <button
        disabled
        className="flex items-center gap-2 bg-gray-400 text-white px-4 py-2 rounded"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Please wait...
      </button>
    ) : (
      <button className="bg-orange hover:bg-hoverOrange text-white px-6 py-2 rounded">
        Update
      </button>
    )}
  </div>
</form>
    );
};

export default Profile;
