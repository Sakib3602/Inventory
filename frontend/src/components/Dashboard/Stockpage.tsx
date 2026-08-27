import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface StockItem {
  _id: string;
  productId: string;
  productName: string;
  currentKg: number;
  bagSize: number;
  fullBags: number;
  brokenKg: number;
  updatedAt?: string;
  lastReturnDate?: string;
  costPerKgWithoutBag?: number;
  costPerKgWithBag?: number;
}

interface Product {
  _id: string;
  name: string;
  category: string;
  salePrices?: { bagSize: number; salePrice: number }[];
}

interface CombinedRow {
  productId: string;
  name: string;
  category: string;
  currentKg: number;
  fullBags: number;
  batches: StockItem[];
}

type SortOption = "name_asc" | "name_desc" | "kg_desc" | "kg_asc" | "bags_desc" | "bags_asc";

const StockPage = () => {
  const [rows, setRows] = useState<CombinedRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Search, Sort & Pagination
  const [search, setSearch] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("name_asc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [selectedRow, setSelectedRow] = useState<CombinedRow | null>(null);

  // -----------------------------------------
  // Helpers
  // -----------------------------------------
  const formatNumber = (num: number) => {
    return Number.isFinite(num) ? num.toLocaleString() : "0";
  };

  // -----------------------------------------
  // Fetch Data
  // -----------------------------------------
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stockRes, productsRes] = await Promise.all([
        axiosInstance.get("/stock"),
        axiosInstance.get("/products"),
      ]);

      const stockList: StockItem[] = stockRes.data;
      const products: Product[] = productsRes.data;

      const combined: CombinedRow[] = products
        .map((p) => {
          const batches = stockList.filter((s) => s.productId === p._id);
          const currentKg = batches.reduce((sum, b) => sum + (b.currentKg || 0), 0);
          const fullBags = batches.reduce((sum, b) => sum + (b.fullBags || 0), 0);

          return {
            productId: p._id,
            name: p.name,
            category: p.category,
            currentKg,
            fullBags,
            batches,
          };
        })
        .filter((r) => r.currentKg > 0); // Only show products that have stock

      setRows(combined);
    } catch (err: any) {
      console.error("Stock fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // -----------------------------------------
  // Filtering & Sorting Logic
  // -----------------------------------------
  const filteredRows = rows.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const sortedRows = [...filteredRows].sort((a, b) => {
    switch (sortOption) {
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "kg_desc":
        return b.currentKg - a.currentKg;
      case "kg_asc":
        return a.currentKg - b.currentKg;
      case "bags_desc":
        return b.fullBags - a.fullBags;
      case "bags_asc":
        return a.fullBags - b.fullBags;
      default:
        return 0;
    }
  });

  // -----------------------------------------
  // Pagination Logic
  // -----------------------------------------
  const totalPages = Math.ceil(sortedRows.length / itemsPerPage);
  const paginatedRows = sortedRows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Global Totals
  const totalGlobalBags = rows.reduce((s, r) => s + r.fullBags, 0);
  const totalGlobalKg = rows.reduce((s, r) => s + r.currentKg, 0);

  return (
    <div className="text-gray-800">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1f2b22]">Current Stock</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor your inventory, bag breakdowns, and cost analysis.
        </p>
      </div>

      {/* Global Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#1f2b22] text-white border border-[#1f2b22] rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">Total Inventory Weight</p>
          <p className="text-2xl font-bold">{formatNumber(totalGlobalKg)} kg</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Bags in Godown</p>
          <p className="text-2xl font-bold text-[#1f2b22]">{formatNumber(totalGlobalBags)} Bags</p>
        </div>
      </div>

      {/* Controls: Search & Sort */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by product name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="flex-1 border border-gray-300 rounded-sm px-4 py-2.5 text-sm focus:outline-none focus:border-[#1f2b22]"
        />
        
        <select
          value={sortOption}
          onChange={(e) => {
            setSortOption(e.target.value as SortOption);
            setCurrentPage(1);
          }}
          className="w-full md:w-64 border border-gray-300 rounded-sm px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1f2b22]"
        >
          <option value="name_asc">Sort by Name (A-Z)</option>
          <option value="name_desc">Sort by Name (Z-A)</option>
          <option value="kg_desc">Highest Stock (Kg)</option>
          <option value="kg_asc">Lowest Stock (Kg)</option>
          <option value="bags_desc">Highest Bags Count</option>
          <option value="bags_asc">Lowest Bags Count</option>
        </select>
      </div>

      {/* Product Cards Grid */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading stock data...</div>
      ) : paginatedRows.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm bg-white border border-gray-300 rounded-sm">
          No stock available.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedRows.map((r) => (
              <div key={r.productId} className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm flex flex-col justify-between hover:border-[#1f2b22] transition-colors">
                
                {/* Card Header */}
                <div className="mb-4 border-b border-gray-100 pb-3">
                  <h3 className="text-lg font-bold text-[#1f2b22]">{r.name}</h3>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">{r.category}</p>
                </div>

                {/* Card Body: Overall Stats */}
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Stock</p>
                    <p className="text-lg font-bold text-[#1f2b22]">{formatNumber(r.currentKg)} kg</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Bags</p>
                    <p className="text-lg font-bold text-emerald-700">{formatNumber(r.fullBags)}</p>
                  </div>
                </div>

                {/* Bag Breakdown */}
                <div className="bg-gray-50 border border-gray-200 rounded-sm p-3 mb-4">
                  <p className="text-xs font-bold text-gray-600 uppercase mb-2">Bag Breakdown</p>
                  <div className="flex flex-col gap-1.5">
                    {r.batches.length === 0 ? (
                      <span className="text-xs text-gray-400">No structured bags found.</span>
                    ) : (
                      r.batches.map(b => (
                        <div key={b._id} className="flex justify-between text-sm">
                          <span className="font-medium text-gray-700">{b.bagSize}kg Bag:</span>
                          <span className="font-bold text-[#1f2b22]">{b.fullBags} bags</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Action */}
                <button
                  onClick={() => setSelectedRow(r)}
                  className="w-full bg-white border border-gray-300 text-[#1f2b22] hover:bg-gray-50 py-2 text-sm font-bold rounded-sm transition-colors mt-auto"
                >
                  View Cost Analysis &rarr;
                </button>

              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 bg-white border border-gray-300 rounded-sm">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="text-xs bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-sm disabled:opacity-50 transition-colors font-semibold"
              >
                Previous
              </button>
              <span className="text-xs text-gray-600 font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="text-xs bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-sm disabled:opacity-50 transition-colors font-semibold"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Batch Details & Cost Modal */}
      {selectedRow && (
        <div
          className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="bg-white rounded-sm w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5 border-b border-gray-200 pb-3">
              <div>
                <h2 className="text-xl font-bold text-[#1f2b22]">{selectedRow.name}</h2>
                <p className="text-sm text-gray-500 mt-1">Cost Analysis by Bag Size</p>
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                className="text-gray-400 hover:text-[#1f2b22] text-2xl font-bold leading-none transition-colors"
              >
                &times;
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {selectedRow.batches.map((batch) => {
                const bagSize = batch.bagSize || 1;
                const perBagWithoutBag = (batch.costPerKgWithoutBag || 0) * bagSize;
                const perBagWithBag = (batch.costPerKgWithBag || 0) * bagSize;

                return (
                  <div
                    key={batch._id}
                    className="border border-gray-200 rounded-sm p-4 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-bold text-[#1f2b22] text-lg">
                        {bagSize}kg Bag
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Stock: <span className="font-bold text-gray-700">{batch.fullBags} bags</span> ({formatNumber(batch.currentKg)} kg)
                      </p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-2">
                        Last Return: {batch.lastReturnDate || "N/A"}
                      </p>
                    </div>
                    
                    <div className="text-left md:text-right border-t md:border-t-0 border-gray-200 pt-3 md:pt-0 mt-2 md:mt-0">
                      <div className="mb-2">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Excluding Bag Cost</p>
                        <p className="text-sm font-semibold text-emerald-700">
                          ৳{batch.costPerKgWithoutBag?.toFixed(2) || "0.00"}/kg <span className="text-gray-400 mx-1">|</span> ৳{perBagWithoutBag.toFixed(2)}/bag
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Including Bag Cost</p>
                        <p className="text-sm font-bold text-amber-600">
                          ৳{batch.costPerKgWithBag?.toFixed(2) || "0.00"}/kg <span className="text-gray-400 mx-1">|</span> ৳{perBagWithBag.toFixed(2)}/bag
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-6 text-right">
              <button
                onClick={() => setSelectedRow(null)}
                className="bg-[#1f2b22] text-white px-6 py-2 text-sm font-bold rounded-sm hover:bg-[#28392f] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockPage;