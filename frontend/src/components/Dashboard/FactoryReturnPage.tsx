import { useEffect, useState, useCallback, useMemo } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface Fund { _id: string; name: string; balance: number; }
interface Product { _id: string; name: string; bagSize: number; }
interface FactoryOrder {
  _id: string; bagSupplier: string; date: string; bagName: string;
  bagCount: number; weightPerBag: number; sentBags: number; returnedBags: number; status: string;
}
interface BagDispatch { _id: string; orderId: string; factory: string; factoryId: string; count: number; }
interface FactoryReturn {
  _id: string; company: string; companyId: string; bagCompany?: string; date: string;
  items: { productName: string; bagCount: number; totalKg: number; amount: number; costPerKgWithoutBag: number; costPerKgWithBag: number; bagSize?: number; }[];
  totalBillAmount: number; advanceUsed: number; remainingPaid: number; totalKg: number; totalBagsUsed: number; fundName: string | null; orderId: string;
}

interface ReturnItemInput { productId: string; bagCount: string; amount: string; }

const emptyItem = (): ReturnItemInput => ({ productId: "", bagCount: "", amount: "" });

const FactoryReturnPage = () => {
  const [allOrders, setAllOrders] = useState<FactoryOrder[]>([]);
  const [dispatches, setDispatches] = useState<BagDispatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [returns, setReturns] = useState<FactoryReturn[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBatchKey, setSelectedBatchKey] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fundId, setFundId] = useState("");
  const [items, setItems] = useState<ReturnItemInput[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const safeNumber = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
  const formatMoney = (value: unknown): string => safeNumber(value).toLocaleString();
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 2800); };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, dispatchesRes, productsRes, fundsRes, returnsRes] = await Promise.all([
        axiosInstance.get("/factory-orders"), axiosInstance.get("/bag-dispatches"), axiosInstance.get("/products", { params: { status: "active" } }), axiosInstance.get("/funds"), axiosInstance.get("/factory-returns")
      ]);
      setAllOrders(ordersRes.data);
      setDispatches(dispatchesRes.data);
      setProducts(productsRes.data); 
      setFunds(fundsRes.data); 
      setReturns(returnsRes.data);
    } catch (err: any) { showToast("⚠️ Failed to load data"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Calculate Pending Bags per Factory based on Dispatches and Returns
  const pendingBatches = useMemo(() => {
    const map = new Map<string, any>();
    
    dispatches.forEach(d => {
        const key = `${d.orderId}_${d.factoryId}`;
        if (!map.has(key)) {
            const order = allOrders.find(o => o._id === d.orderId);
            map.set(key, {
                key,
                orderId: d.orderId,
                factoryId: d.factoryId,
                factoryName: d.factory,
                bagName: order?.bagName || "Unknown Bag",
                weightPerBag: order?.weightPerBag || 0,
                bagSupplier: order?.bagSupplier || "Unknown",
                totalSent: 0,
                totalReturned: 0
            });
        }
        map.get(key).totalSent += d.count;
    });

    returns.forEach(r => {
        const key = `${r.orderId}_${r.companyId}`;
        if (map.has(key)) {
            map.get(key).totalReturned += r.totalBagsUsed;
        }
    });

    return Array.from(map.values()).filter(b => b.totalSent - b.totalReturned > 0);
  }, [dispatches, returns, allOrders]);

  const selectedBatch = pendingBatches.find(b => b.key === selectedBatchKey);
  const selectedOrderId = selectedBatch?.orderId || "";
  const pendingBagsAtFactory = selectedBatch ? (selectedBatch.totalSent - selectedBatch.totalReturned) : 0;

  const updateItem = (index: number, field: keyof ReturnItemInput, value: string) => {
    setItems((prev) => { const copy = [...prev]; copy[index] = { ...copy[index], [field]: value }; return copy; });
  };
  const addItemRow = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItemRow = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const calcLine = (item: ReturnItemInput) => {
    const bags = Number(item.bagCount) || 0;
    const product = products.find((p) => p._id === item.productId);
    const bagSize = selectedBatch?.weightPerBag || product?.bagSize || 0;
    return { totalKg: bags * bagSize, bagSize, amount: Number(item.amount) || 0 };
  };

  const totalBagsUsed = items.reduce((s, it) => s + (Number(it.bagCount) || 0), 0);
  const totalBillAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const remainingToPay = totalBillAmount; 

  const handleSave = async () => {
    if (!selectedBatch) return showToast("⚠️ Select a pending batch");
    const validItems = items.filter((it) => it.productId && it.bagCount && it.amount);
    if (validItems.length === 0) return showToast("⚠️ Fill at least one product properly");
    if (totalBagsUsed > pendingBagsAtFactory) return showToast(`⚠️ Only ${pendingBagsAtFactory} bags pending at this factory`);
    
    setSaving(true);
    try {
      await axiosInstance.post("/factory-returns", {
        orderId: selectedBatch.orderId, 
        productCompany: selectedBatch.factoryName, 
        date, 
        fundId: fundId || undefined,
        items: validItems.map((it) => ({ productId: it.productId, bagCount: it.bagCount, totalKg: calcLine(it).totalKg, amount: it.amount })),
      });
      showToast("✅ Products received successfully");
      setModalOpen(false); fetchAll();
    } catch (err: any) { showToast("⚠️ " + (err.response?.data?.message || "Something went wrong")); } finally { setSaving(false); }
  };

  const filteredReturns = returns.filter((r) => r.company.toLowerCase().includes(search.toLowerCase()) || (r.bagCompany || "").toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);
  const paginatedReturns = filteredReturns.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="text-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2b22]">Receive Filled Products</h1>
          <p className="text-sm text-gray-500 mt-1">Log products received from factories.</p>
        </div>
        <button onClick={() => { setSelectedBatchKey(""); setItems([emptyItem()]); setModalOpen(true); }} disabled={pendingBatches.length === 0} className="bg-[#1f2b22] hover:bg-black text-white px-5 py-2.5 rounded-sm text-sm font-semibold disabled:opacity-50 transition-colors">
          + Receive Products
        </button>
      </div>

      <div className="mb-4">
        <input type="text" placeholder="Search by product factory or bag supplier..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="w-full md:w-1/3 border border-gray-300 rounded-sm px-4 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="flex flex-col gap-4">
          {paginatedReturns.length === 0 ? (
            <div className="text-center py-10 border border-gray-200 bg-white rounded-sm text-gray-500">No product returns found.</div>
          ) : (
            paginatedReturns.map((r) => {
              return (
                <div key={r._id} className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
                  <div className="flex justify-between items-start gap-2 mb-4">
                    <div>
                      <p className="text-lg font-bold text-[#1f2b22]">Products from: {r.company}</p>
                      <p className="text-xs text-gray-500 mt-1">{r.date} <span className="mx-1">•</span> Received: {r.totalBagsUsed} Bags</p>
                      {r.bagCompany && r.bagCompany !== r.company && (
                        <p className="text-[10px] font-bold text-gray-600 mt-1.5 bg-gray-100 px-2 py-1 uppercase tracking-wider inline-block rounded-sm border border-gray-200">
                          Empty Bags Supplied by: {r.bagCompany}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#1f2b22] text-lg">Bill: ৳{formatMoney(r.totalBillAmount)}</p>
                      <p className="text-xs text-gray-500 mt-1">Advance Ded.: ৳{formatMoney(r.advanceUsed)} <span className="mx-1">|</span> Paid: ৳{formatMoney(r.remainingPaid)}</p>
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

          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border border-gray-300 rounded-sm">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-sm hover:bg-gray-100 transition-colors disabled:opacity-50">Previous</button>
              <span className="text-xs text-gray-600 font-medium">Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-sm hover:bg-gray-100 transition-colors disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}

      {/* Return Add Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-lg">
            <div className="flex justify-between items-center mb-5 border-b border-gray-200 pb-3">
              <h2 className="text-xl font-bold text-[#1f2b22]">Receive Filled Products</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 border-b border-gray-200 pb-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Dispatched Bags <span className="text-red-500">*</span></label>
                <select value={selectedBatchKey} onChange={(e) => {
                    setSelectedBatchKey(e.target.value);
                }} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                  <option value="">Choose Pending Bag Batch...</option>
                  {pendingBatches.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.factoryName} — {b.bagName} ({b.totalSent - b.totalReturned} bags pending)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date <span className="text-red-500">*</span></label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
              </div>
            </div>

            {selectedBatch && (
              <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 mb-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm shadow-sm">
                <div>
                  <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Product Factory</p>
                  <p className="font-bold text-[#1f2b22] mt-0.5">{selectedBatch.factoryName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Bag Name</p>
                  <p className="font-bold text-[#1f2b22] mt-0.5">{selectedBatch.bagName || "N/A"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Pending Bags</p>
                  <p className="font-bold text-red-600 mt-0.5">{pendingBagsAtFactory}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Weight / Bag</p>
                  <p className="font-bold text-[#1f2b22] mt-0.5">{selectedBatch.weightPerBag} kg</p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              <label className="block text-xs font-bold text-gray-700 uppercase border-b border-gray-200 pb-2">Received Products</label>
              
              {items.map((item, index) => (
                <div key={index} className="bg-white border border-gray-300 rounded-sm p-4 relative shadow-sm">
                  {items.length > 1 && (
                    <button onClick={() => removeItemRow(index)} className="absolute top-2 right-2 text-red-500 text-xl leading-none font-bold hover:text-red-700" title="Remove Item">&times;</button>
                  )}
                  
                  <div className="mb-3 w-11/12 md:w-full md:pr-8">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Product <span className="text-red-500">*</span></label>
                    <select value={item.productId} onChange={(e) => updateItem(index, "productId", e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                      <option value="">Choose Product</option>
                      {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Bag Count <span className="text-red-500">*</span></label>
                      <input type="number" min="0" value={item.bagCount} onChange={(e) => updateItem(index, "bagCount", e.target.value)} placeholder="0" disabled={!selectedBatchKey} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22] disabled:bg-gray-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Product Bill (৳) <span className="text-red-500">*</span></label>
                      <input type="number" min="0" value={item.amount} onChange={(e) => updateItem(index, "amount", e.target.value)} placeholder="0" disabled={!selectedBatchKey} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22] disabled:bg-gray-100" />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addItemRow} disabled={!selectedBatchKey} className="text-sm text-[#1f2b22] font-semibold border border-dashed border-gray-300 rounded-sm py-2 hover:bg-gray-50 transition-colors disabled:opacity-40">
                + Add Another Product
              </button>
            </div>

            <hr className="border-gray-200 my-5" />

            <div className="bg-gray-50 border border-gray-200 rounded-sm p-4 text-sm flex flex-col gap-2">
              <div className="flex justify-between text-gray-600"><span>Bags Used:</span> <span>{totalBagsUsed} / {pendingBagsAtFactory} pending</span></div>
              <div className="flex justify-between font-bold text-[#1f2b22] border-t border-gray-200 pt-2 mt-1 text-base"><span>Total Product Bill:</span> <span>৳{formatMoney(totalBillAmount)}</span></div>
              <p className="text-[10px] text-gray-500 mt-1 font-medium">If the factory has an advance balance, it will be automatically deducted first.</p>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Payment Source (If any extra due remains)</label>
              <select value={fundId} onChange={(e) => setFundId(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                <option value="">Select Fund</option>
                {funds.map((f) => <option key={f._id} value={f._id}>{f.name} (Bal: ৳{formatMoney(f.balance)})</option>)}
              </select>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2.5 text-sm font-semibold rounded-sm transition-colors disabled:opacity-50">
                {saving ? "Processing..." : "Submit Received Products"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#1f2b22] text-white text-sm px-5 py-3 rounded-sm shadow-md z-50">
          {toastMsg}
        </div>
      )}
    </div>
  );
};

export default FactoryReturnPage;