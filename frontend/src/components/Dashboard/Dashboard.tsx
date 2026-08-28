import { useEffect, useMemo, useState, useCallback } from "react";
// ⚠️ Adjust this path if your axiosInstance file lives elsewhere in your project
import api from "../../URI/axiosInstance";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  PiggyBank,
  Boxes,
  CalendarRange,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
  Building2,
  Users,
} from "lucide-react";

/* =========================================================
   Types
========================================================= */
interface ProductRow {
  productId: string;
  productName: string;
  bags: number;
  kg: number;
  revenue: number;
  cost: number;
  profit: number;
  status: "profit" | "loss";
}
interface DailyRow { date: string; revenue: number; profit: number; expense: number; purchase: number; }
interface ExpenseRow { title: string; amount: number; }
interface FundRow { id: string; name: string; type: string; balance: number; totalIn: number; totalOut: number; }
interface CustomerDueRow { id: string; name: string; phone: string; totalBilled: number; totalPaid: number; totalDue: number; }
interface SupplierDueRow { id: string; name: string; phone: string; totalDue: number; advanceBalance: number; }
interface BagPipeline {
  totalOrders: number;
  totalOrderedBags: number;
  totalSentBags: number;
  totalReturnedBags: number;
  pendingToSend: number;
  pendingToReturn: number;
  pendingBagValue: number;
  statusCount: { pending: number; partial: number; completed: number };
}

interface SummaryResponse {
  range: { from: string | null; to: string | null; all: boolean };
  totals: {
    totalRevenue: number; totalDiscount: number; totalPaid: number; totalDueGenerated: number;
    grossProfit: number; totalExpense: number; netProfit: number;
    totalBagsSold: number; totalKgSold: number; salesCount: number; expenseCount: number;
    totalPurchaseAmount: number; totalPurchaseKg: number; totalPurchaseBags: number; purchaseCount: number;
  };
  overall: { totalFundBalance: number; totalCustomerDue: number; totalStockKg: number; totalSupplierDue: number; totalCompanyAdvance: number; };
  funds: FundRow[];
  customerDues: CustomerDueRow[];
  supplierDues: SupplierDueRow[];
  bagPipeline: BagPipeline;
  productBreakdown: ProductRow[];
  topSellingProducts: ProductRow[];
  dailyChart: DailyRow[];
  expenseByTitle: ExpenseRow[];
}

/* =========================================================
   Helpers
========================================================= */
const taka = (n: number) => `৳${Math.round(n || 0).toLocaleString("en-IN")}`;
const num = (n: number) => (n || 0).toLocaleString("en-IN");
const formatShortDate = (iso: string) => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}`; };
const firstOfMonth = (o = 0) => { const d = new Date(); d.setMonth(d.getMonth() + o, 1); return d.toISOString().slice(0, 10); };
const lastOfMonth = (o = 0) => { const d = new Date(); d.setMonth(d.getMonth() + o + 1, 0); return d.toISOString().slice(0, 10); };
const firstOfYear = () => `${new Date().getFullYear()}-01-01`;

type Preset = "this-month" | "last-month" | "this-year" | "all" | "custom";

/* =========================================================
   UI Atoms
========================================================= */
function StatCard({ label, value, sub, icon, tone = "neutral" }: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
  tone?: "neutral" | "profit" | "loss" | "warning" | "info";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-600 ring-slate-500/10",
    profit: "bg-emerald-50 text-emerald-600 ring-emerald-500/10",
    loss: "bg-rose-50 text-rose-600 ring-rose-500/10",
    warning: "bg-amber-50 text-amber-600 ring-amber-500/10",
    info: "bg-blue-50 text-blue-600 ring-blue-500/10",
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ring-inset ${toneClasses[tone]}`}>
          {icon}
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-1.5 text-xs font-medium text-slate-400">{sub}</p>}
    </div>
  );
}

