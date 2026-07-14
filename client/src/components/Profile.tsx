// src/components/Profile.tsx
// ===============================
// Purpose: Edit profile form. Loads existing data, saves updates.
// ===============================

import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, Mail, MapPin, MapPinnedIcon, Plus, Save } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/useAuth";

const Profile = () => {
  // useAuth gives us a way to update the cached user after save.
  // We don't need the `user` value from context here — we always fetch
  // fresh data from the server on mount (see useEffect below).
  const { updateUser } = useAuth();

  // Form state
  const [profileData, setProfileData] = useState({
    fullname: "",
    email: "",
    phone: "",  // UI label is "phone", backend field is "contact"
    address: "",
    city: "",
    country: "",
  });
  const [selectedProfilePicture, setSelectedProfilePicture] = useState<string>("");
  const [pageLoading, setPageLoading] = useState(true);   // true while page data loads
  const [saving, setSaving] = useState(false);            // true while form is being submitted
  const imageRef = useRef<HTMLInputElement | null>(null);

  // Load profile data DIRECTLY from the server every time the page mounts.
  // Why not just use the cached `user` from context? Because:
  //   1. We want fresh data (the user might have updated it from another tab)
  //   2. It's more reliable — only depends on the API call, not context state
  //   3. Easier to reason about: the page is responsible for its own data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await api.get("/user/me");
        const u = res.data.data;
        setProfileData({
          fullname: u.fullname || "",
          email: u.email || "",
          phone: u.contact || "",
          address: u.address || "",
          city: u.city || "",
          country: u.country || "",
        });
        if (u.profilePicture) setSelectedProfilePicture(u.profilePicture);
        // Also sync the context so NavBar shows up-to-date info
        updateUser(u);
      } catch (err) {
        toast.error(getErrorMessage(err));
        // If the API call fails with 401, the interceptor already redirected to /login
      } finally {
        setPageLoading(false);
      }
    };
    loadProfile();
    // We include `updateUser` in deps even though we want this to run once.
    // It's safe because `updateUser` is wrapped in useCallback in AuthContext
    // (stable reference). Adding it satisfies the exhaustive-deps rule
    // without causing infinite re-renders.
  }, [updateUser]);

  // Handle file selection — show preview as base64 (server doesn't accept file yet,
  // so we'll send this data URL directly. Real apps use Cloudinary or similar.)
  const fileChangeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setSelectedProfilePicture(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const changeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileData({ ...profileData, [name]: value });
  };

  const updateProfileHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setSaving(true);
    try {
      // Send only the fields our backend knows about. The UI calls it "phone",
      // the backend stores it as "contact" — we map between the two here.
      const payload = {
        fullname: profileData.fullname,
        contact: profileData.phone,
        address: profileData.address,
        city: profileData.city,
        country: profileData.country,
        profilePicture: selectedProfilePicture,
      };
      const res = await api.put("/user/me", payload);

      // Update the global auth state so NavBar etc. see the new info immediately
      updateUser(res.data.data);
      toast.success("Profile updated!");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={updateProfileHandler} className="max-w-7xl mx-auto my-10 px-4">
      {/* Loading state — show spinner until the profile data is fetched */}
      {pageLoading && (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Loader2 className="animate-spin mr-2" /> Loading your profile...
        </div>
      )}

      {/* Main form — only shown after data is loaded */}
      {!pageLoading && (
      <>
      {/* Avatar + Name */}
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <div className="relative md:w-28 md:h-24 w-20 h-20 bg-gray-300 rounded-full flex items-center justify-center">
          <Avatar className="w-full h-full">
            <AvatarImage src={selectedProfilePicture} className="w-full h-full object-cover rounded-full" />
            <AvatarFallback>
              {profileData.fullname ? profileData.fullname.substring(0, 2).toUpperCase() : "?"}
            </AvatarFallback>
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

        <Input
          type="text"
          name="fullname"
          placeholder="Your name"
          value={profileData.fullname}
          onChange={changeHandler}
          className="font-bold text-xl md:text-2xl outline-none border-none bg-transparent w-full"
        />
      </div>

      {/* Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 my-10">
        {/* Email (read-only — changing email requires verification flow we haven't built) */}
        <div className="flex items-center gap-4 p-2 bg-gray-200 rounded-sm">
          <Mail className="text-gray-500" />
          <div className="w-full">
            <Label>Email</Label>
            <input
              className="w-full text-gray-600 bg-transparent focus-visible:ring-transparent focus-visible:border-transparent outline-none border-none cursor-not-allowed"
              name="email"
              value={profileData.email}
              readOnly
            />
          </div>
        </div>

        {/* Phone */}
        <div className="flex items-center gap-4 p-2 bg-gray-200 rounded-sm">
          <Mail className="text-gray-500" />
          <div className="w-full">
            <Label>Phone</Label>
            <input
              className="w-full text-gray-600 bg-transparent focus-visible:ring-transparent focus-visible:border-transparent outline-none border-none"
              name="phone"
              value={profileData.phone}
              onChange={changeHandler}
            />
          </div>
        </div>

        {/* Address */}
        <div className="flex items-center gap-4 p-2 bg-gray-200 rounded-sm">
          <MapPinnedIcon className="text-gray-500" />
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

      {/* Submit */}
      <div className="text-center mt-4">
        {saving ? (
          <button
            disabled
            type="button"
            className="flex items-center gap-2 bg-gray-400 text-white px-4 py-2 rounded"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </button>
        ) : (
          <button
            type="submit"
            className="bg-orange hover:bg-hoverOrange text-white px-6 py-2 rounded flex items-center gap-2 mx-auto"
          >
            <Save className="w-4 h-4" />
            Save changes
          </button>
        )}
      </div>
      </>
      )}
    </form>
  );
};

export default Profile;