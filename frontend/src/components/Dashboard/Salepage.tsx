import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import axiosInstance from "../../URI/axiosInstance";

interface ApiErrorResponse {
  message?: string;
}
const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.message || fallback;
  }
  return fallback;
};

interface Customer {
  _id: string;
  name: string;
  phone: string;
  totalDue: number;
}

interface Product {
  _id: string;
  name: string;
  salePricePerKg: number;
  status: string;
}

interface StockRow {
  productId: string;
  productName: string;
  currentKg: number;
  bagSize: number;
  fullBags: number;
  brokenKg: number; // ভাঙা বস্তার loose kg
}

interface Fund {
  _id: string;
  name: string;
  balance: number;
}

interface SaleItemInput {
  productId: string;
  quantityKg: string;
  ratePerKg: string;
}

interface SaleItem {
  productId: string;
  productName: string;
  quantityKg: number;
  ratePerKg: number;
  amount: number;
}

interface Sale {
  _id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  date: string;
  items: SaleItem[];
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  fundName: string | null;
  createdAt: string;
}

const emptyItem = (): SaleItemInput => ({ productId: "", quantityKg: "", ratePerKg: "" });

const PAGE_SIZE = 10;

const SalePage = () => {
  /* ---------- reference data ---------- */
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);

  /* ---------- quick add customer ---------- */
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custSaving, setCustSaving] = useState(false);

  /* ---------- sale entry form ---------- */
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<SaleItemInput[]>([emptyItem()]);
  const [paidAmount, setPaidAmount] = useState("");
  const [fundId, setFundId] = useState("");
  const [saleSaving, setSaleSaving] = useState(false);

  /* ---------- sale list ---------- */
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [listLoading, setListLoading] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2800);
  };

  /* ---------- fetchers ---------- */
  const fetchReferenceData = useCallback(async () => {
    try {
      const [custRes, prodRes, stockRes, fundRes] = await Promise.all([
        axiosInstance.get("/customers"),
        axiosInstance.get("/products", { params: { status: "active" } }),
        axiosInstance.get("/stock"),
        axiosInstance.get("/funds"),
      ]);
      setCustomers(custRes.data);
      setProducts(prodRes.data);
      setStock(stockRes.data);
      setFunds(fundRes.data);
    } catch (err) {
      showToast("⚠️ " + getErrorMessage(err, "Data লোড করতে সমস্যা হয়েছে"));
    }
  }, []);

  const fetchSales = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await axiosInstance.get("/sales", {
        params: {
          search: search || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          page,
          limit: PAGE_SIZE,
        },
      });
      setSales(res.data.sales);
      setTotalPages(res.data.totalPages);
      setTotalCount(res.data.totalCount);
    } catch (err) {
      showToast("⚠️ " + getErrorMessage(err, "Sale List লোড করতে সমস্যা হয়েছে"));
    } finally {
      setListLoading(false);
    }
  }, [search, fromDate, toDate, page]);

  useEffect(() => {
    fetchReferenceData();
  }, [fetchReferenceData]);

  useEffect(() => {
    const timer = setTimeout(() => fetchSales(), 300);
    return () => clearTimeout(timer);
  }, [fetchSales]);

  // filter বদলালে page 1 এ ফিরিয়ে আনা
  useEffect(() => {
    setPage(1);
  }, [search, fromDate, toDate]);

  /* ---------- quick add customer ---------- */
  const handleAddCustomer = async () => {
    if (!custName.trim() || !custPhone.trim() || !custAddress.trim()) {
      return showToast("⚠️ Name, Phone, Address — সবগুলো দাও");
    }
    setCustSaving(true);
    try {
      const res = await axiosInstance.post("/customers", {
        name: custName,
        phone: custPhone,
        address: custAddress,
      });
      showToast("✅ দোকান Save হয়েছে");
      setCustName("");
      setCustPhone("");
      setCustAddress("");
      await fetchReferenceData();
      setCustomerId(res.data._id);
    } catch (err) {
      showToast("⚠️ " + getErrorMessage(err, "Save করা যায়নি"));
    } finally {
      setCustSaving(false);
    }
  };

  /* ---------- sale entry helpers ---------- */
  const stockMap = useMemo(() => {
    const map: Record<string, StockRow> = {};
    stock.forEach((s) => (map[s.productId] = s));
    return map;
  }, [stock]);

  const updateItem = (index: number, field: keyof SaleItemInput, value: string) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };

      // Product বদলালে rate auto-fill sale price থেকে
      if (field === "productId") {
        const product = products.find((p) => p._id === value);
        copy[index].ratePerKg = product ? String(product.salePricePerKg || "") : "";
      }
      return copy;
    });
  };

  const addItemRow = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItemRow = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const lineAmount = (item: SaleItemInput) => {
    const qty = Number(item.quantityKg) || 0;
    const rate = Number(item.ratePerKg) || 0;
    return qty * rate;
  };

  const totalBillAmount = items.reduce((s, it) => s + lineAmount(it), 0);
  const paidNum = Number(paidAmount) || 0;
  const dueNum = Math.max(0, totalBillAmount - paidNum);
  const selectedCustomer = customers.find((c) => c._id === customerId);
  const selectedFund = funds.find((f) => f._id === fundId);

  const resetSaleForm = () => {
    setCustomerId("");
    setDate(new Date().toISOString().slice(0, 10));
    setItems([emptyItem()]);
    setPaidAmount("");
    setFundId(funds.find((f) => f.name === "Cash in Hand")?._id || funds[0]?._id || "");
  };

  useEffect(() => {
    if (!fundId && funds.length > 0) {
      setFundId(funds.find((f) => f.name === "Cash in Hand")?._id || funds[0]._id);
    }
  }, [funds, fundId]);

  const handleSaveSale = async () => {
    if (!customerId) return showToast("⚠️ Customer বেছে নাও");
    const validItems = items.filter((it) => it.productId && it.quantityKg && it.ratePerKg);
    if (validItems.length === 0) return showToast("⚠️ অন্তত একটা Product line ঠিকমতো পূরণ করো");

    for (const it of validItems) {
      const stockRow = stockMap[it.productId];
      const available = stockRow?.currentKg || 0;
      if (Number(it.quantityKg) > available) {
        const product = products.find((p) => p._id === it.productId);
        return showToast(`⚠️ ${product?.name || "Product"} এ Stock আছে মাত্র ${available}kg`);
      }
    }

    setSaleSaving(true);
    try {
      await axiosInstance.post("/sales", {
        customerId,
        date,
        items: validItems.map((it) => ({
          productId: it.productId,
          quantityKg: it.quantityKg,
          ratePerKg: it.ratePerKg,
        })),
        paidAmount: paidNum,
        fundId: paidNum > 0 ? fundId : undefined,
      });
      showToast("✅ Sale Save হয়েছে, Stock কমে গেছে");
      resetSaleForm();
      fetchReferenceData();
      fetchSales();
    } catch (err) {
      showToast("⚠️ " + getErrorMessage(err, "কিছু একটা সমস্যা হয়েছে"));
    } finally {
      setSaleSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axiosInstance.delete(`/sales/${deleteTarget._id}`);
      showToast("✅ Sale Delete হয়েছে, Stock ও হিসাব ফেরত গেছে");
      setDeleteTarget(null);
      fetchReferenceData();
      fetchSales();
    } catch (err) {
      showToast("⚠️ " + getErrorMessage(err, "Delete করা যায়নি"));
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1f2b22]">Sale / Stock Out</h1>
        <p className="text-sm text-gray-400 mt-0.5">দোকানে বিক্রির entry — টাকা কম দিলে বাকি auto হিসাব হবে</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 mb-8">
        {/* ---------------- Quick Add Customer ---------------- */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 h-fit">
          <p className="text-sm font-semibold text-[#1f2b22] mb-3">— নতুন দোকান যোগ করো (প্রথমবার)</p>
          <div className="flex flex-col gap-2">
            <input
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder="দোকানের নাম *"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={custPhone}
              onChange={(e) => setCustPhone(e.target.value)}
              placeholder="ফোন *"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={custAddress}
              onChange={(e) => setCustAddress(e.target.value)}
              placeholder="ঠিকানা *"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleAddCustomer}
              disabled={custSaving}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold py-2.5 rounded-lg mt-1 disabled:opacity-50"
            >
              {custSaving ? "Saving..." : "দোকান Save করো"}
            </button>
          </div>

          {/* ---- Available Stock quick view ---- */}
          {stock.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">বর্তমান Stock</p>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                {stock.map((s) => (
                  <div key={s.productId} className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="font-semibold text-[#1f2b22]">{s.productName}</span>
                    <div className="text-gray-500">
                      {s.currentKg.toLocaleString()}kg
                      {s.bagSize > 0 && (
                        <>
                          {" "}
                          · {s.fullBags} বস্তা
                          {s.brokenKg > 0 && (
                            <span className="text-amber-600"> + ভাঙা {s.brokenKg}kg</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---------------- Sale Entry ---------------- */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1f2b22] mb-4">— SALE ENTRY</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">দোকান *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">দোকান বেছে নাও</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.phone}){c.totalDue > 0 ? ` — বাকি ৳${c.totalDue.toLocaleString()}` : ""}
                  </option>
                ))}
              </select>
              {selectedCustomer && selectedCustomer.totalDue > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  ⚠️ আগের বাকি আছে ৳{selectedCustomer.totalDue.toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <label className="text-xs font-semibold text-gray-500 block mb-1">Item</label>
          <div className="flex flex-col gap-3">
            {items.map((item, index) => {
              const stockRow = stockMap[item.productId];
              return (
                <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-2">
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(index, "productId", e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Product বেছে নাও</option>
                      {products.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(index)}
                        className="text-xs text-red-500"
                      >
                        ✕ সরাও
                      </button>
                    )}
                  </div>

                  {stockRow && (
                    <p className="text-xs text-gray-500 mb-2">
                      Available: {stockRow.currentKg.toLocaleString()}kg
                      {stockRow.bagSize > 0 && (
                        <>
                          {" "}
                          ({stockRow.fullBags} বস্তা
                          {stockRow.brokenKg > 0 ? ` + ভাঙা ${stockRow.brokenKg}kg` : ""})
                        </>
                      )}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-0.5">Quantity (kg)</label>
                      <input
                        type="number"
                        value={item.quantityKg}
                        onChange={(e) => updateItem(index, "quantityKg", e.target.value)}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-0.5">Rate per kg (৳)</label>
                      <input
                        type="number"
                        value={item.ratePerKg}
                        onChange={(e) => updateItem(index, "ratePerKg", e.target.value)}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      />
                    </div>
                  </div>

                  {lineAmount(item) > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      = <span className="font-semibold text-[#1f2b22]">৳{lineAmount(item).toLocaleString()}</span>
                    </p>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addItemRow}
              className="text-sm text-[#1f2b22] font-semibold border border-dashed border-gray-300 rounded-lg py-2 hover:bg-gray-50"
            >
              + আরেকটা Product যোগ করো
            </button>
          </div>

          {/* Bill summary */}
          <div className="bg-[#f6f5f1] rounded-lg p-4 mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">মোট বিল</span>
              <span className="font-bold text-[#1f2b22]">৳{totalBillAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Paid Amount (৳)</label>
              <input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            {paidNum > 0 && (
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Fund</label>
                <select
                  value={fundId}
                  onChange={(e) => setFundId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  {funds.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} (৳{f.balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {dueNum > 0 && (
            <p className="text-sm mt-3">
              বাকি থাকবে: <span className="font-bold text-red-500">৳{dueNum.toLocaleString()}</span>
              {selectedCustomer && <span className="text-gray-400"> — {selectedCustomer.name} এর নামে জমা হবে</span>}
            </p>
          )}

          <button
            onClick={handleSaveSale}
            disabled={saleSaving}
            className="w-full bg-[#1f2b22] hover:bg-[#28392f] text-white font-semibold py-2.5 rounded-lg mt-4 disabled:opacity-50"
          >
            {saleSaving ? "Saving..." : "Sale Save করো"}
          </button>
        </div>
      </div>

      {/* ---------------- Recent Sales ---------------- */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-sm font-semibold text-[#1f2b22]">সাম্প্রতিক SALE ({totalCount})</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="দোকান/ফোন খুঁজো..."
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-40"
            />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs"
            />
            {(search || fromDate || toDate) && (
              <button
                onClick={() => {
                  setSearch("");
                  setFromDate("");
                  setToDate("");
                }}
                className="text-xs text-gray-400 hover:text-gray-600 px-2"
              >
                Clear ✕
              </button>
            )}
          </div>
        </div>

        {listLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">লোড হচ্ছে...</div>
        ) : sales.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">কোনো Sale পাওয়া যায়নি</div>
        ) : (
          <div className="flex flex-col gap-3">
            {sales.map((s) => (
              <div key={s._id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-[#1f2b22]">{s.customerName}</p>
                    <p className="text-xs text-gray-400">
                      {s.date} · {s.customerPhone}
                      {s.fundName ? ` · Fund: ${s.fundName}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#1f2b22]">৳{s.totalAmount.toLocaleString()}</p>
                    <p className="text-xs">
                      <span className="text-emerald-600">Paid: ৳{s.paidAmount.toLocaleString()}</span>
                      {s.dueAmount > 0 && (
                        <span className="text-red-500"> · Due: ৳{s.dueAmount.toLocaleString()}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-2 mt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 text-left">
                        <th className="pb-1">Item</th>
                        <th className="pb-1">kg</th>
                        <th className="pb-1">Rate</th>
                        <th className="pb-1">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.items.map((it, i) => (
                        <tr key={i} className="text-gray-600">
                          <td className="py-0.5 font-medium text-[#1f2b22]">{it.productName}</td>
                          <td className="py-0.5">{it.quantityKg}kg</td>
                          <td className="py-0.5">৳{it.ratePerKg}</td>
                          <td className="py-0.5">৳{it.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
                  <button onClick={() => setDeleteTarget(s)} className="text-xs text-red-500 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40"
            >
              আগে
            </button>
            <span className="text-xs text-gray-500">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40"
            >
              পরে
            </button>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-600 mb-1">তুমি কি নিশ্চিত?</p>
            <p className="font-semibold text-[#1f2b22] mb-2">
              "{deleteTarget.customerName}" এর Sale Delete হয়ে যাবে
            </p>
            <p className="text-xs text-gray-400 mb-3">Stock ও Customer এর বাকি হিসাব ফেরত যাবে</p>
            <div className="flex gap-3 mt-2">
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