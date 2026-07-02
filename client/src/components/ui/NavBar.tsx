import React from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarTrigger,
} from "@radix-ui/react-menubar";
import { Link } from "react-router-dom";
import { Button } from "./button";
import {
    Loader2,
    Moon,
    ShoppingCart,
    Sun,
    Menu,
    User,
    HandPlatter,
    Utensils,
    PackageCheck,
} from "lucide-react";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@radix-ui/react-avatar";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "./sheet";
import { Separator } from "@radix-ui/react-separator";

const NavBar = () => {
    const admin = true;
    const loading = false;

    return (
            <header className="w-full bg-white shadow-md fixed top-0 left-0 z-50">
                <div className="flex justify-between items-center h-16 max-w-7xl mx-auto px-6">
                    {/* Logo */}
                    <Link
                        to="/"
                        className="text-2xl font-bold md:font-extrabold text-gray-600"
                    >
                        FlavorCourt
                    </Link>

                    {/* Desktop Nav Links - Hidden on Mobile */}
                    <nav className="hidden md:flex items-center gap-6 text-gray-700 font-medium">
                        <Link to="/" className="hover:text-gray-500">Home</Link>
                        <Link to="/profile" className="hover:text-gray-500">Profile</Link>
                        <Link to="/order/status" className="hover:text-gray-500">Orders</Link>
                        {admin && (
                            <Menubar>
                                <MenubarMenu>
                                    <MenubarTrigger className="cursor-pointer hover:text-gray-500">
                                        Dashboard
                                    </MenubarTrigger>
                                    <MenubarContent>
                                        <Link to="/admin/restaurent"><MenubarItem>Restaurent</MenubarItem></Link>
                                        <Link to="/admin/menu"><MenubarItem>Menu</MenubarItem></Link>
                                        <Link to="/admin/orders"><MenubarItem>Orders</MenubarItem></Link>
                                    </MenubarContent>
                                </MenubarMenu>
                            </Menubar>
                        )}
                    </nav>

                    {/* Right Side - Hidden on Mobile */}
                    <div className="hidden md:flex items-center gap-4">
                        {/* Theme Toggle */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                                    <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                                    <span className="sr-only">Toggle theme</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem>Light</DropdownMenuItem>
                                <DropdownMenuItem>Dark</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Cart Icon */}
                        <Link to="/cart" className="relative cursor-pointer hover:text-gray-500">
                            <ShoppingCart className="w-5 h-5" />
                            <span className="absolute -top-2 -right-2 text-[10px] h-4 w-4 bg-red-500 text-white rounded-full flex items-center justify-center">
                                5
                            </span>
                        </Link>

                        {/* Logout Button */}
                        {loading ? (
                            <Button className="bg-orange hover:bg-hoverOrange">
                                <Loader2 className="animate-spin mr-2" /> Please wait
                            </Button>
                        ) : (
                            <Button className="bg-orange hover:bg-hoverOrange">Logout</Button>
                        )}

                        {/* Avatar */}
                        <Avatar>
                            <AvatarImage />
                            <AvatarFallback>CN</AvatarFallback>
                        </Avatar>
                    </div>
                    <MobileNavbar />
                </div>
            </header>
    );
};

export default NavBar;



const MobileNavbar = () => {
    const admin = false;
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                    <Menu className="w-6 h-6 rounded-full text-black hover:bg-gray-00" />
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="text-white">
                <SheetHeader>
                    <SheetTitle className="font-bold text-white">FoodCourt</SheetTitle>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon" className="fixed right-5 top-12">
                                <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                                <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                                <span className="sr-only">Toggle theme</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem>Light</DropdownMenuItem>
                            <DropdownMenuItem>Dark</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SheetHeader>
                <Separator className="my-2" />
                                    <SheetDescription>Navigate the app</SheetDescription>

                <div className="flex flex-col gap-4 mt-4">
                    <Link to="/profile" className="flex items-center gap-4  px-3 py-2 rounded-lg cursor-pointer font-medium hover:text-gray-200">
                        <User />
                        <span>Profile</span>
                    </Link>
                    <Link to="/cart" className="flex items-center gap-4  px-3 py-2 rounded-lg cursor-pointer font-medium hover:text-gray-200">
                        <HandPlatter />
                        <span>Order</span>
                    </Link>
                    <Link to="/" className="flex items-center gap-4  px-3 py-2 rounded-lg cursor-pointer font-medium hover:text-gray-200">
                        <ShoppingCart />
                        <span>Cart(0)</span>
                    </Link>
                    <Link to="/" className="flex items-center gap-4  px-3 py-2 rounded-lg cursor-pointer font-medium hover:text-gray-200">
                        <Utensils />
                        <span>Restaurant</span>
                    </Link>
                    <Link to="/" className="flex items-center gap-4  px-3 py-2 rounded-lg cursor-pointer font-medium hover:text-gray-200">
                        <PackageCheck />
                        <span>Restaurants Orders</span>
                    </Link>

                    {admin && (
                        <>
                            <Link to="/admin/restaurent" className="hover:text-gray-500">Restaurent</Link>
                            <Link to="/admin/menu" className="hover:text-gray-500">Menu</Link>
                            <Link to="/admin/orders" className="hover:text-gray-500">Orders</Link>
                        </>
                    )}
                </div>
                <div className="flex flex-col w-full gap-5">
<div className="flex flex-row items-center gap-2">
                        <Avatar>
                            <AvatarImage src="./"/>
                                <AvatarFallback>CN
                                </AvatarFallback>
                        </Avatar>
                        <h1 className="text-xl font-bold">Abeeha farooq</h1>
                    </div>

                    <SheetClose asChild>
                        <Button type="submit" variant="outline" className=" flex justify-center w-full bg-orange hover:bg-hoverOrange">Logout</Button>
                    </SheetClose>


                </div>
            </SheetContent>
        </Sheet >
    );
};
