import axios from "axios";
import { useEffect, useState, useCallback } from "react";
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
  advanceAmount: number;
  advanceFundName: string | null;
  createdAt: string;
}

const toNumber = (value: unknown) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeOrder = (order: Record<string, unknown>): FactoryOrder => {
  const bagCount = toNumber(order.bagCount);
  const weightPerBag = toNumber(order.weightPerBag);

  return {
    ...(order as unknown as FactoryOrder),
    bagCount,
    weightPerBag,
    expectedTotalKg: toNumber(order.expectedTotalKg) || bagCount * weightPerBag,
    returnedBags: toNumber(order.returnedBags),
    advanceAmount: toNumber(order.advanceAmount),
  };
};

const FactoryOrderPage = () => {
  const [orders, setOrders] = useState<FactoryOrder[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bagCount, setBagCount] = useState("");
  const [weightPerBag, setWeightPerBag] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [fundId, setFundId] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FactoryOrder | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [ordersRes, fundsRes] = await Promise.all([
        axiosInstance.get("/factory-orders"),
        axiosInstance.get("/funds"),
      ]);
      const rawOrders = ordersRes.data as Record<string, unknown>[];
      setOrders(rawOrders.map(normalizeOrder));
      setFunds(fundsRes.data);
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err, "Data লোড করতে সমস্যা হয়েছে"));
      showToast("⚠️ Data লোড করতে সমস্যা হয়েছে");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAll();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchAll]);

  const openAddModal = () => {
    setCompany("");
    setDate(new Date().toISOString().slice(0, 10));
    setBagCount("");
    setWeightPerBag("");
    setAdvanceAmount("");
    setFundId(funds[0]?._id || "");
    setModalOpen(true);
  };

  const expectedTotalKg = (Number(bagCount) || 0) * (Number(weightPerBag) || 0);
  const advanceNum = Number(advanceAmount) || 0;
  const selectedFund = funds.find((f) => f._id === fundId);

  const handleSave = async () => {
    if (!company.trim()) return showToast("⚠️ Company Name দাও");
    if (!bagCount || !weightPerBag) return showToast("⚠️ বসতা সংখ্যা ও kg/বসতা দাও");
    if (advanceNum > 0 && !fundId) return showToast("⚠️ Advance দিলে Fund বেছে নাও");

    setSaving(true);
    try {
      await axiosInstance.post("/factory-orders", {
        company,
        date,
        bagCount,
        weightPerBag,
        advanceAmount: advanceNum || undefined,
        fundId: advanceNum > 0 ? fundId : undefined,
      });
      showToast("✅ Order Save হয়েছে");
      setModalOpen(false);
      fetchAll();
    } catch (err: unknown) {
      showToast("⚠️ " + getErrorMessage(err, "কিছু একটা সমস্যা হয়েছে"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axiosInstance.delete(`/factory-orders/${deleteTarget._id}`);
      showToast("✅ Order Delete হয়েছে");
      setDeleteTarget(null);
      fetchAll();
    } catch (err: unknown) {
      showToast("⚠️ " + getErrorMessage(err, "Delete করা যায়নি"));
    }
  };

  const statusBadge = (status: string) => {
    if (status === "completed")
      return (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
          Completed
        </span>
      );
    if (status === "partial")
      return (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
          Partial
        </span>
      );
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600">Pending</span>
    );
  };

  const totalOrders = orders.length;
  const pendingOrdersCount = orders.filter((o) => o.status !== "completed").length;
  const totalPendingBags = orders.reduce((s, o) => s + Math.max(0, o.bagCount - o.returnedBags), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1f2b22]">Factory Order (বসতা পাঠানো)</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            শুধু পরিকল্পনা — বসতা সংখ্যা + kg/বসতা দাও, চাইলে Advance দাও, বাকি টাকা Return এ হিসাব হবে
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-[#1f2b22] hover:bg-[#28392f] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          + নতুন Order
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3 mb-4">
          {loadError}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-[#1f2b22]">{totalOrders}</p>
          <p className="text-xs text-gray-400 mt-1">Total Order</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-amber-600">{pendingOrdersCount}</p>
          <p className="text-xs text-gray-400 mt-1">Pending / Partial Order</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-red-500">{totalPendingBags}</p>
          <p className="text-xs text-gray-400 mt-1">মোট Pending বসতা</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">লোড হচ্ছে...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
          কোনো Order নেই
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500 text-xs uppercase">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">বসতা</th>
                  <th className="px-4 py-3">kg/বসতা</th>
                  <th className="px-4 py-3">সম্ভাব্য kg</th>
                  <th className="px-4 py-3">Advance</th>
                  <th className="px-4 py-3">Pending বসতা</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const pendingBags = Math.max(0, o.bagCount - o.returnedBags);
                  return (
                    <tr key={o._id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-3 font-medium text-[#1f2b22]">{o.company}</td>
                      <td className="px-4 py-3 text-gray-600">{o.date}</td>
                      <td className="px-4 py-3 text-gray-600">{o.bagCount}</td>
                      <td className="px-4 py-3 text-gray-600">{o.weightPerBag} kg</td>
                      <td className="px-4 py-3 text-gray-600">{o.expectedTotalKg.toLocaleString()} kg</td>
                      <td className="px-4 py-3 text-gray-600">
                        {o.advanceAmount > 0 ? (
                          <span>
                            ৳{o.advanceAmount.toLocaleString()}
                            {o.advanceFundName ? (
                              <span className="text-gray-400"> ({o.advanceFundName})</span>
                            ) : null}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {pendingBags > 0 ? (
                          <span className="font-semibold text-red-500">{pendingBags} বাকি</span>
                        ) : (
                          <span className="font-semibold text-emerald-600">০ বাকি</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{statusBadge(o.status)}</td>
                      <td className="px-4 py-3 text-right">
                        {o.returnedBags === 0 && (
                          <button
                            onClick={() => setDeleteTarget(o)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
                          </button>
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
            {orders.map((o) => {
              const pendingBags = Math.max(0, o.bagCount - o.returnedBags);
              return (
                <div key={o._id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-[#1f2b22]">{o.company}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{o.date}</p>
                    </div>
                    {statusBadge(o.status)}
                  </div>
                  <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      {o.bagCount} বসতা × {o.weightPerBag}kg = {o.expectedTotalKg.toLocaleString()}kg
                    </span>
                    <span className={pendingBags > 0 ? "text-red-500 font-semibold" : "text-emerald-600 font-semibold"}>
                      Pending: {pendingBags}
                    </span>
                    {o.advanceAmount > 0 && <span>Advance: ৳{o.advanceAmount.toLocaleString()}</span>}
                  </div>
                  {o.returnedBags === 0 && (
                    <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
                      <button onClick={() => setDeleteTarget(o)} className="text-xs font-semibold text-red-500">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[#1f2b22] mb-4">নতুন Factory Order</h2>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Company Name *</label>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="Perfect Agro Feeds"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">বসতা সংখ্যা *</label>
                  <input
                    type="number"
                    value={bagCount}
                    onChange={(e) => setBagCount(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">kg / বসতা *</label>
                  <input
                    type="number"
                    value={weightPerBag}
                    onChange={(e) => setWeightPerBag(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="30"
                  />
                </div>
              </div>

              {expectedTotalKg > 0 && (
                <div className="bg-[#f6f5f1] rounded-lg p-3 text-sm">
                  সম্ভাব্য মোট kg:{" "}
                  <span className="font-bold text-[#1f2b22]">{expectedTotalKg.toLocaleString()} kg</span>
                </div>
              )}

              <div className="border-t border-gray-100 pt-3 mt-1">
                <label className="text-xs font-semibold text-gray-500 block mb-1">
                  Advance Amount (ঐচ্ছিক)
                </label>
                <input
                  type="number"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="এখন কিছু টাকা দিতে চাইলে লিখো"
                />
              </div>

              {advanceNum > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Fund Source *</label>
                  <select
                    value={fundId}
                    onChange={(e) => setFundId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Fund বেছে নাও</option>
                    {funds.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name} (Balance: ৳{f.balance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                  {selectedFund && advanceNum > selectedFund.balance && (
                    <p className="text-xs text-red-500 mt-1">⚠️ যথেষ্ট টাকা নেই</p>
                  )}
                </div>
              )}
            </div>

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
                {saving ? "Saving..." : "Order Save করো"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-600 mb-1">তুমি কি নিশ্চিত?</p>
            <p className="font-semibold text-[#1f2b22] mb-2">"{deleteTarget.company}" Order Delete হয়ে যাবে</p>
            {deleteTarget.advanceAmount > 0 && (
              <p className="text-xs text-gray-400 mb-3">
                Advance দেওয়া ৳{deleteTarget.advanceAmount.toLocaleString()} Fund এ ফেরত যাবে
              </p>
            )}
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

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1f2b22] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
          {toastMsg}
        </div>
      )}
    </div>
  );
};

export default FactoryOrderPage;