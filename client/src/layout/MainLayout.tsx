import Footer from "@/components/Footer";
import NavBar from "@/components/ui/NavBar";
import { Outlet } from "react-router-dom";

const MainLayout = () => {
  return (
    <div className="flex flex-col m-2 md:m-0">
      {/* Navbar */}
      <header>
        <NavBar />
      </header>

      {/* Main content */}
      <main className="flex-1">
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