import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import axiosInstance from "../../URI/axiosInstance";

interface ApiErrorResponse { message?: string; }
const getErrorMessage = (error: unknown, fallback: string) => axios.isAxiosError<ApiErrorResponse>(error) ? error.response?.data?.message || fallback : fallback;

interface Customer { _id: string; name: string; phone: string; address: string; totalBilled: number; totalPaid: number; totalDue: number; createdAt: string; }
interface Fund { _id: string; name: string; balance: number; }

// FIXED: Interface matches backend perfectly
interface SaleItem { productName: string; kg: number; ratePerBag: number; subtotal: number; }
interface Sale { _id: string; date: string; items: SaleItem[]; totalBill: number; paidAmount: number; due: number; }
interface Payment { _id: string; date: string; amount: number; note: string; }

const safeNumber = (value: number | string | null | undefined): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoney = (value: number | string | null | undefined) => safeNumber(value).toLocaleString();

const normalizeCustomer = (customer: Partial<Customer> | null | undefined): Customer => ({
  _id: customer?._id || "", name: customer?.name || "", phone: customer?.phone || "", address: customer?.address || "",
  totalBilled: safeNumber(customer?.totalBilled), totalPaid: safeNumber(customer?.totalPaid), totalDue: safeNumber(customer?.totalDue), createdAt: customer?.createdAt || "",
});

