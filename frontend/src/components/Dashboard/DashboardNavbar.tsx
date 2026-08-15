import { Menu } from "lucide-react";

interface DashboardNavbarProps {
  onMenuClick: () => void;
}

const DashboardNavbar = ({ onMenuClick }: DashboardNavbarProps) => {
  return (
    <header className="poppins-regular w-full bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center gap-3">
      <button
        onClick={onMenuClick}
        className="md:hidden text-gray-600 hover:text-gray-900 p-1.5 -ml-1 rounded-md hover:bg-gray-100"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      <div>
        <h2 className="text-base md:text-lg font-semibold text-gray-800">
          Welcome back <span className="text-gray-400 font-normal">👋</span>
        </h2>
        <p className="text-xs md:text-sm text-gray-400 mt-0.5">
          আপনার ব্যবসার সব হিসাব এক জায়গায়
        </p>
      </div>
    </header>
  );
};

export default DashboardNavbar;