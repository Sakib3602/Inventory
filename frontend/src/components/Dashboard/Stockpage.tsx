import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface StockItem {
  _id: string;
  productId: string;
  productName: string;
  currentKg: number;
  updatedAt?: string;
}

interface Product {
  _id: string;
  name: string;
  category: string;
  purchasePricePerKg: number;
  salePricePerKg: number;
  status: string;
}

interface CombinedRow {
  productId: string;
  name: string;
  category: string;
  currentKg: number;
  purchasePricePerKg: number;
  salePricePerKg: number;
  stockValue: number; // currentKg × purchasePricePerKg — এই মুহূর্তে stock এর টাকার মূল্য
}

const LOW_STOCK_THRESHOLD = 100; // kg

const StockPage = () => {
  const [rows, setRows] = useState<CombinedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [stockRes, productsRes] = await Promise.all([
        axiosInstance.get("/stock"),
        axiosInstance.get("/products"),
      ]);

      const stockList: StockItem[] = stockRes.data;
      const products: Product[] = productsRes.data;

      // Stock এ যেসব product আছে তাদের সাথে Product master এর দাম merge করা
      const combined: CombinedRow[] = products.map((p) => {
        const stockEntry = stockList.find((s) => s.productId === p._id);
        const currentKg = stockEntry?.currentKg || 0;
        return {
          productId: p._id,
          name: p.name,
          category: p.category,
          currentKg,
          purchasePricePerKg: p.purchasePricePerKg || 0,
          salePricePerKg: p.salePricePerKg || 0,
          stockValue: currentKg * (p.purchasePricePerKg || 0),
        };
      });

      setRows(combined);
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || "Data লোড করতে সমস্যা হয়েছে");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredRows = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  const totalStockKg = rows.reduce((s, r) => s + r.currentKg, 0);
  const totalStockValue = rows.reduce((s, r) => s + r.stockValue, 0);
  const lowStockItems = rows.filter((r) => r.currentKg > 0 && r.currentKg < LOW_STOCK_THRESHOLD);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1f2b22]">Stock</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            শুধু দেখার পেজ — Factory Return থেকে বাড়ে, Sale থেকে কমে
          </p>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3 mb-4">
          {loadError}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-[#1f2b22]">{totalStockKg.toLocaleString()} kg</p>
          <p className="text-xs text-gray-400 mt-1">মোট Stock (সব Product মিলিয়ে)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-emerald-700">৳{totalStockValue.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">মোট Stock এর Purchase Value</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-red-500">{lowStockItems.length}</p>
          <p className="text-xs text-gray-400 mt-1">Low Stock Item ({LOW_STOCK_THRESHOLD}kg এর নিচে)</p>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3 mb-4">
          ⚠️ কম আছে: {lowStockItems.map((r) => r.name).join(", ")}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Product নাম দিয়ে খুঁজো..."
        className="w-full md:w-80 border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1f2b22]/20"
      />

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">লোড হচ্ছে...</div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
          কোনো Product পাওয়া যায়নি
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500 text-xs uppercase">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">বর্তমান Stock</th>
                  <th className="px-4 py-3">Purchase ৳/kg</th>
                  <th className="px-4 py-3">Sale ৳/kg</th>
                  <th className="px-4 py-3">Stock Value</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const isLow = r.currentKg > 0 && r.currentKg < LOW_STOCK_THRESHOLD;
                  const isEmpty = r.currentKg === 0;
                  return (
                    <tr key={r.productId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-3 font-medium text-[#1f2b22]">{r.name}</td>
                      <td className="px-4 py-3 text-gray-600">{r.category}</td>
                      <td className="px-4 py-3 font-semibold text-[#1f2b22]">
                        {r.currentKg.toLocaleString()} kg
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.purchasePricePerKg > 0 ? `৳${r.purchasePricePerKg.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.salePricePerKg > 0 ? `৳${r.salePricePerKg}` : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">৳{r.stockValue.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {isEmpty ? (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                            Stock নেই
                          </span>
                        ) : isLow ? (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600">
                            কম আছে
                          </span>
                        ) : (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                            ঠিক আছে
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            {filteredRows.map((r) => {
              const isLow = r.currentKg > 0 && r.currentKg < LOW_STOCK_THRESHOLD;
              const isEmpty = r.currentKg === 0;
              return (
                <div key={r.productId} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-[#1f2b22]">{r.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.category}</p>
                    </div>
                    {isEmpty ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                        Stock নেই
                      </span>
                    ) : isLow ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600">
                        কম আছে
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                        ঠিক আছে
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-[#1f2b22] mt-2">{r.currentKg.toLocaleString()} kg</p>
                  <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Purchase: ৳{r.purchasePricePerKg.toFixed(2)}/kg</span>
                    <span>Sale: ৳{r.salePricePerKg}/kg</span>
                    <span>Value: ৳{r.stockValue.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default StockPage;