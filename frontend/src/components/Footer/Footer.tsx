const Footer = () => {
  return (
    <footer className="w-full px-6 md:px-12 py-6 bg-white border-t border-gray-100">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-400">
        <p>© {new Date().getFullYear()} DAILY Inventory Management. সব অধিকার সংরক্ষিত।</p>
        <div className="flex gap-5">
          <a href="#" className="hover:text-gray-600">Privacy Policy</a>
          <a href="#" className="hover:text-gray-600">Terms</a>
          <a href="#" className="hover:text-gray-600">Support</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;