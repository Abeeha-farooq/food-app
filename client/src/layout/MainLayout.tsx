import Footer from "@/components/Footer";
import NavBar from "@/components/ui/NavBar";
import { Outlet } from "react-router-dom";

const MainLayout = () => {
  return (
    // Why this layout is the way it is:
    //
    //   The NavBar inside <header> is `position: fixed` (top-0, z-50, h-16 = 64px).
    //   "Fixed" takes the navbar OUT of the normal document flow — so <main>
    //   would otherwise slide up underneath it and the top of every page would
    //   be hidden behind the nav. Adding `pt-16` (= padding-top: 4rem = 64px)
    //   on <main> pushes all page content down by exactly the navbar's height,
    //   so nothing is ever hidden.
    //
    //   We previously had `m-2 md:m-0` on the outer wrapper, which added a
    //   small mobile margin and zero on desktop. That tiny margin combined
    //   badly with the fixed-nav overlap, so we removed it and rely on
    //   per-page padding for breathing room.
    <div className="flex flex-col min-h-screen bg-gray-50/30">
      {/* Navbar */}
      <header>
        <NavBar />
      </header>

      {/* Main content — pt-16 clears the fixed navbar (h-16) */}
      <main className="flex-1 pt-16">
        <Outlet />
      </main>

      {/* Footer */}
      <footer>
        <Footer />
      </footer>
    </div>
  );
};

export default MainLayout;


















// import Footer from "@/components/Footer"
// import Navbar from "@/components/ui/NavBar"
// import { Outlet } from "react-router-dom"

// const MainLayout = () => {
//   return (
//     <div className="flex flex-col h-screen m-2 md:m-0">
//         {/* Navbar  */}
//         <header>
//             <Navbar/>
//         </header>
//         {/* Main content  */} 
//         <div className="flex-1">
//             <Outlet/>
//         </div>

//         {/* Footer  */}
//         <footer>
//             <Footer/>
//         </footer>
//     </div>
//   )
// }

// export default MainLayout