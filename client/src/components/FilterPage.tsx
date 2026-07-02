// FilterPage.tsx
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const cuisineOptions = ["Desi", "Pizza", "Burger", "Starter", "Dessert", "Drinks"];
const priceRanges = ["Low", "Medium", "High"];

const FilterPage = () => {
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [selectedPrices, setSelectedPrices] = useState<string[]>([]);

  const handleCuisineToggle = (value: string) => {
    setSelectedCuisines(prev =>
      prev.includes(value) ? prev.filter(c => c !== value): [...prev, value]
    );
  };

  const handlePriceToggle = (value: string) => {
    setSelectedPrices(prev =>
      prev.includes(value)
        ? prev.filter(p => p !== value)
        : [...prev, value]
    );
  };

  return (
    <div>
      <div className="w-full md:w-90 p-6 h-auto shadow-md">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Filters</h2>
          <div>
            <div className="flex flex-col gap-1">
              <h3 className="font-medium ">Cuisine</h3>

{cuisineOptions.map((cuisine, idx) => (
                <>          
                  <Label key={idx} className="flex items-center gap-2 pb-2">

                  <Checkbox
                    checked={selectedCuisines.includes(cuisine)}
                    onCheckedChange={() => handleCuisineToggle(cuisine)}
                  />
                  {cuisine}
                </Label>
                </>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-medium mb-2">Price Range</h3>
            <div className="flex flex-col gap-4">
              {priceRanges.map((price, idx) => (
                <Label key={idx} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedPrices.includes(price)}
                    onCheckedChange={() => handlePriceToggle(price)}
                  />
                  {price}
                </Label>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>


    //   <div className="w-full md:w-70">
    //     <div className="flex flex-col gap-4">
    //       <h2 className="text-lg font-bold">Filters</h2>

    //       <div>
    //         <h3 className="font-medium mb-2">Cuisines</h3>
    //         <div className="flex flex-col gap-2">
    //           {cuisineOptions.map((cuisine, idx) => (
    //             <Label key={idx} className="flex items-center gap-2">
    //               <Checkbox
    //                 checked={selectedCuisines.includes(cuisine)}
    //                 onCheckedChange={() => handleCuisineToggle(cuisine)}
    //               />
    //               {cuisine}
    //             </Label>
    //           ))}
    //         </div>
    //       </div>

    //       <div>
    //         <h3 className="font-medium mb-2">Price Range</h3>
    //         <div className="flex flex-col gap-2">
    //           {priceRanges.map((price, idx) => (
    //             <Label key={idx} className="flex items-center gap-2">
    //               <Checkbox
    //                 checked={selectedPrices.includes(price)}
    //                 onCheckedChange={() => handlePriceToggle(price)}
    //               />
    //               {price}
    //             </Label>
    //           ))}
    //         </div>
    //       </div>
    //     </div>
    //   </div>
  );

};

export default FilterPage;
