import { useEffect, useState, useCallback } from "react";
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
  address: string;
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  createdAt: string;
}

interface Fund {
  _id: string;
  name: string;
  balance: number;
}

interface SaleItem {
  productName: string;
  quantityKg: number;
  ratePerKg: number;
  amount: number;
}

interface Sale {
  _id: string;
  date: string;
  items: SaleItem[];
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
}

const CustomerPage = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentFundId, setPaymentFundId] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payingSaving, setPayingSaving] = useState(false);

  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  const fetchCustomers = useCallback(async (searchTerm = "") => {
    setLoading(true);
    try {
      const res = await axiosInstance.get("/customers", { params: { search: searchTerm } });
      setCustomers(res.data);
    } catch (err) {
      showToast("⚠️ " + getErrorMessage(err, "Data লোড করতে সমস্যা হয়েছে"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFunds = useCallback(async () => {
    try {
      const res = await axiosInstance.get("/funds");
      setFunds(res.data);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    fetchFunds();
  }, [fetchCustomers, fetchFunds]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(search), 350);
    return () => clearTimeout(timer);
  }, [search, fetchCustomers]);

  const openAddModal = () => {
    setName("");
    setPhone("");
    setAddress("");
    setAddModalOpen(true);
  };

  const handleAddCustomer = async () => {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      return showToast("⚠️ Name, Phone, Address — সবগুলো দাও");
    }
    setSaving(true);
    try {
      await axiosInstance.post("/customers", { name, phone, address });
      showToast("✅ Customer Save হয়েছে");
      setAddModalOpen(false);
      fetchCustomers(search);
    } catch (err) {
      showToast("⚠️ " + getErrorMessage(err, "Save করা যায়নি"));
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setSales([]);
    setHistoryLoading(true);
    try {
      const res = await axiosInstance.get(`/customers/${customer._id}/sales`);
      setSales(res.data);
    } catch {
      setSales([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setSelectedCustomer(null);
    setSales([]);
  };

  const openPaymentModal = () => {
    setPaymentAmount("");
    setPaymentFundId(funds[0]?._id || "");
    setPaymentNote("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentModalOpen(true);
  };

  const handleCollectPayment = async () => {
    if (!selectedCustomer) return;
    const amountNum = Number(paymentAmount);
    if (!amountNum || amountNum <= 0) return showToast("⚠️ সঠিক Amount দাও");

    setPayingSaving(true);
    try {
      const res = await axiosInstance.post(`/customers/${selectedCustomer._id}/payment`, {
        amount: amountNum,
        fundId: paymentFundId || undefined,
        note: paymentNote,
        date: paymentDate,
      });
      showToast("✅ বাকি আদায় হয়েছে");
      setPaymentModalOpen(false);
      setSelectedCustomer(res.data);
      fetchCustomers(search);
    } catch (err) {
      showToast("⚠️ " + getErrorMessage(err, "আদায় করা যায়নি"));
    } finally {
      setPayingSaving(false);
    }
  };

  const totalDueAll = customers.reduce((s, c) => s + c.totalDue, 0);
  const totalBilledAll = customers.reduce((s, c) => s + c.totalBilled, 0);
  const totalPaidAll = customers.reduce((s, c) => s + c.totalPaid, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1f2b22]">Customer / দোকান</h1>
          <p className="text-sm text-gray-400 mt-0.5">সব Customer এর Info ও বাকি টাকার হিসাব</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-[#1f2b22] hover:bg-[#28392f] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          + নতুন Customer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-red-500">৳{totalDueAll.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">সব Customer মিলিয়ে মোট বাকি</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-[#1f2b22]">৳{totalBilledAll.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">মোট বিক্রি (এখন পর্যন্ত)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-emerald-700">৳{totalPaidAll.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">মোট আদায় হয়েছে</p>
        </div>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Name অথবা Phone দিয়ে খুঁজো..."
        className="w-full md:w-80 border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
      />

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">লোড হচ্ছে...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
          কোনো Customer নেই — উপরে "+ নতুন Customer" দিয়ে যোগ করো
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <div
              key={c._id}
              onClick={() => openHistory(c)}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-[#1f2b22] hover:ring-2 hover:ring-[#1f2b22]/10 transition-all"
            >
              <p className="font-semibold text-[#1f2b22]">{c.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.phone}</p>
              <p className="text-xs text-gray-400">{c.address}</p>

              <div className="mt-3">
                <p className="text-xs text-gray-400">বর্তমান বাকি</p>
                <p className={`text-2xl font-bold ${c.totalDue > 0 ? "text-red-500" : "text-emerald-600"}`}>
                  ৳{c.totalDue.toLocaleString()}
                </p>
              </div>

              <div className="flex justify-between text-xs text-gray-500 pt-3 mt-3 border-t border-gray-100">
                <span>
                  বিক্রি: <span className="font-semibold text-[#1f2b22]">৳{c.totalBilled.toLocaleString()}</span>
                </span>
                <span>
                  আদায়: <span className="font-semibold text-[#1f2b22]">৳{c.totalPaid.toLocaleString()}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Customer Modal */}
      {addModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setAddModalOpen(false)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[#1f2b22] mb-4">নতুন Customer যোগ করো</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="দোকানের নাম"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Phone *</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="01XXXXXXXXX"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Address *</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="ঠিকানা"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setAddModalOpen(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleAddCustomer}
                disabled={saving}
                className="flex-1 bg-[#1f2b22] hover:bg-[#28392f] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save করো"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History / Detail Modal */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={closeHistory}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[#1f2b22]">{selectedCustomer.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedCustomer.phone} · {selectedCustomer.address}
                </p>
                <p className="text-xs mt-1">
                  বর্তমান বাকি:{" "}
                  <span
                    className={`font-semibold ${
                      selectedCustomer.totalDue > 0 ? "text-red-500" : "text-emerald-600"
                    }`}
                  >
                    ৳{selectedCustomer.totalDue.toLocaleString()}
                  </span>
                </p>
              </div>
              <button onClick={closeHistory} className="text-gray-400 hover:text-gray-600 text-sm">
                ✕
              </button>
            </div>

            {selectedCustomer.totalDue > 0 && (
              <button
                onClick={openPaymentModal}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-lg mb-4"
              >
                বাকি আদায় করো
              </button>
            )}

            <p className="text-xs font-semibold text-gray-500 mb-2">Sale History</p>
            {historyLoading ? (
              <div className="text-center py-10 text-gray-400 text-sm">লোড হচ্ছে...</div>
            ) : sales.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">কোনো Sale নেই</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sales.map((s) => (
                  <div key={s._id} className="border border-gray-200 rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs text-gray-400">{s.date}</span>
                      <span className="font-bold text-[#1f2b22]">৳{s.totalAmount.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {s.items.map((it) => `${it.productName} (${it.quantityKg}kg)`).join(", ")}
                    </p>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-emerald-600">Paid: ৳{s.paidAmount.toLocaleString()}</span>
                      {s.dueAmount > 0 && <span className="text-red-500">Due: ৳{s.dueAmount.toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collect Payment Modal */}
      {paymentModalOpen && selectedCustomer && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
          onClick={() => setPaymentModalOpen(false)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[#1f2b22] mb-1">বাকি আদায় করো</h2>
            <p className="text-xs text-gray-400 mb-4">
              {selectedCustomer.name} — বর্তমান বাকি ৳{selectedCustomer.totalDue.toLocaleString()}
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Amount (৳) *</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Fund</label>
                <select
                  value={paymentFundId}
                  onChange={(e) => setPaymentFundId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  {funds.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} (৳{f.balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Note</label>
                <input
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="ঐচ্ছিক"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleCollectPayment}
                disabled={payingSaving}
                className="flex-1 bg-[#1f2b22] hover:bg-[#28392f] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {payingSaving ? "Saving..." : "আদায় করো"}
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

export default CustomerPage;