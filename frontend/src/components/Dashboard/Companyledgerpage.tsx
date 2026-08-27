import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface Fund {
  _id: string;
  name: string;
  balance: number;
}

interface Company {
  _id: string;
  name: string;
  advanceBalance: number;
  totalAdvanceGiven: number;
  totalBillPaid: number;
  totalDue: number; // dynamically added from backend
  createdAt: string;
}

interface FactoryOrder {
  _id: string;
  company: string;
  date: string;
  bagCount: number;
  weightPerBag: number;
  expectedTotalKg: number;
  returnedBags: number;
  status: string;
  advanceAmount: number;
  advanceFundName: string | null;
}

interface FactoryReturn {
  _id: string;
  company: string;
  date: string;
  totalBillAmount: number;
  advanceUsed: number;
  remainingPaid: number;
  totalKg: number;
  totalBagsUsed: number;
  fundName: string | null;
}

interface DirectPayment {
  _id: string;
  date: string;
  amount: number;
  fundName: string;
  note: string;
}

interface CompanyHistory {
  orders: FactoryOrder[];
  returns: FactoryReturn[];
  directPayments: DirectPayment[];
  productBreakdown?: {
    productName: string;
    totalKg: number;
    totalBags: number;
    totalBill: number;
    paid: number;
    payable: number;
  }[];
}

type TimelineEvent = {
  type: "order" | "return" | "payment";
  date: string;
  amount: number;
  note: string;
  fundName?: string | null;
  [key: string]: any;
};

