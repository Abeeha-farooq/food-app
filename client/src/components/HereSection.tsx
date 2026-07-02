import { useNavigate } from "react-router-dom";
import HereImage from "@/assets/hero_img.jpg";
import { DollarSign, Utensils, Wand } from "lucide-react";

const HereSection = () => {
  const navigate = useNavigate();

  return (
    <div className="w-full overflow-hidden">
      {/* Hero Section with Background */}
      <div className="relative h-[60vh] w-full">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center z-0"
          style={{ backgroundImage: `url(${HereImage})` }}
        ></div>

        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-60 z-10"></div>

        {/* Content on top */}
        <div className="relative z-20 flex flex-col items-center justify-center text-white h-full text-center px-4">
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 leading-tight">
            Order food anywhere & anytime
          </h1>
          <p className="text-base sm:text-lg md:text-2xl mb-6 max-w-[90%] sm:max-w-[70%]">
            Your favorite meals, just a few clicks away.
          </p>
          <button
            onClick={() =>
              navigate('/search/${encodeURIComponent(searchText.trim())}')
            }
            className="bg-orange-500 hover:bg-orange-600 text-black font-semibold py-3 px-6 rounded-full shadow"
          >
            Check our Menu
          </button>
        </div>
      </div>

      {/* Overlapping Cards */}
      <div className="relative z-30 -mt-20 px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Box 1 */}
          <div className="bg-gray-700 text-white p-6 py-12 rounded-md shadow-lg text-center">
            <div className="flex justify-center items-center mb-4">
              <Wand className="w-16 h-16 text-gray-900" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Magical Atmosphere</h3>
            <p>Wonderful serenity has taken possession of my entire soul, like these sweet mornings.</p>
          </div>

          {/* Box 2 */}
          <div className="bg-gray-700 text-white p-6 rounded-md shadow-lg text-center">
            <div className="flex justify-center items-center mb-4">
              <Utensils className="w-16 h-16 text-gray-900" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Best Food Quality</h3>
            <p>Wonderful serenity has taken possession of my entire soul, like these sweet mornings.</p>
          </div>

          {/* Box 3 */}
          <div className="bg-gray-700 text-white p-6 rounded-md shadow-lg text-center">
            <div className="flex justify-center items-center mb-4">
              <DollarSign className="w-16 h-16 text-gray-900" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Low Costing Food</h3>
            <p>Wonderful serenity has taken possession of my entire soul, like these sweet mornings.</p>
          </div>
        </div>
      </div>

      {/* Extra Content */}

 <div className="flex flex-col md:flex-row max-w-5xl max-h-7xl mx-auto md:p-10 rounded-lg items-center justify-center m-9 gap-4">
 <div className="flex flex-col gap-10 md:w-[60%] md:h-[100%]">
     <div className="flex text-left flex-col gap-3">
     <h2 className="font-bold text-2xl text-black mb-4">Discover Our Story</h2>
 <p className="text-gray-500">Your favorite meals, just a few clicks away.
    When the lovely valley teems with vapour around me, and the meridian sun strikes the upper
          surface of the impenetrable foliage of my trees.
 </p>
 </div>

</div>
<div className="flex-1 rounded-full">
     <img src={HereImage}
    alt=""
    className="object-cover rounded-xl md:max-w-200 md:max-h-[200px]"
    />
    </div>
</div>
    </div>
  );
};

export default HereSection;







// import { useNavigate } from "react-router-dom";
// import HereImage from "@/assets/hero_img.jpg";
// import {  DollarSign, Utensils, Wand } from "lucide-react";

// const HereSection = () => {
//   const navigate = useNavigate();

//   return (
//     <>
//       <div className="w-full fixed left-0">
//         {/* Top Half with Background */}
//         <div className="relative h-[60vh] w-screen overflow-x-hidden">
//           {/* Background Image */}
//           <div
//             className="absolute inset-0 bg-cover bg-center"
//             style={{ backgroundImage: `url(${HereImage})` }}
//           ></div>

//           {/* Dark Overlay */}
//           <div className="absolute inset-0 bg-black bg-opacity-60"></div>

//           {/* Content */}
//           <div className="relative z-10 flex flex-col items-center justify-center text-center text-white h-full px-4">
//             <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 leading-tight">
//               Order food anywhere & anytime
//             </h1>
//             <p className="text-base sm:text-lg md:text-2xl mb-6 max-w-[90%] sm:max-w-[70%]">
//               Your favorite meals, just a few clicks away.
//             </p>
//             <button
//               onClick={() =>
//                 navigate('/search/${encodeURIComponent(searchText.trim())}')
//               }
//               className="bg-orange-500 hover:bg-orange-600 text-black font-semibold py-3 px-6 rounded-full shadow"
//             >
//               Check our Menu
//             </button>
//           </div>
//         </div>

// <div className="relative z-40 -mt-44 px-2">

