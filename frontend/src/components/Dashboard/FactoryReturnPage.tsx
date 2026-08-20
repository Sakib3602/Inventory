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
  amount: string; // এই লাইনের মোট টাকা
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
    costPerKg: number;
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
  const [loadError, setLoadError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fundId, setFundId] = useState("");
  const [items, setItems] = useState<ReturnItemInput[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FactoryReturn | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2800);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
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
      setLoadError(err?.response?.data?.message || "Data লোড করতে সমস্যা হয়েছে");
      showToast("⚠️ Data লোড করতে সমস্যা হয়েছে");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const selectedOrder = pendingOrders.find((o) => o._id === selectedOrderId);
  const pendingBags = selectedOrder ? selectedOrder.bagCount - selectedOrder.returnedBags : 0;
  // Order এ যেই kg/বসতা দেওয়া হয়েছিল, সেটাই এখানে ব্যবহার হবে — আবার নতুন করে জিজ্ঞেস করা হবে না
  const kgPerBagFromOrder = selectedOrder ? selectedOrder.weightPerBag : 0;
  const selectedCompany = selectedOrder
    ? companies.find((c) => c._id === selectedOrder.companyId)
    : undefined;
  const availableAdvance = selectedCompany?.advanceBalance || 0;

  const openAddModal = () => {
    setSelectedOrderId("");
    setDate(new Date().toISOString().slice(0, 10));
    setFundId(funds[0]?._id || "");
    setItems([emptyItem()]);
    setModalOpen(true);
  };

  const updateItem = (index: number, field: keyof ReturnItemInput, value: string) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addItemRow = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItemRow = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  // প্রতিটা লাইনের auto calculation — বসতা সংখ্যা × Order-এর kg/বসতা = মোট kg
  const calcLine = (item: ReturnItemInput) => {
    const bags = Number(item.bagCount) || 0;
    const amount = Number(item.amount) || 0;
    const totalKg = bags * kgPerBagFromOrder;
    const costPerKg = totalKg > 0 ? amount / totalKg : 0;
    return { totalKg, costPerKg };
  };

  const totalBagsUsed = items.reduce((s, it) => s + (Number(it.bagCount) || 0), 0);
  const totalKgAll = items.reduce((s, it) => s + calcLine(it).totalKg, 0);
  const totalBillAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const advanceUsed = Math.min(availableAdvance, totalBillAmount);
  const remainingToPay = totalBillAmount - advanceUsed;
  const selectedFund = funds.find((f) => f._id === fundId);

  const handleSave = async () => {
    if (!selectedOrderId) return showToast("⚠️ একটা Order বেছে নাও");

    const validItems = items.filter((it) => it.productId && it.bagCount && it.amount);
    if (validItems.length === 0) return showToast("⚠️ অন্তত একটা Product line ঠিকমতো পূরণ করো");

    if (totalBagsUsed > pendingBags) {
      return showToast(`⚠️ এই Order-এ মাত্র ${pendingBags}টা বসতা বাকি আছে`);
    }
    if (remainingToPay > 0 && !fundId) {
      return showToast("⚠️ বাকি টাকার জন্য Fund Source বেছে নাও");
    }

    // backend contract অনুযায়ী totalKg পাঠাতে হবে (bagCount × Order-এর kg/বসতা থেকে বের করা)
    const payloadItems = validItems.map((it) => {
      const { totalKg } = calcLine(it);
      return {
        productId: it.productId,
        bagCount: it.bagCount,
        totalKg,
        amount: it.amount,
      };
    });

    setSaving(true);
    try {
      await axiosInstance.post("/factory-returns", {
        orderId: selectedOrderId,
        date,
        fundId: remainingToPay > 0 ? fundId : undefined,
        items: payloadItems,
      });
      showToast("✅ Return Save হয়েছে, Stock ও Purchase Price আপডেট হয়েছে");
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
      await axiosInstance.delete(`/factory-returns/${deleteTarget._id}`);
      showToast("✅ Return Delete হয়েছে");
      setDeleteTarget(null);
      fetchAll();
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "Delete করা যায়নি"));
    }
  };

  // এই Return এর পরে ঐ Order-এ কয়টা বসতা এখনো বাকি আছে সেটা বের করা
  const getBagsStatusForReturn = (ret: FactoryReturn) => {
    const order = allOrders.find((o) => o._id === ret.orderId);
    if (!order) return null;
    const remaining = order.bagCount - order.returnedBags;
    return { totalOrdered: order.bagCount, remaining };
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1f2b22]">Factory Return (বসতা ফেরত)</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            বসতা ভর্তি হয়ে এলে বসতা সংখ্যা + টাকা দাও — kg/বসতা Order থেকেই নেওয়া হবে, Advance auto adjust হবে
          </p>
        </div>
        <button
          onClick={openAddModal}
          disabled={pendingOrders.length === 0}
          className="bg-[#1f2b22] hover:bg-[#28392f] disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          + নতুন Return
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3 mb-4">
          {loadError}
        </div>
      )}

      {!loading && pendingOrders.length === 0 && !loadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg p-3 mb-4">
          এখনো কোনো Pending Order নেই — আগে Factory Order page থেকে একটা Order বানাও
        </div>
      )}

      {pendingOrders.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-gray-500 mb-3">যেসব Order-এ এখনো বসতা বাকি আছে</p>
          <div className="flex flex-wrap gap-2">
            {pendingOrders.map((o) => (
              <div key={o._id} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="font-semibold text-[#1f2b22]">{o.company}</span> —{" "}
                {o.bagCount - o.returnedBags}/{o.bagCount} বসতা বাকি
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">লোড হচ্ছে...</div>
      ) : returns.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
          কোনো Return নেই
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {returns.map((r) => {
            const bagsStatus = getBagsStatusForReturn(r);
            return (
              <div key={r._id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-[#1f2b22]">{r.company}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.date} · এই Return-এ এসেছে: {r.totalBagsUsed} বসতা
                      {r.fundName ? ` · Fund: ${r.fundName}` : ""}
                    </p>
                    {bagsStatus && (
                      <p className="text-xs mt-1">
                        <span className="text-gray-500">
                          এই Order-এ মোট {bagsStatus.totalOrdered} বসতা পাঠানো হয়েছিল,{" "}
                        </span>
                        {bagsStatus.remaining > 0 ? (
                          <span className="text-amber-600 font-semibold">এখনো {bagsStatus.remaining}টা বাকি আছে</span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">সব বসতা ফেরত এসেছে ✓</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#1f2b22]">৳{r.totalBillAmount.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">
                      {r.advanceUsed > 0 && `Advance থেকে: ৳${r.advanceUsed.toLocaleString()} · `}
                      নতুন দেওয়া: ৳{r.remainingPaid.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 text-left">
                        <th className="pb-2">Product</th>
                        <th className="pb-2">বসতা</th>
                        <th className="pb-2">kg/বসতা</th>
                        <th className="pb-2">মোট kg</th>
                        <th className="pb-2">টাকা</th>
                        <th className="pb-2">৳/kg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.items.map((it, i) => (
                        <tr key={i} className="text-gray-600">
                          <td className="py-1 font-medium text-[#1f2b22]">{it.productName}</td>
                          <td className="py-1">{it.bagCount}</td>
                          <td className="py-1">
                            {it.bagCount > 0 ? (it.totalKg / it.bagCount).toFixed(1) : "-"}
                          </td>
                          <td className="py-1">{it.totalKg.toLocaleString()}</td>
                          <td className="py-1">৳{it.amount.toLocaleString()}</td>
                          <td className="py-1 font-semibold">৳{it.costPerKg.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => setDeleteTarget(r)} className="text-xs text-red-500 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[#1f2b22] mb-4">নতুন Factory Return</h2>

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 block mb-1">কোন Order *</label>
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Order বেছে নাও</option>
                {pendingOrders.map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.company} — {o.date} ({o.bagCount - o.returnedBags}/{o.bagCount} বসতা বাকি)
                  </option>
                ))}
              </select>
              {selectedOrder && (
                <p className="text-xs text-gray-400 mt-1">
                  বাকি আছে {pendingBags}টা বসতা · এই Order এর kg/বসতা:{" "}
                  <span className="font-semibold text-[#1f2b22]">{kgPerBagFromOrder}kg</span> (Order থেকে নেওয়া, বদলানো যাবে না)
                  {availableAdvance > 0 && (
                    <span className="text-emerald-600 font-semibold">
                      {" "}
                      · Advance জমা আছে: ৳{availableAdvance.toLocaleString()}
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 block mb-1">Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-gray-500">Product Lines *</label>
              {items.map((item, index) => {
                const { totalKg, costPerKg } = calcLine(item);
                return (
                  <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <select
                        value={item.productId}
                        onChange={(e) => updateItem(index, "productId", e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="">Product বেছে নাও (কী এসেছে)</option>
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
                          className="text-xs text-red-500 justify-self-end"
                        >
                          ✕ সরাও
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={item.bagCount}
                        onChange={(e) => updateItem(index, "bagCount", e.target.value)}
                        placeholder="বসতা সংখ্যা"
                        disabled={!selectedOrderId}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                      />
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(e) => updateItem(index, "amount", e.target.value)}
                        placeholder="মোট টাকা"
                        disabled={!selectedOrderId}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                      />
                    </div>
                    {totalKg > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        {item.bagCount} বসতা × {kgPerBagFromOrder}kg = মোট{" "}
                        <span className="font-semibold">{totalKg.toLocaleString()} kg</span> · প্রতি kg:{" "}
                        <span className="font-semibold">৳{costPerKg.toFixed(2)}</span>
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addItemRow}
                disabled={!selectedOrderId}
                className="text-sm text-[#1f2b22] font-semibold border border-dashed border-gray-300 rounded-lg py-2 hover:bg-gray-50 disabled:opacity-40"
              >
                + আরেকটা Product যোগ করো
              </button>
            </div>

            {/* Bill Summary */}
            <div className="bg-[#f6f5f1] rounded-lg p-4 mt-4 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">ব্যবহৃত বসতা</span>
                <span className="font-semibold text-[#1f2b22]">
                  {totalBagsUsed} / {pendingBags} বাকি
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">মোট kg</span>
                <span className="font-semibold text-[#1f2b22]">{totalKgAll.toLocaleString()} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">মোট বিল</span>
                <span className="font-semibold text-[#1f2b22]">৳{totalBillAmount.toLocaleString()}</span>
              </div>
              {advanceUsed > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Advance থেকে কাটা হবে</span>
                  <span className="font-semibold">-৳{advanceUsed.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1">
                <span className="text-gray-600 font-semibold">এখন নতুন করে দিতে হবে</span>
                <span className="font-bold text-[#1f2b22]">৳{remainingToPay.toLocaleString()}</span>
              </div>
            </div>

            {remainingToPay > 0 && (
              <div className="mt-4">
                <label className="text-xs font-semibold text-gray-500 block mb-1">Fund Source *</label>
                <select
                  value={fundId}
                  onChange={(e) => setFundId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Fund বেছে নাও</option>
                  {funds.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} (৳{f.balance.toLocaleString()})
                    </option>
                  ))}
                </select>
                {selectedFund && remainingToPay > selectedFund.balance && (
                  <p className="text-xs text-red-500 mt-1">⚠️ যথেষ্ট টাকা নেই</p>
                )}
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
                {saving ? "Saving..." : "Return Save করো"}
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
            <p className="font-semibold text-[#1f2b22] mb-5">"{deleteTarget.company}" এর Return Delete হয়ে যাবে</p>
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

export default FactoryReturnPage;