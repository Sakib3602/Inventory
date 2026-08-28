import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface Fund { _id: string; name: string; balance: number; }
interface Company { _id: string; name: string; phone?: string; }
interface FactoryOrder {
  _id: string; bagSupplier: string; date: string; bagName: string;
  bagCount: number; weightPerBag: number; expectedTotalKg: number;
  sentBags: number; returnedBags: number; status: string;
  bagPrice: number; totalBagPrice: number; bagPaidAmount: number; bagDue: number;
}
interface BagDispatch {
  _id: string; factory: string; count: number; date: string;
}

const FactoryOrderPage = () => {
  const [orders, setOrders] = useState<FactoryOrder[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [payBagModalOpen, setPayBagModalOpen] = useState(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  
  const [selectedOrder, setSelectedOrder] = useState<FactoryOrder | null>(null);
  const [dispatchList, setDispatchList] = useState<BagDispatch[]>([]);

  // Form states (Buy Bags)
  const [bagSupplier, setBagSupplier] = useState("");
  const [addingBagSupplier, setAddingBagSupplier] = useState(false);
  const [newBagSupplierName, setNewBagSupplierName] = useState("");
  const [bagSupplierPhone, setBagSupplierPhone] = useState("");
  
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bagName, setBagName] = useState("");
  const [bagCount, setBagCount] = useState("");
  const [weightPerBag, setWeightPerBag] = useState("");
  const [bagPrice, setBagPrice] = useState("");
  const [bagPaidAmount, setBagPaidAmount] = useState("");
  const [fundId, setFundId] = useState("");

  // Form states (Dispatch Bags)
  const [dispatchFactory, setDispatchFactory] = useState("");
  const [addingDispatchFactory, setAddingDispatchFactory] = useState(false);
  const [newDispatchFactory, setNewDispatchFactory] = useState("");
  const [dispatchFactoryPhone, setDispatchFactoryPhone] = useState("");
  const [dispatchCount, setDispatchCount] = useState("");
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const safeNumber = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
  const formatMoney = (value: unknown): string => safeNumber(value).toLocaleString();
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 2500); };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, fundsRes, companiesRes] = await Promise.all([
        axiosInstance.get("/factory-orders"), axiosInstance.get("/funds"), axiosInstance.get("/companies"),
      ]);
      setOrders(ordersRes.data || []); setFunds(fundsRes.data || []); setCompanies(companiesRes.data || []);
    } catch (err) { showToast("⚠️ Failed to load data"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalBagPriceCalculated = (Number(bagCount) || 0) * (Number(bagPrice) || 0);
  const bagDueCalculated = totalBagPriceCalculated - (Number(bagPaidAmount) || 0);

  const handleSavePurchase = async () => {
    const finalSupplier = addingBagSupplier ? newBagSupplierName.trim() : bagSupplier.trim();
    if (!finalSupplier) return showToast("⚠️ Supplier is required");
    if (!bagName.trim() || !bagCount || !weightPerBag) return showToast("⚠️ Fill all required fields");
    if (Number(bagPaidAmount) > 0 && !fundId) return showToast("⚠️ Select a fund for payment");

    setSaving(true);
    try {
      await axiosInstance.post("/factory-orders", {
        bagSupplier: finalSupplier, bagSupplierPhone, date, bagName: bagName.trim(),
        bagCount, weightPerBag, bagPrice, bagPaidAmount, fundId: Number(bagPaidAmount) > 0 ? fundId : undefined,
      });
      showToast("✅ Bags purchased successfully");
      setModalOpen(false); fetchAll();
    } catch (err: any) { showToast("⚠️ " + (err.response?.data?.message || "Failed")); } finally { setSaving(false); }
  };

  const handleDispatch = async () => {
    const finalFactory = addingDispatchFactory ? newDispatchFactory.trim() : dispatchFactory.trim();
    if (!finalFactory) return showToast("⚠️ Product Factory is required");
    if (!dispatchCount) return showToast("⚠️ Enter bag count");

    setSaving(true);
    try {
      await axiosInstance.post(`/factory-orders/${selectedOrder?._id}/dispatch`, {
        factory: finalFactory, factoryPhone: dispatchFactoryPhone, date: dispatchDate, count: dispatchCount
      });
      showToast("✅ Bags sent successfully");
      setDispatchModalOpen(false); fetchAll();
    } catch (err: any) { showToast("⚠️ " + (err.response?.data?.message || "Failed to dispatch")); } finally { setSaving(false); }
  };

  const handlePayBagDue = async () => {
    const payAmt = Number(bagPaidAmount);
    if (!selectedOrder || payAmt <= 0 || payAmt > safeNumber(selectedOrder.bagDue)) return showToast("⚠️ Invalid amount");
    if (!fundId) return showToast("⚠️ Select a fund");

    setSaving(true);
    try {
      await axiosInstance.post(`/factory-orders/${selectedOrder._id}/pay-bag`, { amount: payAmt, fundId });
      showToast("✅ Payment successful");
      setPayBagModalOpen(false); setBagPaidAmount(""); setFundId(""); fetchAll();
    } catch (err: any) { showToast("⚠️ " + (err.response?.data?.message || "Payment failed")); } finally { setSaving(false); }
  };

  const loadDetails = async (order: FactoryOrder) => {
    setSelectedOrder(order);
    try {
      const res = await axiosInstance.get(`/factory-orders/${order._id}/dispatches`);
      setDispatchList(res.data);
      setDetailsModalOpen(true);
    } catch (err) { showToast("⚠️ Failed to load history"); }
  };

  const filteredOrders = orders.filter((o) => String(o.bagSupplier || "").toLowerCase().includes(search.toLowerCase()) || String(o.bagName || "").toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="text-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2b22]">Empty Bags Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">Buy empty bags from suppliers and send them to Product Factories.</p>
        </div>
        <button onClick={() => { setAddingBagSupplier(false); setBagSupplier(""); setNewBagSupplierName(""); setBagName(""); setBagCount(""); setWeightPerBag(""); setBagPrice(""); setBagPaidAmount(""); setFundId(""); setModalOpen(true); }} className="bg-[#1f2b22] hover:bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-sm transition-colors">
          + Buy Empty Bags
        </button>
      </div>

      <div className="mb-4">
        <input type="text" placeholder="Search by supplier or bag name..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="w-full md:w-1/3 border border-gray-300 rounded-sm px-4 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-300 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 border-b border-gray-300 text-gray-700 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-semibold">Bag Supplier</th>
                  <th className="px-4 py-3 font-semibold text-[#1f2b22]">Bag Name</th>
                  <th className="px-4 py-3 font-semibold text-center">Total Bought</th>
                  <th className="px-4 py-3 font-semibold text-center text-blue-600">Sent to Factory</th>
                  <th className="px-4 py-3 font-semibold text-center text-amber-600">In Godown (Pending)</th>
                  <th className="px-4 py-3 font-semibold text-center text-emerald-600">Returned Full</th>
                  <th className="px-4 py-3 font-semibold text-red-600">Bag Due</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((o) => {
                  const pendingToSend = Math.max(0, safeNumber(o.bagCount) - safeNumber(o.sentBags));
                  return (
                    <tr key={o._id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-600">{o.bagSupplier}</td>
                      <td className="px-4 py-3 font-bold text-[#1f2b22]">{o.bagName} <span className="text-xs text-gray-400 font-normal ml-1">({o.weightPerBag}kg)</span></td>
                      <td className="px-4 py-3 text-center font-semibold">{o.bagCount}</td>
                      <td className="px-4 py-3 text-center font-bold text-blue-600">{safeNumber(o.sentBags)}</td>
                      <td className="px-4 py-3 text-center font-bold text-amber-600">{pendingToSend}</td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-600">{safeNumber(o.returnedBags)}</td>
                      <td className="px-4 py-3 font-medium text-red-600">{safeNumber(o.bagDue) > 0 ? `৳${formatMoney(o.bagDue)}` : "0"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {pendingToSend > 0 && (
                            <button onClick={() => { setSelectedOrder(o); setDispatchCount(""); setAddingDispatchFactory(false); setDispatchFactory(""); setDispatchModalOpen(true); }} className="text-[10px] uppercase font-bold bg-[#1f2b22] text-white px-2 py-1.5 rounded-sm hover:bg-black transition-colors">
                              Send Bags
                            </button>
                          )}
                          <button onClick={() => loadDetails(o)} className="text-[10px] uppercase font-bold bg-gray-100 border border-gray-300 text-gray-700 px-2 py-1.5 rounded-sm hover:bg-gray-200 transition-colors">
                            History
                          </button>
                          {safeNumber(o.bagDue) > 0 && (
                            <button onClick={() => { setSelectedOrder(o); setBagPaidAmount(""); setFundId(""); setPayBagModalOpen(true); }} className="text-[10px] uppercase font-bold bg-white border border-red-300 text-red-700 px-2 py-1.5 rounded-sm hover:bg-red-50 transition-colors">
                              Pay Due
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-t border-gray-300">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-sm hover:bg-gray-100 transition-colors disabled:opacity-50">Previous</button>
              <span className="text-xs text-gray-600 font-medium">Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-sm hover:bg-gray-100 transition-colors disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}

      {/* Buy Bags Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto shadow-lg">
            <div className="flex justify-between items-center mb-5 border-b border-gray-200 pb-3">
              <h2 className="text-xl font-bold text-[#1f2b22]">Buy Empty Bags</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Bag Supplier <span className="text-red-500">*</span></label>
                <select value={addingBagSupplier ? "__new__" : bagSupplier} onChange={(e) => { if (e.target.value === "__new__") { setAddingBagSupplier(true); setBagSupplier(""); } else { setAddingBagSupplier(false); setBagSupplier(e.target.value); } }} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                  <option value="">Select Supplier</option>
                  {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
                  <option value="__new__" className="font-bold text-[#1f2b22]">+ Add New Supplier</option>
                </select>
                {addingBagSupplier && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input type="text" placeholder="Supplier Name..." value={newBagSupplierName} onChange={(e) => setNewBagSupplierName(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" autoFocus />
                    <input type="text" placeholder="Phone (Optional)" value={bagSupplierPhone} onChange={(e) => setBagSupplierPhone(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Bag Name / Type <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. Red Bag, 50kg Plastic Bag..." value={bagName} onChange={(e) => setBagName(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Total Bags <span className="text-red-500">*</span></label>
                  <input type="number" min="0" value={bagCount} onChange={(e) => setBagCount(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Weight Per Bag (kg) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" value={weightPerBag} onChange={(e) => setWeightPerBag(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                </div>
              </div>

              <hr className="border-gray-200" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Price Per Bag (৳)</label>
                  <input type="number" min="0" value={bagPrice} onChange={(e) => setBagPrice(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Paid Amount (৳)</label>
                  <input type="number" min="0" value={bagPaidAmount} onChange={(e) => setBagPaidAmount(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                </div>
              </div>

              {totalBagPriceCalculated > 0 && (
                <div className="bg-gray-50 border border-gray-200 p-3 rounded-sm text-sm">
                  <span className="text-gray-600">Total Cost: </span><span className="font-semibold">৳{formatMoney(totalBagPriceCalculated)}</span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="text-gray-600">Due: </span><span className="font-semibold text-red-600">৳{formatMoney(Math.max(0, bagDueCalculated))}</span>
                </div>
              )}

              {Number(bagPaidAmount) > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Payment Source</label>
                  <select value={fundId} onChange={(e) => setFundId(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                    <option value="">Choose Fund (৳{formatMoney(bagPaidAmount)} will be deducted)</option>
                    {funds.map((f) => <option key={f._id} value={f._id}>{f.name} (Bal: ৳{formatMoney(f.balance)})</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSavePurchase} disabled={saving} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2.5 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors">
                {saving ? "Processing..." : "Confirm Purchase"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Modal (Send to Factory) */}
      {dispatchModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-md p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-lg font-bold text-[#1f2b22]">Send Bags to Factory</h2>
              <button onClick={() => setDispatchModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-sm mb-4">
              <p className="text-sm font-bold text-[#1f2b22]">{selectedOrder.bagName}</p>
              <p className="text-xs text-amber-800 mt-1">Available in Godown: <span className="font-bold">{Math.max(0, safeNumber(selectedOrder.bagCount) - safeNumber(selectedOrder.sentBags))}</span> bags</p>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Product Factory <span className="text-red-500">*</span></label>
                <select value={addingDispatchFactory ? "__new__" : dispatchFactory} onChange={(e) => { if (e.target.value === "__new__") { setAddingDispatchFactory(true); setDispatchFactory(""); } else { setAddingDispatchFactory(false); setDispatchFactory(e.target.value); } }} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                  <option value="">Select Factory</option>
                  {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
                  <option value="__new__" className="font-bold text-[#1f2b22]">+ Add New Factory</option>
                </select>
                {addingDispatchFactory && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input type="text" placeholder="Factory Name..." value={newDispatchFactory} onChange={(e) => setNewDispatchFactory(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                    <input type="text" placeholder="Phone (Optional)" value={dispatchFactoryPhone} onChange={(e) => setDispatchFactoryPhone(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Bag Count <span className="text-red-500">*</span></label>
                  <input type="number" min="1" value={dispatchCount} onChange={(e) => setDispatchCount(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" placeholder="e.g. 500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date</label>
                  <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setDispatchModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleDispatch} disabled={saving} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors">{saving ? "Sending..." : "Send Bags"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Details/History Modal */}
      {detailsModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 shadow-lg">
            <div className="flex justify-between items-center mb-5 border-b border-gray-200 pb-3">
              <div>
                <h2 className="text-xl font-bold text-[#1f2b22]">Bag History</h2>
                <p className="text-sm font-medium text-gray-600 mt-1">{selectedOrder.bagName} <span className="font-normal text-gray-400">from {selectedOrder.bagSupplier}</span></p>
              </div>
              <button onClick={() => setDetailsModalOpen(false)} className="text-gray-400 hover:text-black text-2xl font-bold leading-none">&times;</button>
            </div>

            <div className="flex gap-4 mb-6 border-b border-gray-200 pb-4">
              <div className="text-sm"><span className="text-gray-500 uppercase text-[10px] font-bold block mb-0.5">Total Bought</span><span className="font-bold">{selectedOrder.bagCount}</span></div>
              <div className="text-sm border-l border-gray-200 pl-4"><span className="text-gray-500 uppercase text-[10px] font-bold block mb-0.5">Sent to Factories</span><span className="font-bold text-blue-600">{safeNumber(selectedOrder.sentBags)}</span></div>
              <div className="text-sm border-l border-gray-200 pl-4"><span className="text-gray-500 uppercase text-[10px] font-bold block mb-0.5">Pending to Send</span><span className="font-bold text-amber-600">{Math.max(0, safeNumber(selectedOrder.bagCount) - safeNumber(selectedOrder.sentBags))}</span></div>
              <div className="text-sm border-l border-gray-200 pl-4"><span className="text-gray-500 uppercase text-[10px] font-bold block mb-0.5">Returned Full</span><span className="font-bold text-emerald-600">{safeNumber(selectedOrder.returnedBags)}</span></div>
            </div>

            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Dispatch History (Sent to Factories)</p>
            {dispatchList.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-300 rounded-sm">No bags sent yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {dispatchList.map((d, i) => (
                  <div key={i} className="border border-blue-100 bg-blue-50 p-3 rounded-sm flex justify-between items-center">
                    <div>
                      <p className="font-bold text-[#1f2b22] text-sm">{d.factory}</p>
                      <p className="text-xs text-gray-500">{d.date}</p>
                    </div>
                    <p className="font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-sm">{d.count} Bags</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pay Due Modal */}
      {payBagModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-sm p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-lg font-bold text-[#1f2b22]">Pay Bag Supplier</h2>
              <button onClick={() => { setPayBagModalOpen(false); setSelectedOrder(null); }} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>
            <div className="bg-gray-50 border border-gray-200 p-3 rounded-sm mb-4">
              <p className="text-sm text-gray-700"><span className="font-semibold">Supplier:</span> {selectedOrder.bagSupplier}</p>
              <p className="text-sm text-red-600 mt-1"><span className="font-semibold text-gray-700">Due Amount:</span> ৳{formatMoney(selectedOrder.bagDue)}</p>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Amount (৳)</label>
                <input type="number" min="0" value={bagPaidAmount} onChange={(e) => setBagPaidAmount(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Source</label>
                <select value={fundId} onChange={(e) => setFundId(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22] bg-white">
                  <option value="">Select Fund</option>
                  {funds.map((f) => <option key={f._id} value={f._id}>{f.name} (Bal: ৳{formatMoney(f.balance)})</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setPayBagModalOpen(false); setSelectedOrder(null); }} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handlePayBagDue} disabled={saving} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors">{saving ? "Processing..." : "Submit"}</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#1f2b22] text-white text-sm px-5 py-3 rounded-sm shadow-md z-50">{toastMsg}</div>}
    </div>
  );
};

export default FactoryOrderPage;