import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";


interface Fund {
  _id: string;
  name: string;
  type: "default" | "profit" | "custom";
  deletable: boolean;
  balance: number;
  totalIn: number;
  totalOut: number;
  createdAt: string;
}

interface Transaction {
  _id: string;
  fundId: string;
  fundName: string;
  type: string;
  direction: "in" | "out";
  amount: number;
  note: string;
  date: string;
  createdAt: string;
}

const FundPage = () => {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedFund, setSelectedFund] = useState<Fund | null>(null);

  // Deposit modal
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositFund, setDepositFund] = useState<Fund | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // New Fund modal
  const [newFundModalOpen, setNewFundModalOpen] = useState(false);
  const [newFundName, setNewFundName] = useState("");
  const [savingFund, setSavingFund] = useState(false);

  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  const fetchFunds = useCallback(async () => {
    try {
      const res = await axiosInstance.get("/funds");
      setFunds(res.data);
    } catch (err) {
      showToast("⚠️ Fund লোড করতে সমস্যা হয়েছে");
    }
  }, []);

  const fetchTransactions = useCallback(async (fundId?: string) => {
    try {
      const res = await axiosInstance.get("/fund-transactions", {
        params: fundId ? { fundId } : {},
      });
      setTransactions(res.data);
    } catch (err) {
      showToast("⚠️ Transaction history লোড করতে সমস্যা হয়েছে");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchFunds(), fetchTransactions()]);
      setLoading(false);
    })();
  }, [fetchFunds, fetchTransactions]);

  const handleSelectFund = (fund: Fund | null) => {
    setSelectedFund(fund);
    fetchTransactions(fund?._id);
  };

  const openDepositModal = (fund: Fund) => {
    setDepositFund(fund);
    setDepositAmount("");
    setDepositNote("");
    setDepositDate(new Date().toISOString().slice(0, 10));
    setDepositModalOpen(true);
  };

  const handleDeposit = async () => {
    if (!depositFund) return;
    const amountNum = Number(depositAmount);
    if (!amountNum || amountNum <= 0) {
      return showToast("⚠️ সঠিক Amount দাও");
    }
    setSaving(true);
    try {
      await axiosInstance.post(`/funds/${depositFund._id}/deposit`, {
        amount: amountNum,
        note: depositNote,
        date: depositDate,
      });
      showToast(`✅ ${depositFund.name} এ ৳${amountNum.toLocaleString()} যোগ হয়েছে`);
      setDepositModalOpen(false);
      fetchFunds();
      fetchTransactions(selectedFund?._id);
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "Deposit করা যায়নি"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddFund = async () => {
    if (!newFundName.trim()) return showToast("⚠️ Fund নাম দাও");
    setSavingFund(true);
    try {
      await axiosInstance.post("/funds", { name: newFundName.trim() });
      showToast("✅ নতুন Fund তৈরি হয়েছে");
      setNewFundModalOpen(false);
      setNewFundName("");
      fetchFunds();
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "Fund তৈরি করা যায়নি"));
    } finally {
      setSavingFund(false);
    }
  };

  const totalBalance = funds.reduce((sum, f) => sum + f.balance, 0);

  const fundBadgeColor = (type: string) => {
    if (type === "profit") return "bg-amber-50 text-amber-700 border-amber-200";
    if (type === "default") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-blue-50 text-blue-700 border-blue-200";
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1f2b22]">Fund Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Cash, Bank, Partner Investment — সব Fund এর হিসাব এক জায়গায়
          </p>
        </div>
        <button
          onClick={() => setNewFundModalOpen(true)}
          className="bg-[#1f2b22] hover:bg-[#28392f] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          + নতুন Fund
        </button>
      </div>

      {/* Total balance */}
      <div className="bg-[#1f2b22] rounded-xl p-5 mb-6 text-white">
        <p className="text-xs text-gray-300">সব Fund মিলিয়ে মোট Balance</p>
        <p className="text-3xl font-bold mt-1">৳{totalBalance.toLocaleString()}</p>
      </div>

      {/* Fund cards */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">লোড হচ্ছে...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {funds.map((f) => (
            <div
              key={f._id}
              onClick={() => handleSelectFund(f)}
              className={`bg-white border rounded-xl p-4 cursor-pointer transition-all ${
                selectedFund?._id === f._id
                  ? "border-[#1f2b22] ring-2 ring-[#1f2b22]/10"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${fundBadgeColor(
                    f.type
                  )}`}
                >
                  {f.type === "profit" ? "Profit (Auto)" : f.type === "default" ? "Default" : "Custom"}
                </span>
                {f.type !== "profit" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDepositModal(f);
                    }}
                    className="text-xs font-semibold text-[#1f2b22] hover:underline"
                  >
                    + Deposit
                  </button>
                )}
              </div>

              <p className="font-semibold text-[#1f2b22] mb-1">{f.name}</p>
              <p className="text-2xl font-bold text-[#1f2b22] mb-3">৳{f.balance.toLocaleString()}</p>

              <div className="flex justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
                <span>
                  In: <span className="text-emerald-600 font-semibold">৳{f.totalIn.toLocaleString()}</span>
                </span>
                <span>
                  Out: <span className="text-red-500 font-semibold">৳{f.totalOut.toLocaleString()}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transaction history */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold text-[#1f2b22]">
            Transaction History
            {selectedFund && <span className="text-gray-400 font-normal"> — {selectedFund.name}</span>}
          </h2>
          {selectedFund && (
            <button
              onClick={() => handleSelectFund(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              সব দেখাও ✕
            </button>
          )}
        </div>

        {transactions.length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">কোনো Transaction নেই</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b border-gray-100">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Fund</th>
                  <th className="py-2 pr-3">Note</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t._id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-3 text-gray-500 text-xs">{t.date}</td>
                    <td className="py-2 pr-3 text-gray-700">{t.fundName}</td>
                    <td className="py-2 pr-3 text-gray-600">{t.note}</td>
                    <td
                      className={`py-2 text-right font-semibold ${
                        t.direction === "in" ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {t.direction === "in" ? "+" : "-"}৳{t.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      {depositModalOpen && depositFund && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setDepositModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[#1f2b22] mb-1">
              {depositFund.name} এ টাকা যোগ করো
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              বর্তমান Balance: ৳{depositFund.balance.toLocaleString()}
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Amount (৳) *</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="10000"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Date</label>
                <input
                  type="date"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Note</label>
                <input
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="যেমন: ব্যাংক থেকে তোলা হলো"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDepositModalOpen(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleDeposit}
                disabled={saving}
                className="flex-1 bg-[#1f2b22] hover:bg-[#28392f] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add করো"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Fund Modal */}
      {newFundModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setNewFundModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[#1f2b22] mb-4">নতুন Fund তৈরি করো</h2>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Fund নাম *</label>
            <input
              value={newFundName}
              onChange={(e) => setNewFundName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="যেমন: Partner: Sakib"
              autoFocus
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setNewFundModalOpen(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleAddFund}
                disabled={savingFund}
                className="flex-1 bg-[#1f2b22] hover:bg-[#28392f] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {savingFund ? "Saving..." : "তৈরি করো"}
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

export default FundPage;