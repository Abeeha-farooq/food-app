import { AspectRatio } from "@radix-ui/react-aspect-ratio";
import FilterPage from "./FilterPage";
import HereImage from "@/assets/hero_image.png";
import { Card, CardContent, CardFooter } from "./ui/card";
import { Link } from "react-router-dom";
import { Globe, MapPin, X } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "@/components/ui/badge";


const SearchPage = () => {
  return (
    <>
      <div className="w-screen h-screen bg-white py-5 px-4 overflow-hidden">
        <div className="flex flex-col xl:flex-row gap-6 max-w-[1600px] mx-auto my-auto">
          {/* Left Filter Sidebar */}
          <div className="w-full xl:w-1/4">
            <div className=" p-2 rounded-md">
              <FilterPage />
            </div>
          </div>

          {/* Right Side Content */}
          <div className="w-full xl:w-3/4 space-y-4">
            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {["biryani", "momos", "jalebi"].map((tag, idx) => (
                <div key={idx} className="relative inline-flex items-center max-w-full">
                  <Badge className="text-[#D19254] rounded-md pr-6 whitespace-nowrap" variant="outline">
                    {tag}
                  </Badge>
                  <X size={16} className="absolute text-[#D19254] right-1 hover:cursor-pointer" />
                </div>
              ))}
            </div>

            {/* Restaurant Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {[1, 2, 3,4,5,6,7,8,9].map((_, idx) => (
                <Card
                  key={idx}
                  className="bg-white shadow-xl rounded-xl overflow-hidden hover:shadow-2xl transition-shadow duration-300"
                >
                  <div className="relative">
                    <AspectRatio ratio={15/ 6}>
                      <img
                        src={HereImage}
                        alt="Restaurant"
                        className="w-full h-full object-cover"
                      />
                    </AspectRatio>
                    <div className="absolute top-2 left-2 bg-white bg-opacity-75 dark:bg-grey-700 rounded-lg px-3 py-1">
                      <span className="text-sm font-medium text-gray-700">
                        Featured
                      </span>
                    </div>
                  </div>

                  <CardContent className="p-4">
                    <h1 className="text-2xl font-bold text-gray-900">Pizza Hut</h1>
                    <div className="mt-2 flex items-center gap-1 text-gray-600">
                      <MapPin size={16} />
                      <p className="text-sm">
                        City: <span className="font-medium">Lahore</span>
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-gray-600">
                      <Globe size={16} />
                      <p className="text-sm">
                        Country: <span className="font-medium">Pakistan</span>
                      </p>
                    </div>
                    <div className="flex gap-2 mt-4 flex-wrap">
                      {["biryani", "momos", "pizza"].map((tag, i) => (
                        <Badge
                          key={i}
                          className="font-medium px-2 py-1 rounded-full shadow-sm"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>

                  <CardFooter className="p-4 border-t text-white flex justify-end">
                    <Link to="/restaurant/123">
                      <Button className="bg-orange hover:bg-hoverOrange font-semibold py-2 px-4 rounded-full shadow-md transition-colors duration-200">
                        View Menu
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SearchPage;




// import { useState } from "react";
// import { Input } from "./ui/input";
// import { Button } from "./ui/button";
// import { Badge } from "@/components/ui/badge";
// import { MapPin, Globe, X } from "lucide-react";
// import FilterPage from "./FilterPage";
// import HereImage from "@/assets/hero_image.png";
// import { Card, CardContent, CardFooter } from "./ui/card";
// import { AspectRatio } from "@/components/ui/aspect-ratio";
// import { Link } from "react-router-dom";

// const SearchPage = () => {
//   const [searchQuery, setSearchQuery] = useState<string>("");

//   return (
    // <div className="max-w-7xl mx-auto my-10 px-4">
    //   <div className="flex flex-col md:flex-row gap-10">
    //     {/* Left Side Filter */}
    //     {/* <div className="md:w-1/4 w-full">
    //       <FilterPage />
    //     </div> */}

    //     {/* Right Side Content */}
    //     <div className="flex-1 flex flex-col gap-4">
    //       {/* Search Bar */}
    //       <div className="flex items-center gap-2">
    //         <Input
    //           type="text"
    //           placeholder="Search by restaurant or cuisine"
    //           value={searchQuery}
    //           onChange={(e) => setSearchQuery(e.target.value)}
    //         />
    //         <Button className="bg-orange hover:bg-hoverOrange font-semibold py-2 px-4 rounded-full shadow-md transition-colors duration-200">
    //           Search
    //         </Button>
    //       </div>

    //       {/* Selected Filters */}
    //       <div className="flex flex-wrap gap-2">
    //         {["biryani", "momos", "jalebi"].map((tag, idx) => (
    //           <div key={idx} className="relative inline-flex items-center max-w-full">
    //             <Badge
    //               className="text-[#D19254] rounded-md hover:cursor-pointer pr-6 whitespace-nowrap"
    //               variant="outline"
    //             >
    //               {tag}
    //             </Badge>
    //             <X
    //               size={16}
    //               className="absolute text-[#D19254] right-1 hover:cursor-pointer"
    //             />
    //           </div>
    //         ))}
    //       </div>

    //       {/* Restaurant Cards */}
    //       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
    //         {[1, 2, 3].map((_, idx) => (
    //           <Card
    //             key={idx}
    //             className="bg-white dark:bg-gray-800 shadow-xl rounded-xl overflow-hidden hover:shadow-2xl transition-shadow duration-300"
    //           >
    //             <div className="relative">
    //               <AspectRatio ratio={16 / 6}>
    //                 <img
    //                   src={HereImage}
    //                   alt="Restaurant"
    //                   className="w-full h-full object-cover"
    //                 />
    //               </AspectRatio>
    //               <div className="absolute top-2 left-2 bg-white dark:bg-gray-700 bg-opacity-75 rounded-lg px-3 py-1">
    //                 <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
    //                   Featured
    //                 </span>
    //               </div>
    //             </div>

    //             <CardContent className="p-4">
    //               <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
    //                 Pizza Hut
    //               </h1>
    //               <div className="mt-2 gap-1 flex items-center text-gray-600 dark:text-gray-400">
    //                 <MapPin size={16} />
    //                 <p className="text-sm">
    //                   City: <span className="font-medium">Lahore</span>
    //                 </p>
    //               </div>
    //               <div className="mt-2 gap-1 flex items-center text-gray-600 dark:text-gray-400">
    //                 <Globe size={16} />
    //                 <p className="text-sm">
    //                   Country: <span className="font-medium">Pakistan</span>
    //                 </p>
    //               </div>
    //               <div className="flex gap-2 mt-4 flex-wrap">
    //                 {["biryani", "momos", "pizza"].map((tag, i) => (
    //                   <Badge
    //                     key={i}
    //                     className="font-medium px-2 py-1 rounded-full shadow-sm"
    //                   >
    //                     {tag}
    //                   </Badge>
    //                 ))}
    //               </div>
    //             </CardContent>

    //             <CardFooter className="p-4 border-t dark:border-t-gray-700 border-t-gray-100 text-white flex justify-end">
    //               <Link to="/restaurant/123">
    //                 <Button className="bg-orange hover:bg-hoverOrange font-semibold py-2 px-4 rounded-full shadow-md transition-colors duration-200">
    //                   View Menu
    //                 </Button>
    //               </Link>
    //             </CardFooter>
    //           </Card>
    //         ))}
    //       </div>
    //     </div>
    //   </div>
    // </div>
//   );
// };

// export default SearchPage;