//          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
//           {/* Box 1 */}
//           <div className="bg-gray-700 text-white p-6 md:min-h-60 md:min-w-10 rounded-md shadow-lg text-center mt-24">
// <div className="flex justify-center items-center">
//             <Wand className="flex justify-center items-center w-16 h-16 text-gray-900" />

// </div>

//             <h3 className="text-xl font-semibold mb-2">Magical Atmosphere</h3>
//             <p>Wonderful serenity has taken possession of my entire soul,like these sweet mornings..</p>
//           </div>

//           {/* Box 2 */}
//           <div className="bg-gray-700 p-6 text-white rounded-md shadow-lg text-center mt-24">
//             <div className="flex justify-center items-center">
//             <Utensils className="flex justify-center items-center w-16 h-16 text-gray-900" />

// </div>
//             <h3 className="text-xl font-semibold mb-2">Best Food Quality</h3>
//             <p>Wonderful serenity has taken
//                  possession of my entire soul,
//                  like these sweet mornings.</p>
//           </div>

//           {/* Box 3 */}
//           <div className="bg-gray-700 p-6 text-white rounded-md shadow-lg text-center mt-24">
//             <div className="flex justify-center items-center">
//             <DollarSign className="flex justify-center items-center w-16 h-16 text-gray-900" />

// </div>
//             <h3 className="text-xl font-semibold mb-2">Low Costing Food</h3>
//             <p>Wonderful serenity has taken
//                  possession of my entire soul,
//                  like these sweet mornings.</p>
//           </div>
//         </div>
//       </div>

// <div className="pt-6 ">
//     <h2 className="font-bold text-2xl text-black max-w-3xl px-1 ">Discover Our Story</h2>
// <p>When the lovely valley teems with vapour around me,and the 
//     meridian sun strikes the upper surface of the impenetrable foliage
//     of my trees.
// </p>
// </div>



//       </div>

//     </>
//   );
// };

// export default HereSection;















// import { useState } from "react";
// import { Input } from "./ui/input";
// import { Search } from "lucide-react";
// import { Button } from "./ui/button";
// import HereImage from "@/assets/hero_img.jpg"
// import { useNavigate } from "react-router-dom";


// const HereSection=()=>{
// const[searchText,setSearchText]=useState<string>("")
// const navigate=useNavigate();
//     return(
//         <div className="flex flex-col md:flex-row max-w-7xl max-h-9xl mx-auto md:p-10 rounded-lg items-center justify-center m-9 gap-4">
// <div className="flex flex-col gap-10 md:w-[60%] md:h-[100%]">
//     <div className="flex text-left flex-col gap-3">
//     <h1 className="font-bold md:font-extrabold md:text-5xl text-4xl">{/*for mobile ky liyey 4xl r big device kyliyey 5xl*/}
//      Order food anywhere & anytime
//     </h1>
// <p className="text-gray-500">Your favorite meals, just a few clicks away.</p>
// </div>
// <div className="relative flex items-center gap-2">
 
// <Button onClick={()=> navigate('/search/${encodeURIComponent(searchText.trim())}')}className="bg-orange hover:bg-hoverOrange">Check our Menu</Button>
// </div>
// </div>
// <div className="flex-1 rounded-full">
//     <img src={HereImage}
//     alt=""
//     className="object-cover rounded-xl w-full max-h-[900px]"
//     />
// </div>

// </div>
//     )


// }

// export default HereSection;


























// import { useState } from "react";
// import { Input } from "./ui/input";
// import { Search } from "lucide-react";
// import { Button } from "./ui/button";
// import HereImage from "@/assets/hero_img.jpg"
// import { useNavigate } from "react-router-dom";


// const HereSection=()=>{
// const[searchText,setSearchText]=useState<string>("")
// const navigate=useNavigate();
//     return(
//         <div className="flex flex-col md:flex-row max-w-7xl max-h-9xl mx-auto md:p-10 rounded-lg items-center justify-center m-9 gap-4">
// <div className="flex flex-col gap-10 md:w-[60%] md:h-[150%]">
//     <div className="flex text-left flex-col gap-3">
//     <h1 className="font-bold md:font-extrabold md:text-5xl text-4xl">{/*for mobile ky liyey 4xl r big device kyliyey 5xl*/}
//      Order food anywhere & anytime
//     </h1>
// <p className="text-gray-500">Your favorite meals, just a few clicks away.</p>
// </div>
// <div className="relative flex items-center gap-2">

// <Input
// type="text"
// value={searchText}
// placeholder="Search restaurent by name,city & country"
// onChange={(e)=> setSearchText(e.target.value)}
// className="pl-10 w-full shadow-lg"
// />
// <Search className="text-gray-500 absolute inset-y-2 left-2"/>
 
// <Button onClick={()=> navigate('/search/${encodeURIComponent(searchText.trim())}')}className="bg-orange hover:bg-hoverOrange">Search</Button>
// </div>
// </div>
// <div className="flex-1 rounded-full">
//     <img src={HereImage}
//     alt=""
//     className="object-cover rounded-xl w-full max-h-[900px]"
//     />
// </div>

// </div>
//     )


// }

// export default HereSection;

