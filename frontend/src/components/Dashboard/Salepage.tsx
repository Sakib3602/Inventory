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
  salePricePerBag: number;
  purchasePricePerKg: number;
}

interface Customer {
  _id: string;
  name: string;
  phone: string;
  due: number;
}

interface StockItem {
  productId: string;
  currentKg: number;
  fullBags?: number;
  brokenKg?: number;
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

const toNum = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeSale = (s: Record<string, unknown>): Sale => ({
  ...(s as unknown as Sale),
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
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [bagCount, setBagCount] = useState("");
  const [ratePerBag, setRatePerBag] = useState("");
  const [discount, setDiscount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [fundId, setFundId] = useState("");
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
      const [salesRes, customersRes, productsRes, stockRes, fundsRes] = await Promise.all([
        axiosInstance.get("/sales"),
        axiosInstance.get("/customers"),
        axiosInstance.get("/products", { params: { status: "active" } }),
        axiosInstance.get("/stock"),
        axiosInstance.get("/funds"),
      ]);
      setSales((salesRes.data as Record<string, unknown>[]).map(normalizeSale));
      setCustomers(customersRes.data);
      setProducts(productsRes.data);
      setStock(stockRes.data);
      setFunds(fundsRes.data);
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || "Data লোড করতে সমস্যা হয়েছে");
      showToast("⚠️ Data লোড করতে সমস্যা হয়েছে");
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
    setProductId("");
    setBagCount("");
    setRatePerBag("");
    setDiscount("");
    setPaidAmount("");
    setFundId(funds[0]?._id || "");
    setModalOpen(true);
  };

  const selectedProduct = products.find((p) => p._id === productId);
  const selectedStock = stock.find((s) => s.productId === productId);
  const selectedProductStockKg = selectedStock?.currentKg || 0;
  const bagSize = selectedProduct?.bagSize || 0;
  const availableBags = bagSize > 0 ? Math.floor(selectedProductStockKg / bagSize) : 0;

  const handleProductSelect = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x._id === id);
    setRatePerBag(p?.salePricePerBag ? String(p.salePricePerBag) : "");
  };

  const bagCountNum = Number(bagCount) || 0;
  const ratePerBagNum = Number(ratePerBag) || 0;
  const discountNum = Number(discount) || 0;
  const paidNum = Number(paidAmount) || 0;

  const subtotal = bagCountNum * ratePerBagNum;
  const totalBill = Math.max(0, subtotal - discountNum);
  const due = totalBill - paidNum;
  const kgNum = bagCountNum * bagSize;
  const purchasePrice = selectedProduct?.purchasePricePerKg || 0;
  const profitLoss = totalBill - kgNum * purchasePrice;

  const handleAddCustomer = async () => {
    if (!newCustName.trim()) return showToast("⚠️ দোকানের নাম দাও");
    setSavingCustomer(true);
    try {
      const res = await axiosInstance.post("/customers", { name: newCustName, phone: newCustPhone });
      setCustomers((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(res.data._id);
      setAddCustomerOpen(false);
      setNewCustName("");
      setNewCustPhone("");
      showToast("✅ নতুন দোকান যোগ হয়েছে");
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "দোকান যোগ করা যায়নি"));
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleSave = async () => {
    if (!customerId) return showToast("⚠️ দোকান বেছে নাও");
    if (!productId) return showToast("⚠️ Product বেছে নাও");
    if (!bagSize) return showToast("⚠️ এই Product এর বস্তার ওজন Product Master এ সেট করা নেই");
    if (!bagCount) return showToast("⚠️ বস্তা সংখ্যা দাও");
    if (!ratePerBag) return showToast("⚠️ প্রতি বস্তার রেট দাও");
    if (bagCountNum > availableBags) {
      return showToast(`⚠️ Stock এ মাত্র ${availableBags} বস্তা আছে`);
    }
    if (due < 0) return showToast("⚠️ Paid Amount বিলের চেয়ে বেশি হতে পারবে না");
    if (paidNum > 0 && !fundId) return showToast("⚠️ Paid Amount দিলে Fund বেছে নাও");

    setSaving(true);
    try {
      await axiosInstance.post("/sales", {
        date,
        customerId,
        productId,
        bagCount: bagCountNum,
        ratePerBag: ratePerBagNum,
        discount: discountNum || undefined,
        paidAmount: paidNum || undefined,
        fundId: paidNum > 0 ? fundId : undefined,
      });
      showToast("✅ Sale Save হয়েছে");
      setModalOpen(false);
      fetchAll();
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "কিছু একটা সমস্যা হয়েছে"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axiosInstance.delete(`/sales/${deleteTarget._id}`);
      showToast("✅ Sale Delete হয়েছে");
      setDeleteTarget(null);
      fetchAll();
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "Delete করা যায়নি"));
    }
  };

  const totalRevenue = sales.reduce((s, x) => s + x.totalBill, 0);
  const totalProfitLoss = sales.reduce((s, x) => s + x.totalProfit, 0);
  const totalDue = sales.reduce((s, x) => s + x.due, 0);
  const totalDiscount = sales.reduce((s, x) => s + x.discount, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1f2b22]">Sale / Stock Out</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Product ও বস্তা সংখ্যা দাও — সব হিসাব auto হয়ে যাবে, চাইলে Discount দাও
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-[#1f2b22] hover:bg-[#28392f] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          + নতুন Sale
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3 mb-4">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-[#1f2b22]">৳{totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">মোট বিক্রি (Revenue)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className={`text-2xl font-bold ${totalProfitLoss >= 0 ? "text-emerald-700" : "text-red-500"}`}>
            {totalProfitLoss >= 0 ? "+" : ""}৳{totalProfitLoss.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">মোট Profit / Loss</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-amber-600">৳{totalDue.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">মোট বাকি (Due)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-500">৳{totalDiscount.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">মোট Discount দেওয়া হয়েছে</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">লোড হচ্ছে...</div>
      ) : sales.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
          কোনো Sale নেই
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500 text-xs uppercase">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">দোকান</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">বস্তা</th>
                  <th className="px-4 py-3">Rate/বস্তা</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">P/L</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s._id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.date}</td>
                    <td className="px-4 py-3 font-medium text-[#1f2b22]">{s.customerName}</td>
                    <td className="px-4 py-3 text-gray-600">{s.productName}</td>
                    <td className="px-4 py-3 text-gray-600">{s.bagCount}</td>
                    <td className="px-4 py-3 text-gray-600">৳{s.ratePerBag}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.discount > 0 ? `৳${s.discount.toLocaleString()}` : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">৳{s.totalBill.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600">৳{s.paidAmount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {s.due > 0 ? (
                        <span className="text-amber-600 font-semibold">৳{s.due.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-300">০</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={s.totalProfit >= 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                        {s.totalProfit >= 0 ? "+" : ""}৳{s.totalProfit.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDeleteTarget(s)} className="text-xs text-red-500 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {sales.map((s) => (
              <div key={s._id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-[#1f2b22]">{s.customerName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.date} · {s.productName}
                    </p>
                  </div>
                  <span className={s.totalProfit >= 0 ? "text-emerald-600 font-bold text-sm" : "text-red-500 font-bold text-sm"}>
                    {s.totalProfit >= 0 ? "+" : ""}৳{s.totalProfit.toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span>{s.bagCount} বস্তা × ৳{s.ratePerBag} = ৳{s.subtotal.toLocaleString()}</span>
                  {s.discount > 0 && <span>Discount: ৳{s.discount.toLocaleString()}</span>}
                  <span>Total: ৳{s.totalBill.toLocaleString()}</span>
                  <span>Paid: ৳{s.paidAmount.toLocaleString()}</span>
                  {s.due > 0 && <span className="text-amber-600 font-semibold">Due: ৳{s.due.toLocaleString()}</span>}
                </div>
                <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => setDeleteTarget(s)} className="text-xs font-semibold text-red-500">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[#1f2b22] mb-4">নতুন Sale</h2>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-gray-500">দোকান *</label>
                  <button
                    type="button"
                    onClick={() => setAddCustomerOpen(true)}
                    className="text-xs text-[#1f2b22] font-semibold hover:underline"
                  >
                    + নতুন দোকান
                  </button>
                </div>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">দোকান বেছে নাও</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} {c.due > 0 ? `(আগের বাকি ৳${c.due.toLocaleString()})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Product (কয়টা) *</label>
                <select
                  value={productId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Product বেছে নাও</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {productId && (
                  <p className="text-xs text-gray-400 mt-1">
                    {bagSize > 0 ? (
                      <>
                        Stock এ আছে: <span className="font-semibold">{availableBags} বস্তা</span> ({bagSize}kg/বস্তা হিসাবে)
                      </>
                    ) : (
                      <span className="text-red-500">
                        ⚠️ এই Product এর বস্তার ওজন সেট করা নেই — Product Master এ গিয়ে সেট করো
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">বস্তা সংখ্যা (কয়টা) *</label>
                  <input
                    type="number"
                    value={bagCount}
                    onChange={(e) => setBagCount(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="5"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Rate / বস্তা (৳) *</label>
                  <input
                    type="number"
                    value={ratePerBag}
                    onChange={(e) => setRatePerBag(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="2000"
                  />
                </div>
              </div>
              {selectedProduct?.salePricePerBag ? (
                <p className="text-[11px] text-gray-400 -mt-2">
                  Product এর default rate: ৳{selectedProduct.salePricePerBag}/বস্তা (চাইলে বদলাতে পারো)
                </p>
              ) : null}

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Discount (৳, ঐচ্ছিক)</label>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="ছাড় দিতে চাইলে লিখো"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">মোট বিক্রি মূল্য (৳)</label>
                <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm font-bold text-[#1f2b22]">
                  ৳{totalBill.toLocaleString()}
                </div>
                {discountNum > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    ({bagCountNum} × ৳{ratePerBagNum} = ৳{subtotal.toLocaleString()}) − Discount ৳
                    {discountNum.toLocaleString()}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Paid Amount (৳)</label>
                <input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="পুরো টাকা পেলে totalBill এর সমান লিখো, না হলে যা পেয়েছো"
                />
              </div>

              {paidNum > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Fund Source *</label>
                  <select
                    value={fundId}
                    onChange={(e) => setFundId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Fund বেছে নাও (কোথায় জমা হবে)</option>
                    {funds
                      .filter((f) => f.name !== "Profit Fund")
                      .map((f) => (
                        <option key={f._id} value={f._id}>
                          {f.name} (৳{f.balance.toLocaleString()})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            {bagCountNum > 0 && ratePerBagNum > 0 && (
              <div className="bg-[#f6f5f1] rounded-lg p-4 mt-4 flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Due (বাকি থাকবে)</span>
                  <span className={`font-semibold ${due > 0 ? "text-amber-600" : "text-gray-400"}`}>
                    ৳{due.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1">
                  <span className="text-gray-600 font-semibold">এই Sale এ Profit/Loss</span>
                  <span className={`font-bold ${profitLoss >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {profitLoss >= 0 ? "+" : ""}৳{profitLoss.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[#1f2b22] hover:bg-[#28392f] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Sale Save করো"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addCustomerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setAddCustomerOpen(false)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#1f2b22] mb-4">নতুন দোকান যোগ করো</h3>
            <div className="flex flex-col gap-3">
              <input
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="দোকানের নাম"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
              <input
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="ফোন (ঐচ্ছিক)"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setAddCustomerOpen(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleAddCustomer}
                disabled={savingCustomer}
                className="flex-1 bg-[#1f2b22] hover:bg-[#28392f] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {savingCustomer ? "..." : "যোগ করো"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-600 mb-1">তুমি কি নিশ্চিত?</p>
            <p className="font-semibold text-[#1f2b22] mb-5">
              "{deleteTarget.customerName}" এর Sale Delete হয়ে যাবে
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold"
              >
                Delete করো
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1f2b22] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
          {toastMsg}
        </div>
      )}
    </div>
  );
};

export default SalePage;