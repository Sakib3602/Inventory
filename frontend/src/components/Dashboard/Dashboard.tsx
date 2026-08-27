import { useEffect, useState } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface DashboardData {
  totalSalesAmount: number;
  todaySalesAmount: number;
  totalProfit: number;
  totalDue: number;
  totalFundBalance: number;
  pendingOrdersCount: number;
  totalStockKg: number;
}

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axiosInstance.get("/dashboard-stats");
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-400">লোড হচ্ছে...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1f2b22]">Dashboard Summary</h1>
        <p className="text-sm text-gray-400 mt-0.5">সবকিছুর একনজরে হিসাব</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Sales */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">আজকের বিক্রি</p>
          <p className="text-2xl font-bold text-[#1f2b22]">৳{data?.todaySalesAmount.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">মোট বিক্রি</p>
          <p className="text-2xl font-bold text-[#1f2b22]">৳{data?.totalSalesAmount.toLocaleString()}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">মোট লাভ (Profit)</p>
          <p className="text-2xl font-bold text-emerald-700">৳{data?.totalProfit.toLocaleString()}</p>
        </div>

        {/* Due & Funds */}
        <div className="bg-red-50 border border-red-100 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">কাস্টমারদের মোট বাকি</p>
          <p className="text-2xl font-bold text-red-600">৳{data?.totalDue.toLocaleString()}</p>
        </div>
        <div className="bg-[#1f2b22] rounded-xl p-5 shadow-sm text-white">
          <p className="text-xs font-medium text-gray-300 uppercase tracking-wider mb-1">মোট ক্যাশ / ফান্ড ব্যালেন্স</p>
          <p className="text-2xl font-bold">৳{data?.totalFundBalance.toLocaleString()}</p>
        </div>

        {/* Stock & Orders */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">পেন্ডিং ফ্যাক্টরি অর্ডার</p>
          <p className="text-2xl font-bold text-amber-600">{data?.pendingOrdersCount} টি</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">স্টকে মোট মাল (Kg)</p>
          <p className="text-2xl font-bold text-[#1f2b22]">{data?.totalStockKg.toLocaleString()} Kg</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;