function SectionCard({ title, subtitle, right, children, className = "" }: {
  title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 ${className}`}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-slate-900">{title}</h3>
          {subtitle && <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white/95 px-4 py-3 text-xs shadow-lg ring-1 ring-slate-200 backdrop-blur-md">
      <p className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-700">{label}</p>
      <div className="space-y-1.5">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 font-medium">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="text-slate-900">{taka(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable<T extends Record<string, any>>({
  columns, rows, searchPlaceholder, searchKeys, emptyText, maxHeight = "22rem",
}: {
  columns: { key: string; label: string; align?: "left" | "right"; render?: (row: T) => React.ReactNode }[];
  rows: T[]; searchPlaceholder?: string; searchKeys?: string[]; emptyText?: string; maxHeight?: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim() || !searchKeys?.length) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle)));
  }, [q, rows, searchKeys]);

  return (
    <div className="flex flex-col h-full">
      {searchKeys && (
        <div className="relative mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder || "Search..."}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-100"
          />
        </div>
      )}
      <div className="overflow-auto rounded-xl ring-1 ring-slate-200" style={{ maxHeight }}>
        <table className="min-w-full text-left text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`whitespace-nowrap border-b border-slate-200 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-sm font-medium text-slate-400">{emptyText || "No data available"}</td></tr>
            )}
            {filtered.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-slate-50/50">
                {columns.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-4 py-3 font-medium text-slate-700 ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {searchKeys && (
        <p className="mt-3 text-right text-[11px] font-medium text-slate-400">
          Showing {filtered.length} of {rows.length}
        </p>
      )}
    </div>
  );
}

