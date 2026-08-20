import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface Company {
  _id: string;
  name: string;
  advanceBalance: number;
  totalAdvanceGiven: number;
  totalBillPaid: number;
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

interface CompanyHistory {
  orders: FactoryOrder[];
  returns: FactoryReturn[];
}

type OrderEvent = {
  type: "order";
  date: string;
  amount: number; // advance না থাকলে 0
  bagCount: number;
  weightPerBag: number;
  expectedTotalKg: number;
  note: string;
  fundName: string | null;
};

type ReturnEvent = {
  type: "return";
  date: string;
  amount: number;
  advanceUsed: number;
  remainingPaid: number;
  note: string;
  fundName: string | null;
};

type TimelineEvent = OrderEvent | ReturnEvent;

const CompanyLedgerPage = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [history, setHistory] = useState<CompanyHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await axiosInstance.get("/companies");
      setCompanies(res.data);
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || "Data লোড করতে সমস্যা হয়েছে");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const openHistory = async (company: Company) => {
    setSelectedCompany(company);
    setHistory(null);
    setHistoryLoading(true);
    try {
      const res = await axiosInstance.get(`/companies/${company._id}/history`);
      setHistory(res.data);
    } catch (err) {
      setHistory({ orders: [], returns: [] });
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setSelectedCompany(null);
    setHistory(null);
  };

  // Order (advance থাকুক বা না থাকুক) + Return মিলিয়ে date অনুযায়ী sort করা timeline
  const buildTimeline = (): TimelineEvent[] => {
    if (!history) return [];

    const orderEvents: OrderEvent[] = history.orders.map((o) => ({
      type: "order",
      date: o.date,
      amount: o.advanceAmount, // advance না থাকলে 0
      bagCount: o.bagCount,
      weightPerBag: o.weightPerBag,
      expectedTotalKg: o.expectedTotalKg,
      note:
        o.advanceAmount > 0
          ? `Order দেওয়া হলো + Advance (${o.bagCount} বসতা, ${o.weightPerBag}kg/বসতা)`
          : `Order দেওয়া হলো (${o.bagCount} বসতা, ${o.weightPerBag}kg/বসতা) — Advance ছাড়া`,
      fundName: o.advanceFundName,
    }));

    const returnEvents: ReturnEvent[] = history.returns.map((r) => ({
      type: "return",
      date: r.date,
      amount: r.totalBillAmount,
      advanceUsed: r.advanceUsed,
      remainingPaid: r.remainingPaid,
      note: `Return — ${r.totalBagsUsed} বসতা, ${r.totalKg.toLocaleString()} kg`,
      fundName: r.fundName,
    }));

    return [...orderEvents, ...returnEvents].sort((a, b) => (a.date < b.date ? 1 : -1));
  };

  const totalAdvanceOutstanding = companies.reduce((s, c) => s + c.advanceBalance, 0);
  const totalGivenAllTime = companies.reduce((s, c) => s + c.totalAdvanceGiven, 0);
  const totalPaidAllTime = companies.reduce((s, c) => s + c.totalBillPaid, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1f2b22]">Company Ledger (Factory Advance)</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            প্রতিটা Factory-কে দেওয়া Advance ও Bill Payment এর হিসাব
          </p>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3 mb-4">
          {loadError}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-amber-600">৳{totalAdvanceOutstanding.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">সব Company মিলিয়ে এখন Advance জমা আছে</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-[#1f2b22]">৳{totalGivenAllTime.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">এখন পর্যন্ত মোট Advance দেওয়া হয়েছে</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-emerald-700">৳{totalPaidAllTime.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">এখন পর্যন্ত মোট Bill পরিশোধ হয়েছে</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">লোড হচ্ছে...</div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
          এখনো কোনো Company নেই — Factory Order দিলে এখানে auto দেখাবে
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => (
            <div
              key={c._id}
              onClick={() => openHistory(c)}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-[#1f2b22] hover:ring-2 hover:ring-[#1f2b22]/10 transition-all"
            >
              <p className="font-semibold text-[#1f2b22] mb-3">{c.name}</p>

              <div className="mb-3">
                <p className="text-xs text-gray-400">এখন Advance জমা আছে</p>
                <p
                  className={`text-2xl font-bold ${
                    c.advanceBalance > 0 ? "text-amber-600" : "text-gray-300"
                  }`}
                >
                  ৳{c.advanceBalance.toLocaleString()}
                </p>
              </div>

              <div className="flex justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
                <span>
                  মোট দেওয়া:{" "}
                  <span className="font-semibold text-[#1f2b22]">৳{c.totalAdvanceGiven.toLocaleString()}</span>
                </span>
                <span>
                  Bill এ ব্যবহার:{" "}
                  <span className="font-semibold text-[#1f2b22]">৳{c.totalBillPaid.toLocaleString()}</span>
                </span>
              </div>

              <p className="text-xs text-[#1f2b22] font-semibold mt-3 underline">History দেখো →</p>
            </div>
          ))}
        </div>
      )}

      {/* History Modal */}
      {selectedCompany && (
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
                <h2 className="text-lg font-semibold text-[#1f2b22]">{selectedCompany.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  বর্তমান Advance:{" "}
                  <span className="font-semibold text-amber-600">
                    ৳{selectedCompany.advanceBalance.toLocaleString()}
                  </span>
                </p>
              </div>
              <button onClick={closeHistory} className="text-gray-400 hover:text-gray-600 text-sm">
                ✕
              </button>
            </div>

            {historyLoading ? (
              <div className="text-center py-10 text-gray-400 text-sm">লোড হচ্ছে...</div>
            ) : (
              <div className="flex flex-col gap-3">
                {buildTimeline().length === 0 ? (
                  <p className="text-center py-10 text-gray-400 text-sm">কোনো History নেই</p>
                ) : (
                  buildTimeline().map((event, i) => (
                    <div
                      key={i}
                      className={`border rounded-lg p-3 text-sm ${
                        event.type === "order"
                          ? "bg-amber-50 border-amber-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            event.type === "order"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {event.type === "order" ? "Order দেওয়া হলো" : "Return / Bill"}
                        </span>
                        <span className="text-xs text-gray-400">{event.date}</span>
                      </div>
                      <p className="text-gray-600 text-xs mb-1">{event.note}</p>

                      {event.type === "order" ? (
                        <div className="flex flex-col gap-0.5">
                          <p className="font-bold text-[#1f2b22]">
                            {event.bagCount} বসতা × {event.weightPerBag}kg ={" "}
                            {event.expectedTotalKg.toLocaleString()}kg
                          </p>
                          {event.amount > 0 && (
                            <p className="text-sm font-semibold text-amber-700">
                              Advance: ৳{event.amount.toLocaleString()}
                              {event.fundName ? (
                                <span className="text-gray-400 text-xs font-normal">
                                  {" "}
                                  ({event.fundName})
                                </span>
                              ) : null}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <p className="font-bold text-[#1f2b22]">মোট বিল: ৳{event.amount.toLocaleString()}</p>
                          {event.advanceUsed > 0 && (
                            <p className="text-xs text-emerald-600">
                              Advance থেকে কাটা: ৳{event.advanceUsed.toLocaleString()}
                            </p>
                          )}
                          {event.remainingPaid > 0 && (
                            <p className="text-xs text-gray-500">
                              নতুন দেওয়া হয়েছে: ৳{event.remainingPaid.toLocaleString()}
                              {event.fundName ? ` (${event.fundName})` : ""}
                            </p>
                          )}
                        </div>
                      )}        
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyLedgerPage;