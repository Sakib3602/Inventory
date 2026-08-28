import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface Product {
  _id: string;
  name: string;
  bagSize: number;
  salePricePerBag: number;
  purchasePricePerKg: number;
  salePrices?: { bagSize: number; salePrice: number }[];
}

interface Customer {
  _id: string;
  name: string;
  phone: string;
  totalDue: number;
}

interface StockItem {
  productId: string;
  currentKg: number;
  bagSize?: number;
  fullBags?: number;
  brokenKg?: number;
}

interface SaleLine {
  productId: string;
  bagSize: string;
  bagCount: string;
  ratePerBag: string;
}

interface Sale {
  _id: string;
  date: string;
  customerName: string;
  productName: string;
  bagCount: number;
  bagSize: number;
  ratePerBag: number;
  subtotal: number;
  discount: number;
  totalBill: number;
  paidAmount: number;
  due: number;
  totalProfit: number;
  fundName: string | null;
}

const toNum = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (value: unknown): string => {
  return toNum(value).toLocaleString();
};

const normalizeSale = (s: any): Sale => ({
  ...s,
  bagCount: toNum(s.bagCount),
  bagSize: toNum(s.bagSize),
  ratePerBag: toNum(s.ratePerBag),
  subtotal: toNum(s.subtotal),
  discount: toNum(s.discount),
  totalBill: toNum(s.totalBill),
  paidAmount: toNum(s.paidAmount),
  due: toNum(s.due),
  totalProfit: toNum(s.totalProfit),
});