/* =========================================================
   Main Dashboard
========================================================= */
export default function Dashboard() {
  const [preset, setPreset] = useState<Preset>("this-month");
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(lastOfMonth());
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (opts: { from?: string; to?: string; all?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (opts.all) params.all = "true";
      else { if (opts.from) params.from = opts.from; if (opts.to) params.to = opts.to; }
      const res = await api.get<SummaryResponse>("/dashboard-summary", { params });
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to load data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary({ from, to }); /* eslint-disable-next-line */ }, []);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "this-month") { const f = firstOfMonth(), t = lastOfMonth(); setFrom(f); setTo(t); fetchSummary({ from: f, to: t }); }
    else if (p === "last-month") { const f = firstOfMonth(-1), t = lastOfMonth(-1); setFrom(f); setTo(t); fetchSummary({ from: f, to: t }); }
    else if (p === "this-year") { const f = firstOfYear(), t = new Date().toISOString().slice(0, 10); setFrom(f); setTo(t); fetchSummary({ from: f, to: t }); }
    else if (p === "all") { fetchSummary({ all: true }); }
  }
  function applyCustomRange() { setPreset("custom"); fetchSummary({ from, to }); }

  const totals = data?.totals;
  const overall = data?.overall;
  const pipeline = data?.bagPipeline;

  const chartData = useMemo(
    () => (data?.dailyChart || []).map((d) => ({ ...d, label: formatShortDate(d.date) })),
    [data]
  );

  const barData = useMemo(() => {
    const list = data?.productBreakdown || [];
    const top10Profit = list.filter((p) => p.status === "profit").slice(0, 10);
    const top10Loss = [...list].filter((p) => p.status === "loss").sort((a, b) => a.profit - b.profit).slice(0, 10).reverse();
    return [...top10Profit, ...top10Loss].sort((a, b) => b.profit - a.profit);
  }, [data]);

  return (
    <div className="min-h-full bg-slate-50/50 p-6 antialiased font-sans">
      
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Dashboard Overview</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Profit/Loss, Funds, Dues, Purchases & Bag Pipeline at a glance</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            {([["this-month", "This Month"], ["last-month", "Last Month"], ["this-year", "This Year"], ["all", "All Time"]] as [Preset, string][]).map(([key, label]) => (
              <button key={key} onClick={() => applyPreset(key)}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${preset === key ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm ring-1 ring-slate-200">
            <CalendarRange className="h-4 w-4 text-slate-400" />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-xs font-medium text-slate-700 outline-none" />
            <span className="text-slate-300 px-1">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-xs font-medium text-slate-700 outline-none" />
            <button onClick={applyCustomRange} className="ml-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition-colors">Apply</button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {/* Row 1 — Headline Money Numbers */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Revenue" value={loading ? "…" : taka(totals?.totalRevenue || 0)}
          sub={loading ? undefined : `${num(totals?.salesCount || 0)} sales · ${num(totals?.totalBagsSold || 0)} bags`} 
          icon={<Wallet className="h-5 w-5" />} />
        
        <StatCard label="Net Profit (Period)" value={loading ? "…" : taka(totals?.netProfit || 0)}
          sub={loading ? undefined : `Gross ${taka(totals?.grossProfit || 0)} − Expense ${taka(totals?.totalExpense || 0)}`}
          icon={(totals?.netProfit || 0) >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          tone={(totals?.netProfit || 0) >= 0 ? "profit" : "loss"} />
        
        <StatCard label="Total Expense" value={loading ? "…" : taka(totals?.totalExpense || 0)}
          sub={loading ? undefined : `${num(totals?.expenseCount || 0)} entries`} 
          icon={<Receipt className="h-5 w-5" />} tone="warning" />
        
        <StatCard label="Purchases (Period)" value={loading ? "…" : taka(totals?.totalPurchaseAmount || 0)}
          sub={loading ? undefined : `${num(totals?.totalPurchaseKg || 0)} kg · ${num(totals?.totalPurchaseBags || 0)} bags · ${num(totals?.purchaseCount || 0)} bills`}
          icon={<ShoppingBag className="h-5 w-5" />} tone="info" />
      </div>

      {/* Row 2 — Snapshot Health Numbers (All-Time) */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Fund Balance" value={loading ? "…" : taka(overall?.totalFundBalance || 0)} 
          icon={<PiggyBank className="h-5 w-5" />} />
        
        <StatCard label="Current Stock" value={loading ? "…" : `${num(overall?.totalStockKg || 0)} kg`} 
          icon={<Boxes className="h-5 w-5" />} />
        
        <StatCard label="Customer Dues" value={loading ? "…" : taka(overall?.totalCustomerDue || 0)}
          sub={loading ? undefined : `${num(data?.customerDues.length || 0)} customers`} 
          icon={<Users className="h-5 w-5" />} tone="loss" />
        
        <StatCard label="Supplier Dues (Bag Companies)" value={loading ? "…" : taka(overall?.totalSupplierDue || 0)}
          sub={loading ? undefined : `Advance paid: ${taka(overall?.totalCompanyAdvance || 0)}`} 
          icon={<Building2 className="h-5 w-5" />} tone="warning" />
      </div>

      {/* Bag Pipeline Snapshot */}
      <SectionCard title="Bag Pipeline" subtitle="Order → Dispatch → Return (All-time metrics — date filters do not apply)" className="mb-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total Orders", value: num(pipeline?.totalOrders || 0) },
            { label: "Ordered Bags", value: num(pipeline?.totalOrderedBags || 0) },
            { label: "Dispatched Bags", value: num(pipeline?.totalSentBags || 0) },
            { label: "Returned Bags", value: num(pipeline?.totalReturnedBags || 0) },
            { label: "Pending Dispatch", value: num(pipeline?.pendingToSend || 0) },
            { label: "Pending Return", value: num(pipeline?.pendingToReturn || 0) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50 p-4 text-center ring-1 ring-inset ring-slate-200/60">
              <p className="text-xl font-bold text-slate-900">{s.value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">Pending: {num(pipeline?.statusCount.pending || 0)}</span>
          <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-600/20">Partial: {num(pipeline?.statusCount.partial || 0)}</span>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Completed: {num(pipeline?.statusCount.completed || 0)}</span>
          <span className="ml-auto inline-flex items-center rounded-full bg-rose-50 px-4 py-1 text-sm font-bold text-rose-700 ring-1 ring-inset ring-rose-600/20">Pending Bag Value: {taka(pipeline?.pendingBagValue || 0)}</span>
        </div>
      </SectionCard>

      {/* Trend Chart + Expense Breakdown */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Trends: Revenue, Profit, Expense & Purchase" subtitle="Chronological order (ascending)" className="lg:col-span-2">
          <div className="h-80 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b", fontWeight: 500 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b", fontWeight: 500 }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: '20px' }} iconType="circle" />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="expense" name="Expense" stroke="#f59e0b" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="purchase" name="Purchase" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Expense Breakdown" subtitle="By category (sorted by amount)">
          <div className="max-h-80 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
            {(data?.expenseByTitle || []).length === 0 && !loading && <p className="py-10 text-center text-sm font-medium text-slate-400">No expenses in this period</p>}
            {(data?.expenseByTitle || []).map((e) => {
              const pct = totals?.totalExpense ? (e.amount / totals.totalExpense) * 100 : 0;
              return (
                <div key={e.title} className="group">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-700">{e.title}</span>
                    <span className="font-semibold text-slate-500">{taka(e.amount)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-400 transition-all duration-500 ease-in-out group-hover:bg-amber-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Product Profit/Loss */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Product Profit & Loss" subtitle="Graph displays top 10 profit + top 10 loss items to maintain clarity" className="lg:col-span-2">
          <div className="h-[22rem] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b", fontWeight: 500 }} axisLine={false} tickLine={false} dx={-10} />
                <YAxis type="category" dataKey="productName" width={130} tick={{ fontSize: 11, fill: "#334155", fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="profit" name="Profit/Loss" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, i) => (<Cell key={i} fill={entry.profit >= 0 ? "#10b981" : "#ef4444"} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Product Rankings (All)" subtitle="Search to filter — sorted from highest profit to highest loss">
          <DataTable<ProductRow>
            rows={data?.productBreakdown || []}
            searchKeys={["productName"]}
            searchPlaceholder="Search product name..."
            emptyText="No sales in this period"
            maxHeight="22rem"
            columns={[
              { key: "productName", label: "Product" },
              { key: "kg", label: "Kg", align: "right", render: (r) => num(r.kg) },
              {
                key: "profit", label: "Profit/Loss", align: "right",
                render: (r) => (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${r.status === "profit" ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" : "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20"}`}>
                    {r.status === "profit" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {taka(Math.abs(r.profit))}
                  </span>
                ),
              },
            ]}
          />
        </SectionCard>
      </div>

      {/* Best Sellers + Funds */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Top Selling Products" subtitle="Sorted by volume (kg) — regardless of profit/loss">
          <DataTable<ProductRow>
            rows={data?.topSellingProducts || []}
            searchKeys={["productName"]}
            searchPlaceholder="Search product name..."
            emptyText="No sales in this period"
            maxHeight="22rem"
            columns={[
              { key: "productName", label: "Product" },
              { key: "bags", label: "Bags", align: "right", render: (r) => num(r.bags) },
              { key: "kg", label: "Kg", align: "right", render: (r) => num(r.kg) },
              { key: "revenue", label: "Revenue", align: "right", render: (r) => taka(r.revenue) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Fund Balances" subtitle="All-time totals (date filters do not apply)">
          <DataTable<FundRow>
            rows={data?.funds || []}
            emptyText="No funds available"
            maxHeight="22rem"
            columns={[
              { key: "name", label: "Fund" },
              { key: "type", label: "Type", render: (r) => <span className="capitalize">{r.type}</span> },
              { key: "totalIn", label: "Total In", align: "right", render: (r) => taka(r.totalIn) },
              { key: "totalOut", label: "Total Out", align: "right", render: (r) => taka(r.totalOut) },
              { key: "balance", label: "Current Balance", align: "right", render: (r) => <span className="font-bold text-slate-900">{taka(r.balance)}</span> },
            ]}
          />
        </SectionCard>
      </div>

      {/* Customer Dues + Supplier Dues */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Customer Dues List" subtitle="Sorted by highest due amount">
          <DataTable<CustomerDueRow>
            rows={data?.customerDues || []}
            searchKeys={["name", "phone"]}
            searchPlaceholder="Search by name or phone..."
            emptyText="No pending customer dues 🎉"
            maxHeight="22rem"
            columns={[
              { key: "name", label: "Name" },
              { key: "phone", label: "Phone", render: (r) => <span className="text-slate-500">{r.phone || "-"}</span> },
              { key: "totalBilled", label: "Total Billed", align: "right", render: (r) => taka(r.totalBilled) },
              { key: "totalPaid", label: "Paid", align: "right", render: (r) => taka(r.totalPaid) },
              { key: "totalDue", label: "Due", align: "right", render: (r) => <span className="font-bold text-rose-600">{taka(r.totalDue)}</span> },
            ]}
          />
        </SectionCard>

        <SectionCard title="Supplier Dues List (Bag Companies)" subtitle="Sorted by highest due amount">
          <DataTable<SupplierDueRow>
            rows={data?.supplierDues || []}
            searchKeys={["name", "phone"]}
            searchPlaceholder="Search by company or phone..."
            emptyText="No pending supplier dues 🎉"
            maxHeight="22rem"
            columns={[
              { key: "name", label: "Company" },
              { key: "phone", label: "Phone", render: (r) => <span className="text-slate-500">{r.phone || "-"}</span> },
              { key: "advanceBalance", label: "Advance Balance", align: "right", render: (r) => <span className="font-bold text-emerald-600">{taka(r.advanceBalance)}</span> },
              { key: "totalDue", label: "Due", align: "right", render: (r) => <span className="font-bold text-rose-600">{taka(r.totalDue)}</span> },
            ]}
          />
        </SectionCard>
      </div>
      
    </div>
  );
}