import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext/AuthContext";
import {
  LayoutDashboard,
  Package,
  Truck,
  Undo2,
  Boxes,
  ShoppingCart,
  BookText,
  Wallet,
  TrendingUp,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Package, label: "Product / Feed Master", path: "/dashboard/product" },
  { icon: Truck, label: "Factory Order", path: "/dashboard/factory-order" },
  { icon: Undo2, label: "Factory Return", path: "/dashboard/factory-return" },
  { icon: Undo2, label: "Company Ledger", path: "/dashboard/company-ledger" },
  { icon: Boxes, label: "Stock", path: "/dashboard/stock" },
  { icon: ShoppingCart, label: "Sale / Stock Out", path: "/dashboard/sale" },
  { icon: ShoppingCart, label: "Customer", path: "/dashboard/customers" },
  { icon: BookText, label: "Dokan Ledger", path: "/dashboard/ledger" },
  { icon: Wallet, label: "Expense", path: "/dashboard/expense" },
  { icon: TrendingUp, label: "Profit & Loss", path: "/dashboard/profit-loss" },
  { icon: Wallet, label: "Fund", path: "/dashboard/fund" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false); // desktop icon-only mode

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-30 md:hidden"
        />
      )}

      <aside
        className={`poppins-regular fixed md:static inset-y-0 left-0 z-40 min-h-screen bg-[#1f2b22] text-gray-300 shrink-0 flex flex-col
          transition-all duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
          ${collapsed ? "md:w-20" : "md:w-64"} w-64`}
      >
        {/* Brand */}
        <div className="px-5 pt-6 pb-4 border-b border-white/10 mb-2 flex items-center justify-between">
          <div className={`overflow-hidden ${collapsed ? "md:hidden" : ""}`}>
            <h1 className="text-white font-bold text-base whitespace-nowrap">
              Feed Inventory System
            </h1>
            <p className="text-xs text-gray-400 mt-1 whitespace-nowrap">
              Working Demo — MERN
            </p>
          </div>

          {/* mobile close */}
          <button
            onClick={onClose}
            className="md:hidden text-gray-400 hover:text-white p-1"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>

          {/* desktop collapse toggle */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex text-gray-400 hover:text-white p-1 shrink-0"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/dashboard"}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-3 text-sm border-l-2 transition-colors ${
                    collapsed ? "md:justify-center md:px-0" : ""
                  } ${
                    isActive
                      ? "bg-white/10 border-yellow-600 text-white font-semibold"
                      : "border-transparent text-gray-300 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon size={17} className="shrink-0" />
                <span className={`whitespace-nowrap ${collapsed ? "md:hidden" : ""}`}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom - user info + logout */}
        <div className="border-t border-white/10 px-5 py-4">
          {user && !collapsed && (
            <p className="text-xs text-gray-400 mb-3 truncate">{user.email}</p>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? "Logout" : undefined}
            className={`w-full flex items-center gap-2 text-sm text-red-300 hover:text-red-200 hover:bg-red-500/10 px-3 py-2 rounded-md transition-colors ${
              collapsed ? "md:justify-center" : ""
            }`}
          >
            <LogOut size={16} />
            <span className={collapsed ? "md:hidden" : ""}>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;