const CompanyLedgerPage = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [history, setHistory] = useState<CompanyHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Payment Modal States
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payFundId, setPayFundId] = useState("");
  const [payNote, setPayNote] = useState("");
  const [savingPay, setSavingPay] = useState(false);
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
    setTimeout(() => setToastMsg(""), 2500);
  };

  // -----------------------------------------
  // Fetch Data
  // -----------------------------------------

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [compRes, fundRes] = await Promise.all([
        axiosInstance.get("/companies"),
        axiosInstance.get("/funds"),
      ]);
      setCompanies(compRes.data);
      setFunds(fundRes.data);
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const openHistory = async (company: Company) => {
    setSelectedCompany(company);
    setHistory(null);
    setHistoryLoading(true);
    try {
      const res = await axiosInstance.get(`/companies/${company._id}/history`);
      setHistory(res.data);
    } catch (err) {
      setHistory({ orders: [], returns: [], directPayments: [] });
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setSelectedCompany(null);
    setHistory(null);
  };

  // -----------------------------------------
  // Make Payment
  // -----------------------------------------

  const handleMakePayment = async () => {
    if (!selectedCompany) return;
    const amountNum = Number(payAmount);
    
    if (!amountNum || amountNum <= 0) return showToast("⚠️ Enter a valid amount");
    if (!payFundId) return showToast("⚠️ Select a payment source");

    setSavingPay(true);
    try {
      await axiosInstance.post(`/companies/${selectedCompany._id}/pay`, {
        amount: amountNum,
        fundId: payFundId,
        note: payNote,
      });

      showToast("✅ Payment recorded successfully");
      setPayModalOpen(false);
      setPayAmount("");
      setPayFundId("");
      setPayNote("");
      
      await fetchInitialData();
      
      // Update selected company object with new totalDue so the modal updates instantly
      const updatedCompany = { 
        ...selectedCompany, 
        totalDue: Math.max(0, selectedCompany.totalDue - amountNum) 
      };
      setSelectedCompany(updatedCompany);
      
      await openHistory(updatedCompany);
    } catch (err: any) {
      showToast("⚠️ " + (err.response?.data?.message || "Payment failed"));
    } finally {
      setSavingPay(false);
    }
  };

  // -----------------------------------------
  // Build Timeline
  // -----------------------------------------

  const buildTimeline = (): TimelineEvent[] => {
    if (!history) return [];

    const orderEvents: TimelineEvent[] = history.orders.map((o) => ({
      type: "order",
      date: o.date,
      amount: safeNumber(o.advanceAmount),
      bagCount: safeNumber(o.bagCount),
      weightPerBag: safeNumber(o.weightPerBag),
      expectedTotalKg: safeNumber(o.expectedTotalKg),
      note: safeNumber(o.advanceAmount) > 0 ? "Order Placed + Advance Given" : "Order Placed (No Advance)",
      fundName: o.advanceFundName,
    }));

    const returnEvents: TimelineEvent[] = history.returns.map((r) => ({
      type: "return",
      date: r.date,
      amount: safeNumber(r.totalBillAmount),
      advanceUsed: safeNumber(r.advanceUsed),
      remainingPaid: safeNumber(r.remainingPaid),
      note: `Received — ${r.totalBagsUsed} bags, ${safeNumber(r.totalKg).toLocaleString()} kg`,
      fundName: r.fundName,
    }));

    const paymentEvents: TimelineEvent[] = (history.directPayments || []).map((p) => ({
      type: "payment",
      date: p.date,
      amount: safeNumber(p.amount),
      note: p.note || "Direct Payment Made",
      fundName: p.fundName,
    }));

    return [...orderEvents, ...returnEvents, ...paymentEvents].sort((a, b) =>
      a.date < b.date ? 1 : -1
    );
  };

  const totalAdvanceOutstanding = companies.reduce((s, c) => s + safeNumber(c.advanceBalance), 0);
  const totalDuesOutstanding = companies.reduce((s, c) => s + safeNumber(c.totalDue), 0);
  const totalGivenAllTime = companies.reduce((s, c) => s + safeNumber(c.totalAdvanceGiven), 0);

  return (
    <div className="text-gray-800">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1f2b22]">Company Ledger</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track factory advances, outstanding dues, and overall bill payments.
        </p>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-sm p-3 mb-4">
          {loadError}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Advance Balance</p>
          <p className="text-2xl font-bold text-amber-600">৳{formatMoney(totalAdvanceOutstanding)}</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Payable Due</p>
          <p className="text-2xl font-bold text-red-600">৳{formatMoney(totalDuesOutstanding)}</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Sent</p>
          <p className="text-2xl font-bold text-[#1f2b22]">৳{formatMoney(totalGivenAllTime)}</p>
        </div>
      </div>

      {/* Grid of Companies */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm bg-white border border-gray-300 rounded-sm">
          No companies found. Create a Factory Order to see them here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => {
            const currentAdvance = safeNumber(c.advanceBalance);
            const currentDue = safeNumber(c.totalDue);

            return (
              <div 
                key={c._id} 
                onClick={() => openHistory(c)}
                className="bg-white border border-gray-300 rounded-sm p-5 cursor-pointer hover:border-[#1f2b22] hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <h3 className="text-lg font-bold text-[#1f2b22] mb-4">{c.name}</h3>
                  
                  <div className="flex flex-col gap-3 mb-5">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Advance Bal</span>
                      <span className={`font-bold ${currentAdvance > 0 ? "text-amber-600" : "text-gray-400"}`}>
                        ৳{formatMoney(currentAdvance)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total Due</span>
                      <span className={`font-bold ${currentDue > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        ৳{formatMoney(currentDue)}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between text-xs text-gray-600 pt-1">
                    <span>Sent: <span className="font-bold text-[#1f2b22]">৳{formatMoney(c.totalAdvanceGiven)}</span></span>
                    <span>Used: <span className="font-bold text-[#1f2b22]">৳{formatMoney(c.totalBillPaid)}</span></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History Modal */}
      {selectedCompany && !payModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={closeHistory}>
          <div className="bg-white rounded-sm w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 border-b border-gray-200 pb-4 gap-4">
              <div>
                <h2 className="text-xl font-bold text-[#1f2b22]">{selectedCompany.name}</h2>
                <div className="flex gap-4 mt-2 text-sm">
                  <p className="text-gray-600">
                    Advance: <span className="font-bold text-amber-600">৳{formatMoney(selectedCompany.advanceBalance)}</span>
                  </p>
                  <p className="text-gray-600">
                    Due: <span className={`font-bold ${selectedCompany.totalDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>৳{formatMoney(selectedCompany.totalDue)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {selectedCompany.totalDue > 0 && (
                  <button 
                    onClick={() => { setPayAmount(selectedCompany.totalDue.toString()); setPayModalOpen(true); }}
                    className="bg-[#1f2b22] hover:bg-black text-white text-xs font-bold px-4 py-2.5 rounded-sm transition-colors"
                  >
                    Pay Dues
                  </button>
                )}
                <button onClick={closeHistory} className="text-gray-400 hover:text-black text-2xl font-bold leading-none">&times;</button>
              </div>
            </div>

            {historyLoading ? (
              <div className="text-center py-10 text-gray-400 text-sm">Loading history...</div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Product Breakdown Box */}
                {history?.productBreakdown && history.productBreakdown.length > 0 && (
                  <div className="border border-gray-300 bg-gray-50 rounded-sm p-4">
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Product Summary</p>
                    <div className="flex flex-col gap-2">
                      {history.productBreakdown.map((item) => (
                        <div key={item.productName} className="flex flex-wrap justify-between gap-4 text-sm border-b border-gray-200 last:border-0 pb-2 last:pb-0">
                          <span className="font-medium text-gray-800">
                            {item.productName} <span className="text-gray-400 mx-1">•</span> {item.totalBags} bags <span className="text-gray-400 mx-1">•</span> {item.totalKg} kg
                          </span>
                          <span className="text-gray-700">
                            Bill: ৳{formatMoney(item.totalBill)} <span className="mx-1 text-gray-300">|</span> Paid: ৳{formatMoney(item.paid)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Transaction Timeline</p>
                  <div className="flex flex-col gap-3">
                    {buildTimeline().length === 0 ? (
                      <p className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-300 rounded-sm">No history found.</p>
                    ) : (
                      buildTimeline().map((event, i) => (
                        <div key={i} className={`border rounded-sm p-4 text-sm ${event.type === "order" ? "bg-amber-50 border-amber-200" : event.type === "payment" ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                          <div className="flex justify-between items-start mb-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm ${event.type === "order" ? "bg-amber-100 text-amber-800" : event.type === "payment" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}`}>
                              {event.type === "order" ? "Order Placed" : event.type === "payment" ? "Payment Sent" : "Return / Bill"}
                            </span>
                            <span className="text-xs text-gray-500 font-medium">{event.date}</span>
                          </div>
                          
                          <p className="text-gray-700 text-sm mb-2 font-medium">{event.note}</p>

                          {event.type === "order" && (
                            <div className="flex flex-col gap-1 mt-3 border-t border-amber-100 pt-2">
                              <p className="text-[#1f2b22]">{event.bagCount} bags &times; {event.weightPerBag}kg = <span className="font-bold">{formatMoney(event.expectedTotalKg)} kg</span></p>
                              {event.amount > 0 && <p className="text-sm font-bold text-amber-700">Advance: ৳{formatMoney(event.amount)} {event.fundName && <span className="text-gray-500 text-xs font-medium ml-1">(from {event.fundName})</span>}</p>}
                            </div>
                          )}

                          {event.type === "return" && (
                            <div className="flex flex-col gap-1 mt-3 border-t border-gray-200 pt-2">
                              <p className="font-bold text-[#1f2b22]">Total Bill: ৳{formatMoney(event.amount)}</p>
                              {event.advanceUsed > 0 && <p className="text-xs text-emerald-600 font-medium">Deducted from Advance: ৳{formatMoney(event.advanceUsed)}</p>}
                              {event.remainingPaid > 0 && <p className="text-xs text-gray-600 font-medium">New Payment Made: ৳{formatMoney(event.remainingPaid)} {event.fundName && ` (from ${event.fundName})`}</p>}
                            </div>
                          )}

                          {event.type === "payment" && (
                            <div className="flex flex-col gap-1 mt-3 border-t border-blue-100 pt-2">
                              <p className="font-bold text-blue-800">Amount Sent: ৳{formatMoney(event.amount)}</p>
                              {event.fundName && <p className="text-xs text-gray-600 font-medium">Source: {event.fundName}</p>}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment / Dues Modal */}
      {payModalOpen && selectedCompany && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-sm p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
              <h2 className="text-lg font-bold text-[#1f2b22]">Pay Dues</h2>
              <button onClick={() => setPayModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>

            <p className="text-sm text-gray-600 mb-5">
              Clear outstanding dues for <span className="font-bold text-[#1f2b22]">{selectedCompany.name}</span>. Total Due is ৳{formatMoney(selectedCompany.totalDue)}.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Amount (৳) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="0"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Source <span className="text-red-500">*</span></label>
                <select
                  value={payFundId}
                  onChange={(e) => setPayFundId(e.target.value)}
                  className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]"
                >
                  <option value="">Select Fund</option>
                  {funds.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} (Bal: ৳{formatMoney(f.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Note <span className="text-gray-400 font-normal lowercase">- Optional</span></label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="e.g. Cleared past due"
                  className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setPayModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleMakePayment} disabled={savingPay} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors">
                {savingPay ? "Processing..." : "Confirm Payment"}
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

export default CompanyLedgerPage;