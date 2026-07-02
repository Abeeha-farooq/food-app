import {
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  MapPin,
  Phone,
  Mail
} from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-gray-300 py-10 px-6 mt-20 w-full">
      <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        
        {/* Logo + Description */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">FlavourCourt</h2>
          <p className="text-sm text-gray-400">
            Bringing magical flavors to your doorstep.
          </p>
        </div>

        {/* Contact Info */}
        <div>
          <h3 className="text-xl font-semibold text-white mb-3">Contact</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              123 FlavourCourt St, London
            </li>
            <li className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              +92 300 1234567
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              contact@flavourCourt.com
            </li>
          </ul>
        </div>

        {/* Social Media */}
        <div>
          <h3 className="text-xl font-semibold text-white mb-3">Follow Us</h3>
          <div className="flex space-x-4">
            <a href="#" className="hover:text-white"><Facebook /></a>
            <a href="#" className="hover:text-white"><Instagram /></a>
            <a href="#" className="hover:text-white"><Twitter /></a>
            <a href="#" className="hover:text-white"><Youtube /></a>
          </div>
        </div>
      </div>

      {/* Bottom line */}
      <div className="mt-10 text-center text-xs text-gray-500 border-t border-gray-700 pt-4">
        &copy; {new Date().getFullYear()} FoodieSpot. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