const SalePage = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState("");
  const [saleLines, setSaleLines] = useState<SaleLine[]>([{ productId: "", bagSize: "", bagCount: "", ratePerBag: "" }]);
  const [discount, setDiscount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2800);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [salesRes, customersRes, productsRes, stockRes] = await Promise.all([
        axiosInstance.get("/sales"),
        axiosInstance.get("/customers"),
        axiosInstance.get("/products", { params: { status: "active" } }),
        axiosInstance.get("/stock"),
      ]);
      setSales((salesRes.data || []).map(normalizeSale));
      setCustomers(customersRes.data || []);
      setProducts(productsRes.data || []);
      setStock(stockRes.data || []);
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || "Failed to load data.");
      showToast("⚠️ Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openAddModal = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setCustomerId("");
    setSaleLines([{ productId: "", bagSize: "", bagCount: "", ratePerBag: "" }]);
    setDiscount("");
    setPaidAmount("");
    setModalOpen(true);
  };

  const updateLine = (index: number, changes: Partial<SaleLine>) => 
    setSaleLines((lines) => lines.map((line, i) => i === index ? { ...line, ...changes } : line));

  const getLineInfo = (line: SaleLine) => {
    const product = products.find((p) => p._id === line.productId);
    const batches = stock.filter((s) => s.productId === line.productId && (s.fullBags || s.currentKg > 0));
    const batch = batches.find((s) => String(s.bagSize) === line.bagSize) || batches[0];
    const bagSize = toNum(line.bagSize) || toNum(batch?.bagSize) || 0;
    const availableBags = batch ? (toNum(batch.fullBags) || Math.floor(toNum(batch.currentKg) / (bagSize || 1))) : 0;
    return { product, batches, bagSize, availableBags };
  };

  // -----------------------------------------
  // Real-time Calculations (FIXED)
  // -----------------------------------------
  const discountNum = toNum(discount);
  const paidNum = toNum(paidAmount);
  
  let subtotalAll = 0;
  let costAll = 0;

  saleLines.forEach((line) => {
    const { product, bagSize } = getLineInfo(line);
    
    // Auto-filled price if user hasn't typed anything
    const autoPrice = product?.salePrices?.find((price) => price.bagSize === bagSize)?.salePrice || product?.salePricePerBag || 0;
    const effectiveRate = line.ratePerBag ? toNum(line.ratePerBag) : autoPrice;
    
    const bags = toNum(line.bagCount);
    
    subtotalAll += (bags * effectiveRate);
    costAll += (bags * bagSize * toNum(product?.purchasePricePerKg));
  });

  const totalBill = Math.max(0, subtotalAll - discountNum);
  const due = totalBill - paidNum;
  const profitLoss = totalBill - costAll;

  // -----------------------------------------
  // Handlers
  // -----------------------------------------
  const handleAddCustomer = async () => {
    if (!newCustName.trim()) return showToast("⚠️ Customer name is required.");
    setSavingCustomer(true);
    try {
      const res = await axiosInstance.post("/customers", { name: newCustName, phone: newCustPhone });
      setCustomers((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(res.data._id);
      setAddCustomerOpen(false);
      setNewCustName("");
      setNewCustPhone("");
      showToast("✅ Customer added successfully.");
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "Failed to add customer."));
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleSave = async () => {
    if (!customerId) return showToast("⚠️ Select a customer.");
    
    const effectiveLines = saleLines.map((line) => {
      const info = getLineInfo(line);
      return { 
        ...line, 
        bagSize: line.bagSize || String(info.bagSize), 
        ratePerBag: line.ratePerBag || String(info.product?.salePrices?.find((price) => price.bagSize === info.bagSize)?.salePrice || info.product?.salePricePerBag || "") 
      };
    });

    if (effectiveLines.some((line) => !line.productId || !line.bagSize || !line.bagCount || !line.ratePerBag)) {
      return showToast("⚠️ Fill all fields in the product lines.");
    }
    if (effectiveLines.some((line) => toNum(line.bagCount) > getLineInfo(line).availableBags)) {
      return showToast("⚠️ Insufficient stock for one or more items.");
    }
    if (due < 0) return showToast("⚠️ Paid Amount cannot exceed Total Bill.");

    setSaving(true);
    try {
      await axiosInstance.post("/sales", {
        date,
        customerId,
        items: effectiveLines.map((line) => ({ 
          productId: line.productId, 
          bagSize: toNum(line.bagSize), 
          bagCount: toNum(line.bagCount), 
          ratePerBag: toNum(line.ratePerBag) 
        })),
        discount: discountNum,
        paidAmount: paidNum,
      });
      showToast("✅ Sale recorded successfully.");
      setModalOpen(false);
      fetchAll();
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "Something went wrong."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axiosInstance.delete(`/sales/${deleteTarget._id}`);
      showToast("✅ Sale deleted successfully.");
      setDeleteTarget(null);
      fetchAll();
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "Failed to delete sale."));
    }
  };

  // -----------------------------------------
  // Render Summary Data
  // -----------------------------------------
  const totalRevenue = sales.reduce((s, x) => s + toNum(x.totalBill), 0);
  const totalProfitLoss = sales.reduce((s, x) => s + toNum(x.totalProfit), 0);
  const actualTotalDue = customers.reduce((s, c) => s + toNum(c.totalDue), 0);
  const totalDiscountAmount = sales.reduce((s, x) => s + toNum(x.discount), 0);

  return (
    <div className="text-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2b22]">Sales</h1>
          <p className="text-sm text-gray-500 mt-1">Record product sales, apply discounts, and manage payments.</p>
        </div>
        <button onClick={openAddModal} className="bg-[#1f2b22] hover:bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-sm transition-colors">
          + New Sale
        </button>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-sm p-3 mb-4">{loadError}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-[#1f2b22]">৳{formatMoney(totalRevenue)}</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Profit / Loss</p>
          <p className={`text-2xl font-bold ${totalProfitLoss >= 0 ? "text-emerald-700" : "text-red-600"}`}>
            {totalProfitLoss >= 0 ? "+" : ""}৳{formatMoney(totalProfitLoss)}
          </p>
        </div>
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Outstanding Due</p>
          <p className="text-2xl font-bold text-amber-600">৳{formatMoney(actualTotalDue)}</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Discount Given</p>
          <p className={`text-2xl font-bold ${totalDiscountAmount > 0 ? "text-blue-600" : "text-gray-700"}`}>৳{formatMoney(totalDiscountAmount)}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : sales.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm bg-white border border-gray-300 rounded-sm">No sales found.</div>
      ) : (
        <div className="bg-white border border-gray-300 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300 text-gray-700 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Bags</th>
                  <th className="px-4 py-3 font-semibold">Rate/Bag</th>
                  <th className="px-4 py-3 font-semibold text-blue-700">Discount</th>
                  <th className="px-4 py-3 font-semibold">Invoice Total</th>
                  <th className="px-4 py-3 font-semibold">Paid On Sale</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 text-[10px]">Invoice Due</th>
                  <th className="px-4 py-3 font-semibold">P/L</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s._id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600">{s.date}</td>
                    <td className="px-4 py-3 font-bold text-[#1f2b22]">{s.customerName}</td>
                    <td className="px-4 py-3 text-gray-600 font-medium">{s.productName}</td>
                    <td className="px-4 py-3 text-gray-600">{s.bagCount}</td>
                    <td className="px-4 py-3 text-gray-600">৳{formatMoney(s.ratePerBag)}</td>
                    <td className="px-4 py-3 font-semibold">{s.discount > 0 ? <span className="text-blue-600">-৳{formatMoney(s.discount)}</span> : <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3 text-[#1f2b22] font-bold">৳{formatMoney(s.totalBill)}</td>
                    <td className="px-4 py-3 text-emerald-700 font-semibold">৳{formatMoney(s.paidAmount)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.due > 0 ? `৳${formatMoney(s.due)}` : "0"}</td>
                    <td className="px-4 py-3"><span className={s.totalProfit >= 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>{s.totalProfit >= 0 ? "+" : ""}৳{formatMoney(s.totalProfit)}</span></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDeleteTarget(s)} className="text-xs text-red-500 hover:text-red-800 hover:underline font-bold">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* NEW SALE MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-sm w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5 border-b border-gray-200 pb-3">
              <h2 className="text-xl font-bold text-[#1f2b22]">New Sale</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date <span className="text-red-500">*</span></label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-gray-700 uppercase">Customer <span className="text-red-500">*</span></label>
                  <button type="button" onClick={() => setAddCustomerOpen(true)} className="text-xs text-[#1f2b22] font-bold hover:underline">+ New Customer</button>
                </div>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                  <option value="">Select Customer</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>{c.name} {c.totalDue > 0 ? `(Due: ৳${formatMoney(c.totalDue)})` : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-4 mb-4">
              <label className="block text-xs font-bold text-gray-700 uppercase border-b border-gray-200 pb-2">Product Lines <span className="text-red-500">*</span></label>
              {saleLines.map((line, index) => {
                const info = getLineInfo(line);
                const selectedPrice = info.product?.salePrices?.find((price) => price.bagSize === info.bagSize)?.salePrice || info.product?.salePricePerBag || 0;
                
                return (
                  <div key={index} className="bg-gray-50 border border-gray-200 rounded-sm p-4 relative shadow-sm">
                    {saleLines.length > 1 && <button type="button" onClick={() => setSaleLines((lines) => lines.filter((_, i) => i !== index))} className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold text-xl leading-none">&times;</button>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 w-11/12 md:w-full md:pr-6">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Select Product</label>
                        <select value={line.productId} onChange={(e) => updateLine(index, { productId: e.target.value, bagSize: "", ratePerBag: "" })} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                          <option value="">Choose...</option>
                          {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bag Size</label>
                        <select value={line.bagSize || String(info.batches[0]?.bagSize || "")} onChange={(e) => updateLine(index, { bagSize: e.target.value, ratePerBag: String(info.product?.salePrices?.find((price) => price.bagSize === Number(e.target.value))?.salePrice || info.product?.salePricePerBag || "") })} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                          <option value="">Choose...</option>
                          {info.batches.map((batch) => <option key={batch.bagSize} value={batch.bagSize}>{batch.bagSize}kg ({batch.fullBags || 0} in stock)</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bag Count</label>
                        <input type="number" min="0" value={line.bagCount} onChange={(e) => updateLine(index, { bagCount: e.target.value })} placeholder="0" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Rate / Bag (৳)</label>
                        <input type="number" min="0" value={line.ratePerBag || (selectedPrice ? String(selectedPrice) : "")} onChange={(e) => updateLine(index, { ratePerBag: e.target.value })} placeholder="0" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                      </div>
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={() => setSaleLines((lines) => [...lines, { productId: "", bagSize: "", bagCount: "", ratePerBag: "" }])} className="w-full text-sm text-[#1f2b22] font-semibold border border-dashed border-gray-300 rounded-sm py-2 hover:bg-gray-50 transition-colors">+ Add Another Product</button>
            </div>

            <hr className="border-gray-200 my-5" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-blue-700 uppercase mb-1">Discount (৳) <span className="text-gray-400 font-normal lowercase">- Optional</span></label>
                <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-full border border-blue-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-blue-600 bg-blue-50" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Paid Amount (৳)</label>
                <input type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" placeholder="Amount received" />
                {paidNum > totalBill && <p className="text-[10px] text-red-500 mt-1 font-bold">Paid amount cannot exceed bill (৳{formatMoney(totalBill)}).</p>}
                {paidNum > 0 && <p className="text-[10px] text-emerald-600 mt-1 font-bold">Added to Cash in Hand.</p>}
              </div>
            </div>

            {/* SUMMARY SECTION - ALWAYS VISIBLE */}
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-sm mt-5">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Subtotal:</span>
                <span className="font-semibold">৳{formatMoney(subtotalAll)}</span>
              </div>
              
              <div className="flex justify-between text-sm font-bold text-blue-600 mb-2 border-b border-gray-200 pb-2">
                <span>Discount:</span>
                <span>- ৳{formatMoney(discountNum)}</span>
              </div>
              
              <div className="flex justify-between text-base font-bold text-[#1f2b22] mb-1">
                <span>Total Bill Amount:</span>
                <span>৳{formatMoney(totalBill)}</span>
              </div>

              <div className="flex justify-between text-sm font-bold text-emerald-700 mb-2 border-b border-gray-200 pb-2">
                <span>Paid Amount:</span>
                <span>- ৳{formatMoney(paidNum)}</span>
              </div>
              
              <div className="flex justify-between text-sm font-bold text-red-600 mt-2">
                <span>Due Amount:</span>
                <span>৳{formatMoney(Math.max(0, due))}</span>
              </div>

              <div className="flex justify-between text-[11px] font-bold text-gray-500 uppercase mt-4 border-t border-gray-200 pt-2">
                <span>Profit / Loss for this sale:</span>
                <span className={profitLoss >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {profitLoss >= 0 ? "+" : ""}৳{formatMoney(profitLoss)}
                </span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || paidNum > totalBill} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2.5 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors">{saving ? "Processing..." : "Save Sale"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {addCustomerOpen && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-[60] flex items-center justify-center p-4" onClick={() => setAddCustomerOpen(false)}>
          <div className="bg-white rounded-sm w-full max-w-md p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
              <h3 className="text-lg font-bold text-[#1f2b22]">Add New Customer</h3>
              <button onClick={() => setAddCustomerOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>
            <div className="flex flex-col gap-4">
              <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Customer Name <span className="text-red-500">*</span></label><input type="text" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" autoFocus /></div>
              <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Phone <span className="text-gray-400 font-normal lowercase">- Optional</span></label><input type="text" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setAddCustomerOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleAddCustomer} disabled={savingCustomer} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors">{savingCustomer ? "Adding..." : "Add Customer"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Target Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-sm w-full max-w-sm p-6 text-center shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#1f2b22] mb-2">Are you sure?</h3>
            <p className="text-sm text-gray-600 mb-6">The sale for <span className="font-bold">{deleteTarget.customerName}</span> will be permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 text-sm font-semibold rounded-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#1f2b22] text-white text-sm px-5 py-3 rounded-sm shadow-md z-50">{toastMsg}</div>}
    </div>
  );
};

export default SalePage;