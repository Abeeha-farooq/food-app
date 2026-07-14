// src/components/HereSection.tsx
// ===============================
// Purpose: The home/landing page.
//          Fixes the broken template-literal navigation bug
//          and adds a proper search bar.
// ===============================

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import HereImage from "@/assets/hero_img.jpg";
import { DollarSign, Utensils, Wand, Search } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

const HereSection = () => {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState<string>("");

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchText.trim();
    if (!trimmed) return;
    // ✅ FIXED: was `'/search/${...}'` (single quotes — no interpolation).
    //    Now we use backticks for proper template-literal interpolation.
    navigate(`/search/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="w-full overflow-hidden">
      {/* Hero Section */}
      <div className="relative h-[60vh] w-full">
        <div
          className="absolute inset-0 bg-cover bg-center z-0"
          style={{ backgroundImage: `url(${HereImage})` }}
        />
        <div className="absolute inset-0 bg-black bg-opacity-60 z-10" />

        <div className="relative z-20 flex flex-col items-center justify-center text-white h-full text-center px-4">
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 leading-tight">
            Order food anywhere & anytime
          </h1>
          <p className="text-base sm:text-lg md:text-2xl mb-6 max-w-[90%] sm:max-w-[70%]">
            Your favorite meals, just a few clicks away.
          </p>

          {/* Search bar — was missing entirely */}
          <form
            onSubmit={handleSearch}
            className="w-full max-w-2xl flex flex-col sm:flex-row items-stretch gap-2 bg-white rounded-full p-1"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <Input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search restaurants by name, city or country"
                className="pl-9 border-none shadow-none focus-visible:ring-0 text-gray-800"
              />
            </div>
            <Button type="submit" className="bg-orange hover:bg-hoverOrange rounded-full px-6">
              Search
            </Button>
          </form>
        </div>
      </div>

      {/* Feature cards */}
      <div className="relative z-30 -mt-20 px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <div className="bg-gray-700 text-white p-6 py-12 rounded-md shadow-lg text-center">
            <div className="flex justify-center items-center mb-4">
              <Wand className="w-16 h-16 text-gray-900" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Magical Atmosphere</h3>
            <p>Wonderful serenity has taken possession of my entire soul, like these sweet mornings.</p>
          </div>

          <div className="bg-gray-700 text-white p-6 rounded-md shadow-lg text-center">
            <div className="flex justify-center items-center mb-4">
              <Utensils className="w-16 h-16 text-gray-900" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Best Food Quality</h3>
            <p>Wonderful serenity has taken possession of my entire soul, like these sweet mornings.</p>
          </div>

          <div className="bg-gray-700 text-white p-6 rounded-md shadow-lg text-center">
            <div className="flex justify-center items-center mb-4">
              <DollarSign className="w-16 h-16 text-gray-900" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Low Costing Food</h3>
            <p>Wonderful serenity has taken possession of my entire soul, like these sweet mornings.</p>
          </div>
        </div>
      </div>

      {/* Discover section */}
      <div className="flex flex-col md:flex-row max-w-5xl mx-auto md:p-10 rounded-lg items-center justify-center m-9 gap-4">
        <div className="flex flex-col gap-10 md:w-[60%]">
          <div className="flex text-left flex-col gap-3">
            <h2 className="font-bold text-2xl text-black mb-4">Discover Our Story</h2>
            <p className="text-gray-500">
              Your favorite meals, just a few clicks away. When the lovely valley teems with vapour around me,
              and the meridian sun strikes the upper surface of the impenetrable foliage of my trees.
            </p>
          </div>
        </div>
        <div className="flex-1 rounded-full">
          <img src={HereImage} alt="" className="object-cover rounded-xl md:max-w-200 md:max-h-[200px]" />
        </div>
      </div>
    </div>
  );
};

export default HereSection;