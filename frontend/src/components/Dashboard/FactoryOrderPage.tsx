import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface Fund {
  _id: string;
  name: string;
  balance: number;
}

interface FactoryOrder {
  _id: string;
  company: string;
  date: string;

  bagCount: number;
  weightPerBag: number;
  expectedTotalKg: number;

  returnedBags: number;
  status: "pending" | "partial" | "completed";

  bagPrice: number;
  totalBagPrice: number;
  bagPaidAmount: number;
  bagDue: number;

  advanceAmount: number;
  advanceFundName: string | null;
  createdAt: string;
}

const FactoryOrderPage = () => {
  const [orders, setOrders] = useState<FactoryOrder[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Searching
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [payBagModalOpen, setPayBagModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<FactoryOrder | null>(null);

  // Form states
  const [company, setCompany] = useState("");
  const [date] = useState(() => new Date().toISOString().slice(0, 10));
  const [bagCount, setBagCount] = useState("");
  const [weightPerBag, setWeightPerBag] = useState("");

  const [bagPrice, setBagPrice] = useState("");
  const [bagPaidAmount, setBagPaidAmount] = useState("");

  const [advanceAmount, setAdvanceAmount] = useState("");
  const [fundId, setFundId] = useState("");

  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // -----------------------------------------
  // Helpers
  // -----------------------------------------

  const safeNumber = (value: unknown): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const formatMoney = (value: unknown): string => {
    return safeNumber(value).toLocaleString();
  };

  // -----------------------------------------
  // Toast
  // -----------------------------------------

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg("");
    }, 2500);
  };

  // -----------------------------------------
  // Fetch Orders + Funds
  // -----------------------------------------

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, fundsRes] = await Promise.all([
        axiosInstance.get("/factory-orders"),
        axiosInstance.get("/funds"),
      ]);

      const normalizedOrders: FactoryOrder[] = (ordersRes.data || []).map((order: any) => ({
        ...order,
        bagCount: safeNumber(order.bagCount),
        weightPerBag: safeNumber(order.weightPerBag),
        expectedTotalKg: safeNumber(order.expectedTotalKg),
        returnedBags: safeNumber(order.returnedBags),
        bagPrice: safeNumber(order.bagPrice),
        totalBagPrice: safeNumber(order.totalBagPrice),
        bagPaidAmount: safeNumber(order.bagPaidAmount),
        bagDue: safeNumber(order.bagDue),
        advanceAmount: safeNumber(order.advanceAmount),
        advanceFundName: order.advanceFundName ?? null,
      }));

      const normalizedFunds: Fund[] = (fundsRes.data || []).map((fund: any) => ({
        ...fund,
        balance: safeNumber(fund.balance),
      }));

      setOrders(normalizedOrders);
      setFunds(normalizedFunds);
    } catch (err) {
      console.error("Factory Order fetch error:", err);
      showToast("⚠️ Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // -----------------------------------------
  // Derived Values
  // -----------------------------------------

  const totalBagPriceCalculated = (Number(bagCount) || 0) * (Number(bagPrice) || 0);
  const bagDueCalculated = totalBagPriceCalculated - (Number(bagPaidAmount) || 0);

  const advanceNum = Number(advanceAmount) || 0;
  const bagPaidNum = Number(bagPaidAmount) || 0;
  const totalDeduct = advanceNum + bagPaidNum;

  // -----------------------------------------
  // Save Factory Order
  // -----------------------------------------

  const handleSave = async () => {
    if (!company.trim()) return showToast("⚠️ Company Name is required");
    if (!bagCount || !weightPerBag) return showToast("⚠️ Bag count and weight are required");
    if (totalDeduct > 0 && !fundId) return showToast("⚠️ Select a fund for payment");
    if (Number(bagPaidAmount) > totalBagPriceCalculated) return showToast("⚠️ Payment cannot exceed total bag cost");

    setSaving(true);
    try {
      await axiosInstance.post("/factory-orders", {
        company,
        date,
        bagCount,
        weightPerBag,
        bagPrice,
        bagPaidAmount,
        advanceAmount: advanceNum || undefined,
        fundId: totalDeduct > 0 ? fundId : undefined,
      });

      showToast("✅ Order saved successfully");

      setCompany("");
      setBagCount("");
      setWeightPerBag("");
      setBagPrice("");
      setBagPaidAmount("");
      setAdvanceAmount("");
      setFundId("");
      setModalOpen(false);

      await fetchAll();
    } catch (err: any) {
      console.error("Factory Order save error:", err);
      showToast("⚠️ " + (err.response?.data?.message || "Something went wrong"));
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------
  // Pay Bag Due
  // -----------------------------------------

  const handlePayBagDue = async () => {
    const payAmt = Number(bagPaidAmount);
    if (!selectedOrder) return;
    const currentDue = safeNumber(selectedOrder.bagDue);

    if (payAmt <= 0 || payAmt > currentDue) return showToast("⚠️ Enter a valid amount");
    if (!fundId) return showToast("⚠️ Select a fund");

    setSaving(true);
    try {
      await axiosInstance.post(`/factory-orders/${selectedOrder._id}/pay-bag`, {
        amount: payAmt,
        fundId,
      });

      showToast("✅ Bag due paid successfully");
      setPayBagModalOpen(false);
      setSelectedOrder(null);
      setBagPaidAmount("");
      setFundId("");

      await fetchAll();
    } catch (err: any) {
      console.error("Pay bag due error:", err);
      showToast("⚠️ " + (err.response?.data?.message || "Payment failed"));
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------
  // Search & Pagination
  // -----------------------------------------

  const filteredOrders = orders.filter((o) =>
    String(o.company || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // -----------------------------------------
  // Render
  // -----------------------------------------

  return (
    <div className="text-gray-800">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2b22]">Factory Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track bag costs and factory advances. Product costs are managed in Returns.
          </p>
        </div>

        <button
          onClick={() => {
            setCompany("");
            setBagCount("");
            setWeightPerBag("");
            setBagPrice("");
            setBagPaidAmount("");
            setAdvanceAmount("");
            setFundId("");
            setModalOpen(true);
          }}
          className="bg-[#1f2b22] hover:bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-sm transition-colors"
        >
          + New Order
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by company name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full md:w-1/3 border border-gray-300 rounded-sm px-4 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-300 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300 text-gray-700 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Total Bags</th>
                  <th className="px-4 py-3 font-semibold">Bag Cost</th>
                  <th className="px-4 py-3 font-semibold">Bag Due</th>
                  <th className="px-4 py-3 font-semibold">Pending Bags</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {paginatedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-500">
                      No factory orders found.
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((o) => {
                    const bagCount = safeNumber(o.bagCount);
                    const returnedBags = safeNumber(o.returnedBags);
                    const totalBagPrice = safeNumber(o.totalBagPrice);
                    const bagDue = safeNumber(o.bagDue);
                    const pendingBags = Math.max(0, bagCount - returnedBags);

                    return (
                      <tr key={o._id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-[#1f2b22]">{o.company || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{o.date || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{bagCount}</td>
                        <td className="px-4 py-3 text-gray-600">৳{formatMoney(totalBagPrice)}</td>
                        <td className="px-4 py-3 text-red-600 font-medium">
                          {bagDue > 0 ? `৳${formatMoney(bagDue)}` : "0"}
                        </td>
                        <td className="px-4 py-3 font-medium text-amber-600">
                          {pendingBags}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {bagDue > 0 && (
                            <button
                              onClick={() => {
                                setSelectedOrder(o);
                                setBagPaidAmount("");
                                setFundId("");
                                setPayBagModalOpen(true);
                              }}
                              className="text-xs bg-white border border-gray-300 text-gray-800 hover:bg-gray-100 px-3 py-1.5 rounded-sm font-medium transition-colors"
                            >
                              Pay Due
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-t border-gray-300">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-sm disabled:opacity-50 hover:bg-gray-100 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-gray-600 font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-sm disabled:opacity-50 hover:bg-gray-100 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* =========================================
          ADD FACTORY ORDER MODAL
      ========================================= */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto shadow-lg">
            <div className="flex justify-between items-center mb-5 border-b border-gray-200 pb-3">
              <h2 className="text-xl font-bold text-[#1f2b22]">New Factory Order</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Company */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Company Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
                />
              </div>

              {/* Bags + Weight */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Total Bags <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    value={bagCount}
                    onChange={(e) => setBagCount(e.target.value)}
                    className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Weight Per Bag (kg) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    value={weightPerBag}
                    onChange={(e) => setWeightPerBag(e.target.value)}
                    className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
                  />
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* Bag Cost & Payment */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Price Per Bag (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={bagPrice}
                    onChange={(e) => setBagPrice(e.target.value)}
                    className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Paid For Bags (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={bagPaidAmount}
                    onChange={(e) => setBagPaidAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
                  />
                </div>
              </div>

              {/* Calculated Price Summary */}
              {totalBagPriceCalculated > 0 && (
                <div className="bg-gray-50 border border-gray-200 p-3 rounded-sm text-sm">
                  <span className="text-gray-600">Total Bag Cost: </span>
                  <span className="font-semibold">৳{formatMoney(totalBagPriceCalculated)}</span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="text-gray-600">Due: </span>
                  <span className="font-semibold text-red-600">৳{formatMoney(Math.max(0, bagDueCalculated))}</span>
                </div>
              )}

              {/* Advance Product Payment */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Product Advance (৳) <span className="text-gray-400 font-normal lowercase">- Optional</span></label>
                <input
                  type="number"
                  min="0"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
                />
              </div>

              {/* Fund Selection (only shows if money is being spent) */}
              {totalDeduct > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Payment Source</label>
                  <select
                    value={fundId}
                    onChange={(e) => setFundId(e.target.value)}
                    className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22] bg-white"
                  >
                    <option value="">Choose Fund (৳{formatMoney(totalDeduct)} will be deducted)</option>
                    {funds.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name} (Bal: ৳{formatMoney(f.balance)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2.5 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          PAY BAG DUE MODAL
      ========================================= */}
      {payBagModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-sm p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-lg font-bold text-[#1f2b22]">Pay Bag Due</h2>
              <button onClick={() => { setPayBagModalOpen(false); setSelectedOrder(null); }} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-3 rounded-sm mb-4">
              <p className="text-sm text-gray-700"><span className="font-semibold">Company:</span> {selectedOrder.company}</p>
              <p className="text-sm text-red-600 mt-1"><span className="font-semibold text-gray-700">Due Amount:</span> ৳{formatMoney(selectedOrder.bagDue)}</p>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Amount (৳)</label>
                <input
                  type="number"
                  min="0"
                  value={bagPaidAmount}
                  onChange={(e) => setBagPaidAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Source</label>
                <select
                  value={fundId}
                  onChange={(e) => setFundId(e.target.value)}
                  className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22] bg-white"
                >
                  <option value="">Select Fund</option>
                  {funds.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} (Bal: ৳{formatMoney(f.balance)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setPayBagModalOpen(false);
                  setSelectedOrder(null);
                }}
                className="flex-1 bg-white border border-gray-300 text-gray-800 py-2 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePayBagDue}
                disabled={saving}
                className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors"
              >
                {saving ? "Processing..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#1f2b22] text-white text-sm px-5 py-3 rounded-sm shadow-md z-50">
          {toastMsg}
        </div>
      )}
    </div>
  );
};

export default FactoryOrderPage;