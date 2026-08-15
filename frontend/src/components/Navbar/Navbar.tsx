const Navbar = () => {
  return (
    <nav className="w-full flex items-center justify-between px-6 md:px-12 py-5 bg-white border-b border-gray-100">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full border-2 border-teal-900 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-teal-900" />
        </div>
        <span className="font-bold text-lg tracking-wide text-gray-800">
          DAILY
        </span>
      </div>

      <button
        type="button"
        className="bg-[#0f2e2e] hover:bg-[#123838] text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        Contact Now
      </button>
    </nav>
  );
};

export default Navbar;