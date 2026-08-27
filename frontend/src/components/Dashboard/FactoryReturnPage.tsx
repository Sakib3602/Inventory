import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface Fund {
  _id: string;
  name: string;
  balance: number;
}
interface Product {
  _id: string;
  name: string;
  bagSize: number;
}
interface Company {
  _id: string;
  name: string;
  advanceBalance: number;
}
interface FactoryOrder {
  _id: string;
  company: string;
  companyId: string;
  date: string;
  bagCount: number;
  weightPerBag: number;
  returnedBags: number;
  status: string;
}

interface ReturnItemInput {
  productId: string;
  bagCount: string;
  amount: string; // Only product amount
}

interface FactoryReturn {
  _id: string;
  company: string;
  date: string;
  items: {
    productName: string;
    bagCount: number;
    totalKg: number;
    amount: number;
    costPerKgWithoutBag: number;
    costPerKgWithBag: number;
    bagSize?: number;
  }[];
  totalBillAmount: number;
  advanceUsed: number;
  remainingPaid: number;
  totalKg: number;
  totalBagsUsed: number;
  fundName: string | null;
  orderId: string;
}

const emptyItem = (): ReturnItemInput => ({ productId: "", bagCount: "", amount: "" });

const FactoryReturnPage = () => {
  const [pendingOrders, setPendingOrders] = useState<FactoryOrder[]>([]);
  const [allOrders, setAllOrders] = useState<FactoryOrder[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [returns, setReturns] = useState<FactoryReturn[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Search
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fundId, setFundId] = useState("");
  const [items, setItems] = useState<ReturnItemInput[]>([emptyItem()]);
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

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2800);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, productsRes, fundsRes, returnsRes, companiesRes] = await Promise.all([
        axiosInstance.get("/factory-orders"),
        axiosInstance.get("/products", { params: { status: "active" } }),
        axiosInstance.get("/funds"),
        axiosInstance.get("/factory-returns"),
        axiosInstance.get("/companies"),
      ]);
      setAllOrders(ordersRes.data);
      setPendingOrders(ordersRes.data.filter((o: FactoryOrder) => o.status !== "completed"));
      setProducts(productsRes.data);
      setFunds(fundsRes.data);
      setReturns(returnsRes.data);
      setCompanies(companiesRes.data);
    } catch (err: any) {
      showToast("⚠️ Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // -----------------------------------------
  // Derived Values & Calculations
  // -----------------------------------------

  const selectedOrder = pendingOrders.find((o) => o._id === selectedOrderId);
  const pendingBags = selectedOrder ? selectedOrder.bagCount - selectedOrder.returnedBags : 0;
  const selectedCompany = selectedOrder ? companies.find((c) => c._id === selectedOrder.companyId) : undefined;
  const availableAdvance = selectedCompany?.advanceBalance || 0;

  const updateItem = (index: number, field: keyof ReturnItemInput, value: string) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addItemRow = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItemRow = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const calcLine = (item: ReturnItemInput) => {
    const bags = Number(item.bagCount) || 0;
    const amount = Number(item.amount) || 0;
    const product = products.find((p) => p._id === item.productId);
    const bagSize = selectedOrder?.weightPerBag || product?.bagSize || 0;
    const totalKg = bags * bagSize;
    return { totalKg, bagSize, amount };
  };

  const totalBagsUsed = items.reduce((s, it) => s + (Number(it.bagCount) || 0), 0);
  const totalKgAll = items.reduce((s, it) => s + calcLine(it).totalKg, 0);
  const totalBillAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const advanceUsed = Math.min(availableAdvance, totalBillAmount);
  const remainingToPay = totalBillAmount - advanceUsed;

  // -----------------------------------------
  // Actions
  // -----------------------------------------

  const handleSave = async () => {
    if (!selectedOrderId) return showToast("⚠️ Select an order");
    const validItems = items.filter((it) => it.productId && it.bagCount && it.amount);
    if (validItems.length === 0) return showToast("⚠️ Fill at least one product properly");
    if (totalBagsUsed > pendingBags) return showToast(`⚠️ Only ${pendingBags} bags pending`);
    if (remainingToPay > 0 && !fundId) return showToast("⚠️ Select a payment source for the due amount");

    const payloadItems = validItems.map((it) => {
      const { totalKg } = calcLine(it);
      return { productId: it.productId, bagCount: it.bagCount, totalKg, amount: it.amount };
    });

    setSaving(true);
    try {
      await axiosInstance.post("/factory-returns", {
        orderId: selectedOrderId,
        date,
        fundId: remainingToPay > 0 ? fundId : undefined,
        items: payloadItems,
      });
      showToast("✅ Return saved successfully");
      setModalOpen(false);
      fetchAll();
    } catch (err: any) {
      showToast("⚠️ " + (err.response?.data?.message || "Something went wrong"));
    } finally {
      setSaving(false);
    }
  };

  const getBagsStatusForReturn = (ret: FactoryReturn) => {
    const order = allOrders.find((o) => o._id === ret.orderId);
    if (!order) return null;
    return { totalOrdered: order.bagCount, remaining: order.bagCount - order.returnedBags };
  };

  // -----------------------------------------
  // Search & Pagination
  // -----------------------------------------

  const filteredReturns = returns.filter((r) => r.company.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);
  const paginatedReturns = filteredReturns.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="text-gray-800">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2b22]">Factory Returns</h1>
          <p className="text-sm text-gray-500 mt-1">Log received products and exact product bills. Bag costs are recorded in Factory Orders.</p>
        </div>
        <button
          onClick={() => { setSelectedOrderId(""); setItems([emptyItem()]); setModalOpen(true); }}
          disabled={pendingOrders.length === 0}
          className="bg-[#1f2b22] hover:bg-black text-white px-5 py-2.5 rounded-sm text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          + New Return
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by company name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          className="w-full md:w-1/3 border border-gray-300 rounded-sm px-4 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="flex flex-col gap-4">
          {paginatedReturns.length === 0 ? (
            <div className="text-center py-10 border border-gray-200 bg-white rounded-sm text-gray-500">No factory returns found.</div>
          ) : (
            paginatedReturns.map((r) => {
              const bagsStatus = getBagsStatusForReturn(r);
              return (
                <div key={r._id} className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
                  <div className="flex justify-between items-start gap-2 mb-4">
                    <div>
                      <p className="text-lg font-bold text-[#1f2b22]">{r.company}</p>
                      <p className="text-xs text-gray-500 mt-1">{r.date} <span className="mx-1">•</span> Received: {r.totalBagsUsed} Bags</p>
                      {bagsStatus && (
                        <p className="text-xs mt-1 text-gray-500 font-medium">
                          Order: {bagsStatus.totalOrdered} Bags <span className="mx-1">|</span> 
                          Pending: {bagsStatus.remaining > 0 ? <span className="text-amber-600">{bagsStatus.remaining}</span> : <span className="text-emerald-600">Fully Received</span>}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#1f2b22] text-lg">Bill: ৳{formatMoney(r.totalBillAmount)}</p>
                      <p className="text-xs text-gray-500 mt-1">Advance Deducted: ৳{formatMoney(r.advanceUsed)} <span className="mx-1">|</span> New Payment: ৳{formatMoney(r.remainingPaid)}</p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-3 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-gray-500 border-b border-gray-200 text-xs uppercase tracking-wide">
                        <tr>
                          <th className="pb-2 font-semibold">Product</th>
                          <th className="pb-2 font-semibold">Bags</th>
                          <th className="pb-2 font-semibold">Total Kg</th>
                          <th className="pb-2 font-semibold">Product Bill</th>
                          <th className="pb-2 font-semibold text-emerald-600">৳/kg (W/O Bag)</th>
                          <th className="pb-2 font-semibold text-amber-600">৳/kg (With Bag)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.items.map((it, i) => (
                          <tr key={i} className="text-gray-700 border-b border-gray-100 last:border-0">
                            <td className="py-2 font-medium text-[#1f2b22]">{it.productName}</td>
                            <td className="py-2">{it.bagCount}</td>
                            <td className="py-2">{it.totalKg}</td>
                            <td className="py-2">৳{formatMoney(it.amount)}</td>
                            <td className="py-2 font-semibold text-emerald-600">৳{it.costPerKgWithoutBag?.toFixed(2)}</td>
                            <td className="py-2 font-semibold text-amber-600">৳{it.costPerKgWithBag?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border border-gray-300 rounded-sm">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="text-xs bg-white border border-gray-300 hover:bg-gray-100 transition-colors px-3 py-1.5 rounded-sm disabled:opacity-50">Previous</button>
              <span className="text-xs text-gray-600 font-medium">Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="text-xs bg-white border border-gray-300 hover:bg-gray-100 transition-colors px-3 py-1.5 rounded-sm disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}

      {/* =========================================
          RETURN ADD MODAL
      ========================================= */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-lg">
            <div className="flex justify-between items-center mb-5 border-b border-gray-200 pb-3">
              <h2 className="text-xl font-bold text-[#1f2b22]">New Factory Return</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Order <span className="text-red-500">*</span></label>
                <select value={selectedOrderId} onChange={(e) => setSelectedOrderId(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                  <option value="">Pending Orders</option>
                  {pendingOrders.map((o) => (
                    <option key={o._id} value={o._id}>{o.company} — {o.bagCount - o.returnedBags} bags pending ({o.weightPerBag}kg/bag)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date <span className="text-red-500">*</span></label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
              </div>
            </div>

            {selectedOrder && (
              <p className="text-xs text-amber-600 font-medium mb-4 bg-amber-50 p-2 border border-amber-200 rounded-sm">
                Expected: {pendingBags} bags (~{selectedOrder.weightPerBag}kg/bag)
              </p>
            )}

            <div className="flex flex-col gap-4">
              <label className="block text-xs font-bold text-gray-700 uppercase">Received Products</label>
              
              {items.map((item, index) => (
                <div key={index} className="bg-gray-50 border border-gray-200 rounded-sm p-4 relative">
                  {items.length > 1 && (
                    <button onClick={() => removeItemRow(index)} className="absolute top-2 right-2 text-red-500 text-xl leading-none font-bold hover:text-red-700" title="Remove Item">&times;</button>
                  )}
                  
                  <div className="mb-3 w-11/12">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Product <span className="text-red-500">*</span></label>
                    <select value={item.productId} onChange={(e) => updateItem(index, "productId", e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                      <option value="">Choose Product</option>
                      {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Bag Count <span className="text-red-500">*</span></label>
                      <input type="number" min="0" value={item.bagCount} onChange={(e) => updateItem(index, "bagCount", e.target.value)} placeholder="0" disabled={!selectedOrderId} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22] disabled:bg-gray-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Product Bill (৳) <span className="text-red-500">*</span></label>
                      <input type="number" min="0" value={item.amount} onChange={(e) => updateItem(index, "amount", e.target.value)} placeholder="0" disabled={!selectedOrderId} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22] disabled:bg-gray-100" />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addItemRow} disabled={!selectedOrderId} className="text-sm text-[#1f2b22] font-semibold border border-dashed border-gray-300 rounded-sm py-2 hover:bg-gray-50 transition-colors disabled:opacity-40">
                + Add Another Product
              </button>
            </div>

            <hr className="border-gray-200 my-5" />

            <div className="bg-gray-50 border border-gray-200 rounded-sm p-4 text-sm flex flex-col gap-2">
              <div className="flex justify-between text-gray-600"><span>Bags Received:</span> <span>{totalBagsUsed} / {pendingBags} pending</span></div>
              <div className="flex justify-between text-gray-600"><span>Total Product Bill:</span> <span>৳{formatMoney(totalBillAmount)}</span></div>
              {advanceUsed > 0 && <div className="flex justify-between text-emerald-600 font-medium"><span>Advance Deduction:</span> <span>-৳{formatMoney(advanceUsed)}</span></div>}
              <div className="flex justify-between font-bold text-[#1f2b22] border-t border-gray-200 pt-2 mt-1 text-base"><span>Amount Payable:</span> <span>৳{formatMoney(remainingToPay)}</span></div>
            </div>

            {remainingToPay > 0 && (
              <div className="mt-4">
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Source <span className="text-red-500">*</span></label>
                <select value={fundId} onChange={(e) => setFundId(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                  <option value="">Select Fund</option>
                  {funds.map((f) => <option key={f._id} value={f._id}>{f.name} (Bal: ৳{formatMoney(f.balance)})</option>)}
                </select>
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2.5 text-sm font-semibold rounded-sm transition-colors disabled:opacity-50">
                {saving ? "Processing..." : "Submit Return"}
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

export default FactoryReturnPage;