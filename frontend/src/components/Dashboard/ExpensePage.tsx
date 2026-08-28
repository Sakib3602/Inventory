import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface Fund {
  _id: string;
  name: string;
  balance: number;
}

interface Expense {
  _id: string;
  title: string;
  amount: number;
  date: string;
  note: string;
  fundName: string;
}

const ExpensePage = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [fundId, setFundId] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const formatMoney = (val: unknown) => Number.isFinite(Number(val)) ? Number(val).toLocaleString() : "0";
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 2800); };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [expenseRes, fundRes] = await Promise.all([
        axiosInstance.get("/expenses"),
        axiosInstance.get("/funds")
      ]);
      setExpenses(expenseRes.data || []);
      setFunds(fundRes.data || []);
    } catch (err) {
      showToast("⚠️ Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSave = async () => {
    if (!title.trim()) return showToast("⚠️ Expense title is required");
    if (!amount || Number(amount) <= 0) return showToast("⚠️ Enter a valid amount");
    if (!fundId) return showToast("⚠️ Select a payment source (Fund)");

    setSaving(true);
    try {
      await axiosInstance.post("/expenses", { title, amount, date, note, fundId });
      showToast("✅ Expense recorded successfully");
      setModalOpen(false);
      setTitle(""); setAmount(""); setNote(""); setFundId("");
      fetchAll();
    } catch (err: any) {
      showToast("⚠️ " + (err.response?.data?.message || "Failed to record expense"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axiosInstance.delete(`/expenses/${deleteTarget._id}`);
      showToast("✅ Expense deleted & money refunded to fund");
      setDeleteTarget(null);
      fetchAll();
    } catch (err: any) {
      showToast("⚠️ " + (err.response?.data?.message || "Failed to delete expense"));
    }
  };

  const totalExpensesAllTime = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  
  const currentMonth = new Date().toISOString().slice(0, 7); // e.g., "2026-08"
  const thisMonthExpenses = expenses
    .filter((e) => e.date.startsWith(currentMonth))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const filteredExpenses = expenses.filter((e) => 
    e.title.toLowerCase().includes(search.toLowerCase()) || 
    e.note.toLowerCase().includes(search.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const paginatedExpenses = filteredExpenses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="text-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2b22]">Daily Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">Record labor costs, electricity bills, and other company expenses.</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="bg-[#1f2b22] hover:bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-sm transition-colors">
          + Record Expense
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Expenses This Month</p>
          <p className="text-2xl font-bold text-red-600">৳{formatMoney(thisMonthExpenses)}</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-sm p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Lifetime Expenses</p>
          <p className="text-2xl font-bold text-[#1f2b22]">৳{formatMoney(totalExpensesAllTime)}</p>
        </div>
      </div>

      <div className="mb-4">
        <input type="text" placeholder="Search by title or note..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="w-full md:w-1/3 border border-gray-300 rounded-sm px-4 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm bg-white border border-gray-300 rounded-sm">No expenses recorded yet.</div>
      ) : (
        <div className="bg-white border border-gray-300 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 border-b border-gray-300 text-gray-700 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Expense Title</th>
                  <th className="px-4 py-3 font-semibold">Details / Note</th>
                  <th className="px-4 py-3 font-semibold">Payment Source</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedExpenses.map((e) => (
                  <tr key={e._id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 font-medium">{e.date}</td>
                    <td className="px-4 py-3 font-bold text-[#1f2b22]">{e.title}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{e.note || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{e.fundName}</td>
                    <td className="px-4 py-3 font-bold text-red-600">৳{formatMoney(e.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDeleteTarget(e)} className="text-xs text-red-500 hover:text-red-800 hover:underline font-bold">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-t border-gray-300">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-sm hover:bg-gray-100 transition-colors disabled:opacity-50">Previous</button>
              <span className="text-xs text-gray-600 font-medium">Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-sm hover:bg-gray-100 transition-colors disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}

      {/* Record Expense Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-sm w-full max-w-md p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5 border-b border-gray-200 pb-3">
              <h2 className="text-xl font-bold text-[#1f2b22]">Record Expense</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-black text-xl font-bold">&times;</button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Expense Title <span className="text-red-500">*</span></label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Labor Cost, Electricity Bill" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" autoFocus />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Amount (৳) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date <span className="text-red-500">*</span></label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Source (Fund) <span className="text-red-500">*</span></label>
                <select value={fundId} onChange={(e) => setFundId(e.target.value)} className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1f2b22]">
                  <option value="">Select Fund</option>
                  {funds.map((f) => <option key={f._id} value={f._id}>{f.name} (Bal: ৳{formatMoney(f.balance)})</option>)}
                </select>
                {amount && fundId && (
                  <p className="text-[10px] font-bold text-red-500 mt-1">৳{formatMoney(amount)} will be deducted from this fund.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Note / Details <span className="text-gray-400 font-normal lowercase">- Optional</span></label>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any extra details..." className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1f2b22] resize-none"></textarea>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-800 py-2.5 text-sm font-semibold rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#1f2b22] hover:bg-black text-white py-2.5 text-sm font-semibold rounded-sm disabled:opacity-50 transition-colors">{saving ? "Processing..." : "Save Expense"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-[#1f2b22]/60 z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-sm w-full max-w-sm p-6 text-center shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#1f2b22] mb-2">Delete Expense?</h3>
            <p className="text-sm text-gray-600 mb-6">"<span className="font-bold">{deleteTarget.title}</span>" will be removed. The deducted ৳{formatMoney(deleteTarget.amount)} will be refunded back to {deleteTarget.fundName}.</p>
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

export default ExpensePage;