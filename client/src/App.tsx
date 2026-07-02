import './App.css'
import Login from './auth/Login.tsx'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Signup from './auth/Signup'
import ForgotPassword from './auth/ForgotPassword.tsx'
import ResetPassword from './auth/ResetPassword.tsx'
import VerifyEmail from "./auth/VerifyEmail"; 
import HereSection from './components/HereSection.tsx'
import MainLayout from './layout/MainLayout.tsx'
import Profile from './components/Profile.tsx'
import FilterPage from './components/FilterPage'
import SearchPage from './components/SearchPage.tsx' 



const appRouter=createBrowserRouter([
  {
    path:"/",
    element:<MainLayout/>,
    children:[
      {
        path:"/" ,
         element:<HereSection/>  
      },
      {
        path:"/profile" ,
         element:<Profile/>  
      },
{
        path:"/search/:text" ,
         element:<SearchPage/>  
      },
{
        path:"/filterPage" ,
         element:<FilterPage/>  
      },


    ]
  },
  {
    path:"/login",
    element:<Login/>  
  },
  {
    path:"/signup",
    element:<Signup/>  
  },
   {
    path:"/forgot-password",
    element:<ForgotPassword/>  
  },
    {
    path:"/reset-password",
    element:<ResetPassword/>  
  },
     {
    path:"/verify-email",
    element:<VerifyEmail/>  
  },
]

)
function App() {

  return (
    <main>
<RouterProvider router={appRouter}>

</RouterProvider>
     </main>
  )
}

export default App