// FIXED: Normalize function to map fields correctly
const normalizeSale = (sale: any): Sale => ({
  _id: sale?._id || "", date: sale?.date || "",
  items: Array.isArray(sale?.items) ? sale.items.map((item: any) => ({
    productName: item?.productName || "", kg: safeNumber(item?.kg), ratePerBag: safeNumber(item?.ratePerBag), subtotal: safeNumber(item?.subtotal),
  })) : [],
  totalBill: safeNumber(sale?.totalBill || sale?.totalAmount), 
  paidAmount: safeNumber(sale?.paidAmount), 
  due: safeNumber(sale?.due || sale?.dueAmount),
});

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
  const [payments, setPayments] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentFundId, setPaymentFundId] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payingSaving, setPayingSaving] = useState(false);

  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 2500); };

  const fetchCustomers = useCallback(async (searchTerm = "") => {
    setLoading(true);
    try {
      const res = await axiosInstance.get("/customers", { params: { search: searchTerm } });
      setCustomers((Array.isArray(res.data) ? res.data : []).map(normalizeCustomer));
    } catch (err) { showToast("⚠️ " + getErrorMessage(err, "Failed to load customer data")); } finally { setLoading(false); }
  }, []);

  const fetchFunds = useCallback(async () => {
    try { const res = await axiosInstance.get("/funds"); setFunds(res.data); } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchCustomers(); fetchFunds(); }, [fetchCustomers, fetchFunds]);
  useEffect(() => { const timer = setTimeout(() => fetchCustomers(search), 350); return () => clearTimeout(timer); }, [search, fetchCustomers]);

  const openAddModal = () => { setName(""); setPhone(""); setAddress(""); setAddModalOpen(true); };

  const handleAddCustomer = async () => {
    if (!name.trim() || !phone.trim() || !address.trim()) return showToast("⚠️ Name, Phone, and Address are required.");
    setSaving(true);
    try {
      await axiosInstance.post("/customers", { name, phone, address });
      showToast("✅ Customer added successfully");
      setAddModalOpen(false); fetchCustomers(search);
    } catch (err) { showToast("⚠️ " + getErrorMessage(err, "Failed to add customer")); } finally { setSaving(false); }
  };

  const openHistory = async (customer: Customer) => {
    setSelectedCustomer(normalizeCustomer(customer)); setSales([]); setHistoryLoading(true);
    try {
      const res = await axiosInstance.get(`/customers/${customer._id}/sales`);
      const response = Array.isArray(res.data) ? { sales: res.data, payments: [] } : res.data;
      setSales((response.sales || []).map(normalizeSale)); setPayments(response.payments || []);
    } catch { setSales([]); } finally { setHistoryLoading(false); }
  };

  const closeHistory = () => { setSelectedCustomer(null); setSales([]); setPayments([]); };

  const openPaymentModal = () => { setPaymentAmount(""); setPaymentFundId(funds[0]?._id || ""); setPaymentNote(""); setPaymentDate(new Date().toISOString().slice(0, 10)); setPaymentModalOpen(true); };

  const handleCollectPayment = async () => {
    if (!selectedCustomer) return;
    const amountNum = Number(paymentAmount);
    if (!amountNum || amountNum <= 0) return showToast("⚠️ Enter a valid amount");

    setPayingSaving(true);
    try {
      const res = await axiosInstance.post(`/customers/${selectedCustomer._id}/payment`, { amount: amountNum, fundId: paymentFundId || undefined, note: paymentNote, date: paymentDate });
      showToast("✅ Payment collected successfully");
      setPaymentModalOpen(false); setSelectedCustomer(normalizeCustomer(res.data)); fetchCustomers(search);
    } catch (err) { showToast("⚠️ " + getErrorMessage(err, "Failed to process payment")); } finally { setPayingSaving(false); }
  };

  const totalDueAll = customers.reduce((s, c) => s + c.totalDue, 0);
  const totalBilledAll = customers.reduce((s, c) => s + c.totalBilled, 0);
  const totalPaidAll = customers.reduce((s, c) => s + c.totalPaid, 0);

  return (
    <div className="text-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2b22]">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">Manage customer information, sales history, and dues.</p>
        </div>
        <button onClick={openAddModal} className="bg-[#1f2b22] hover:bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-sm transition-colors">+ New Customer</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Outstanding Dues</p>
          <p className="text-2xl font-bold text-red-600">৳{formatMoney(totalDueAll)}</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Lifetime Sales</p>
          <p className="text-2xl font-bold text-[#1f2b22]">৳{formatMoney(totalBilledAll)}</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Amount Collected</p>
          <p className="text-2xl font-bold text-emerald-700">৳{formatMoney(totalPaidAll)}</p>
        </div>
      </div>

      <div className="mb-6">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone..." className="w-full md:w-1/3 border border-gray-300 rounded-sm px-4 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
      </div>

      {loading ? <div className="text-center py-16 text-gray-400 text-sm">Loading...</div> : customers.length === 0 ? <div className="text-center py-16 text-gray-500 text-sm bg-white border border-gray-300 rounded-sm">No customers found.</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <div key={c._id} onClick={() => openHistory(c)} className="bg-white border border-gray-300 rounded-sm p-5 cursor-pointer hover:border-[#1f2b22] hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <p className="text-lg font-bold text-[#1f2b22] mb-1">{c.name}</p>
                <p className="text-xs text-gray-600 font-medium">{c.phone}</p>
                <p className="text-xs text-gray-500 mt-1">{c.address}</p>

                <div className="mt-5 mb-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Current Due</p>
                  <p className={`text-2xl font-bold mt-0.5 ${c.totalDue > 0 ? "text-red-600" : "text-emerald-600"}`}>৳{formatMoney(c.totalDue)}</p>
                </div>
              </div>

              <div className="flex justify-between text-xs text-gray-600 pt-3 border-t border-gray-200">
                <span>Sales: <span className="font-bold text-[#1f2b22]">৳{formatMoney(c.totalBilled)}</span></span>
                <span>Paid: <span className="font-bold text-[#1f2b22]">৳{formatMoney(c.totalPaid)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals... */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4" onClick={() => setAddModalOpen(false)}>
          <div className="bg-white rounded-sm w-full max-w-md p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5 border-b border-gray-200 pb-3">
              <h2 className="text-xl font-bold text-[#1f2b22]">Add New Customer</h2>
              <button onClick={() => setAddModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>
            <div className="flex flex-col gap-4">
              <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Customer Name <span className="text-red-500">*</span></label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" autoFocus /></div>
              <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Phone Number <span className="text-red-500">*</span></label><input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" /></div>
              <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Address <span className="text-red-500">*</span></label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" /></div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setAddModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleAddCustomer} disabled={saving} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2.5 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors">{saving ? "Saving..." : "Save Customer"}</button>
            </div>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-40 flex items-center justify-center p-4" onClick={closeHistory}>
          <div className="bg-white rounded-sm w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6 border-b border-gray-200 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-[#1f2b22]">{selectedCustomer.name}</h2>
                <p className="text-sm text-gray-600 mt-1 font-medium">{selectedCustomer.phone} <span className="mx-2">•</span> {selectedCustomer.address}</p>
                <p className="text-sm mt-2 font-medium">Total Due: <span className={`font-bold ${selectedCustomer.totalDue > 0 ? "text-red-600" : "text-emerald-600"}`}>৳{formatMoney(selectedCustomer.totalDue)}</span></p>
              </div>
              <button onClick={closeHistory} className="text-gray-400 hover:text-black text-3xl font-bold leading-none">&times;</button>
            </div>

            {selectedCustomer.totalDue > 0 && (
              <button onClick={openPaymentModal} className="w-full bg-[#1f2b22] hover:bg-black text-white text-sm font-bold py-3 rounded-sm mb-6 transition-colors uppercase tracking-wider">Collect Payment</button>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Sales History</p>
                {historyLoading ? (
                  <div className="py-10 text-gray-400 text-sm">Loading...</div>
                ) : sales.length === 0 ? (
                  <p className="py-6 text-gray-400 text-sm border border-dashed border-gray-300 rounded-sm text-center">No sales history found.</p>
                ) : (
                  <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-2">
                    {sales.map((s) => (
                      <div key={s._id} className="border border-gray-200 rounded-sm p-4 bg-gray-50">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">{s.date}</span>
                          <span className="font-bold text-[#1f2b22]">৳{formatMoney(s.totalBill)}</span>
                        </div>
                        <div className="text-xs text-gray-600 font-medium mb-3">
                          {s.items.map((it) => `${it.productName} (${it.kg}kg)`).join(" • ")}
                        </div>
                        <div className="flex justify-between text-xs pt-2 border-t border-gray-200">
                          <span className="text-emerald-600 font-bold">Paid: ৳{formatMoney(s.paidAmount)}</span>
                          {s.due > 0 && <span className="text-red-600 font-bold">Due: ৳{formatMoney(s.due)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Payment History</p>
                {payments.length === 0 ? (
                  <p className="py-6 text-gray-400 text-sm border border-dashed border-gray-300 rounded-sm text-center">No payments received yet.</p>
                ) : (
                  <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-2">
                    {payments.map((payment) => (
                      <div key={payment._id} className="border border-emerald-200 bg-emerald-50 rounded-sm p-4 flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-emerald-800 uppercase">{payment.date}</span>
                          <b className="text-emerald-700 text-sm">+৳{formatMoney(payment.amount)}</b>
                        </div>
                        <span className="text-xs text-emerald-900 font-medium">{payment.note}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-[60] flex items-center justify-center p-4" onClick={() => setPaymentModalOpen(false)}>
          <div className="bg-white rounded-sm w-full max-w-sm p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-lg font-bold text-[#1f2b22]">Collect Payment</h2>
              <button onClick={() => setPaymentModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>
            <p className="text-sm text-gray-600 mb-5">Collecting for <span className="font-bold text-[#1f2b22]">{selectedCustomer.name}</span>.<br /><span className="text-red-600 font-bold">Total Due: ৳{formatMoney(selectedCustomer.totalDue)}</span></p>
            <div className="flex flex-col gap-4">
              <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Amount (৳) <span className="text-red-500">*</span></label><input type="number" min="0" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" autoFocus /></div>
              <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Deposit To <span className="text-red-500">*</span></label><select value={paymentFundId} onChange={(e) => setPaymentFundId(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">{funds.map((f) => (<option key={f._id} value={f._id}>{f.name} (Bal: ৳{formatMoney(f.balance)})</option>))}</select></div>
              <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date <span className="text-red-500">*</span></label><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" /></div>
              <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Note <span className="text-gray-400 font-normal lowercase">- Optional</span></label><input type="text" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" placeholder="e.g. Cash collected by rider" /></div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setPaymentModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleCollectPayment} disabled={payingSaving} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2.5 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors">{payingSaving ? "Processing..." : "Confirm Payment"}</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-[#1f2b22] text-white text-sm px-5 py-3 rounded-sm shadow-md z-50">{toastMsg}</div>}
    </div>
  );
};

export default CustomerPage;