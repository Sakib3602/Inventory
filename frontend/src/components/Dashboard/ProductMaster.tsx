import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../../URI/axiosInstance";

interface Product {
  _id: string;
  name: string;
  category: string;
  brand: string;
  salePricePerBag: number;
  salePrices?: { bagSize: number; salePrice: number }[];
  purchasePricePerKg: number;
  code: string;
  status: "active" | "inactive";
  createdAt: string;
}

interface Category {
  _id: string;
  name: string;
}

interface PurchaseBatch {
  date: string;
  company: string;
  bagCount: number;
  totalKg: number;
  amount: number;
  costPerKgWithoutBag: number;
  costPerKgWithBag: number;
  bagSize: number;
}

const NEW_CATEGORY_VALUE = "__new__";

const emptyForm = {
  name: "",
  category: "",
  brand: "",
  salePricePerBag: "",
  status: "active" as "active" | "inactive",
};

const ProductMaster = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Pagination
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [priceRows, setPriceRows] = useState([{ bagSize: "", salePrice: "" }]);
  const [saving, setSaving] = useState(false);

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const [historyTarget, setHistoryTarget] = useState<Product | null>(null);
  const [batches, setBatches] = useState<PurchaseBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2200);
  };

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axiosInstance.get("/categories");
      setCategories(res.data);
    } catch (err) {
      showToast("⚠️ Category লোড হয়নি");
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await axiosInstance.get("/products", { params });
      setProducts(res.data);
    } catch (err) {
      showToast("⚠️ Product লোড হয়নি");
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const t = setTimeout(fetchProducts, 300);
    return () => clearTimeout(t);
  }, [fetchProducts]);

  const openAddModal = () => {
    setEditingId(null);
    setForm({ ...emptyForm, category: categories[0]?.name || "" });
    setPriceRows([{ bagSize: "", salePrice: "" }]);
    setAddingCategory(false);
    setNewCategoryName("");
    setModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingId(p._id);
    setForm({
      name: p.name,
      category: p.category,
      brand: p.brand,
      salePricePerBag: String(p.salePricePerBag || ""),
      status: p.status,
    });
    setPriceRows(p.salePrices?.length ? p.salePrices.map((price) => ({ bagSize: String(price.bagSize), salePrice: String(price.salePrice) })) : [{ bagSize: "", salePrice: "" }]);
    setAddingCategory(false);
    setNewCategoryName("");
    setModalOpen(true);
  };

  const handleCategorySelect = (value: string) => {
    if (value === NEW_CATEGORY_VALUE) {
      setAddingCategory(true);
      setNewCategoryName("");
    } else {
      setForm({ ...form, category: value });
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return showToast("⚠️ Category নাম দাও");
    setSavingCategory(true);
    try {
      const res = await axiosInstance.post("/categories", { name: newCategoryName.trim() });
      const created: Category = res.data;
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ ...form, category: created.name });
      setAddingCategory(false);
      setNewCategoryName("");
      showToast("✅ Category যোগ হলো");
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "Category যোগ হয়নি"));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return showToast("⚠️ Item Name দাও");
    if (!form.category) return showToast("⚠️ Category বেছে নাও");

    setSaving(true);
    try {
      if (editingId) {
        await axiosInstance.patch(`/products/${editingId}`, { ...form, salePrices: priceRows });
        showToast("✅ Update হলো");
      } else {
        await axiosInstance.post("/products", { ...form, salePrices: priceRows });
        showToast("✅ নতুন Item যোগ হলো");
      }
      setModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      showToast("⚠️ " + (err?.response?.data?.message || "সমস্যা হয়েছে"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axiosInstance.delete(`/products/${deleteTarget._id}`);
      showToast("✅ Delete হলো");
      setDeleteTarget(null);
      fetchProducts();
    } catch (err) {
      showToast("⚠️ Delete হয়নি");
    }
  };

  const openHistory = async (p: Product) => {
    setHistoryTarget(p);
    setBatches([]);
    setBatchesLoading(true);
    try {
      const res = await axiosInstance.get(`/products/${p._id}/purchase-history`);
      setBatches(res.data);
    } catch (err) {
      showToast("⚠️ History লোড হয়নি");
    } finally {
      setBatchesLoading(false);
    }
  };

  const activeCount = products.filter((p) => p.status === "active").length;

  const totalPages = Math.ceil(products.length / itemsPerPage);
  const paginatedProducts = products.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1f2b22]">Product / Feed Master</h1>
          <p className="text-sm text-gray-400 mt-0.5">বস্তার ওজন ও বিক্রয় মূল্য/বস্তা বসাও — Purchase History দেখতে row-এ ক্লিক করো</p>
        </div>
        <button onClick={openAddModal} className="bg-[#1f2b22] hover:bg-[#28392f] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
          + নতুন Item
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-[#1f2b22]">{products.length}</p>
          <p className="text-xs text-gray-400 mt-1">Total Item</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-emerald-700">{activeCount}</p>
          <p className="text-xs text-gray-400 mt-1">Active</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-[#1f2b22]">{categories.length}</p>
          <p className="text-xs text-gray-400 mt-1">Category</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="🔍 Name / Code / Brand..." className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm" />
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }} className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
          <option value="">সব Category</option>
          {categories.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
          <option value="">সব Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">লোড হচ্ছে...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">কোনো item নেই</div>
      ) : (
        <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500 text-xs uppercase">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">ওজন অনুযায়ী Sale Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((p) => (
                <tr key={p._id} onClick={() => openHistory(p)} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.code}</td>
                  <td className="px-4 py-3 font-medium text-[#1f2b22]">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.category}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.salePrices?.length ? p.salePrices.map((price) => `${price.bagSize}kg: ৳${price.salePrice}`).join(" · ") : <span className="text-red-400">সেট করা নেই</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${p.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {p.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEditModal(p)} className="text-xs text-[#1f2b22] hover:underline mr-3">Edit</button>
                    <button onClick={() => setDeleteTarget(p)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-t border-gray-200">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="text-xs bg-white border px-3 py-1 rounded disabled:opacity-50">Prev</button>
              <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="text-xs bg-white border px-3 py-1 rounded disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[#1f2b22] mb-4">{editingId ? "Item Update করো" : "নতুন Item যোগ করো"}</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Item Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="যেমন: Carp Special Grower" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Category *</label>
                  <select value={addingCategory ? NEW_CATEGORY_VALUE : form.category} onChange={(e) => handleCategorySelect(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {categories.length === 0 && <option value="">Category নেই</option>}
                    {categories.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
                    <option value={NEW_CATEGORY_VALUE}>+ নতুন Category</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Brand</label>
                  <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Perfect Agro Feeds" />
                </div>
              </div>

              {addingCategory && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 -mt-1">
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">নতুন Category</label>
                  <div className="flex gap-2">
                    <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" placeholder="যেমন: Shrimp Feed" autoFocus />
                    <button type="button" onClick={handleAddCategory} disabled={savingCategory} className="bg-[#1f2b22] hover:bg-[#28392f] text-white text-xs font-semibold px-4 rounded-lg disabled:opacity-50">{savingCategory ? "..." : "Add"}</button>
                    <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryName(""); }} className="text-gray-400 hover:text-gray-600 text-xs px-2">বাতিল</button>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-500">ওজন অনুযায়ী Sale Price *</label>
                  <button type="button" onClick={() => setPriceRows((rows) => [...rows, { bagSize: "", salePrice: "" }])} className="text-xs text-[#1f2b22] font-semibold">+ আরেকটি</button>
                </div>
                <div className="flex flex-col gap-2">
                  {priceRows.map((row, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <input type="number" value={row.bagSize} onChange={(e) => setPriceRows((rows) => rows.map((item, i) => i === index ? { ...item, bagSize: e.target.value } : item))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="বস্তার kg" />
                      <input type="number" value={row.salePrice} onChange={(e) => setPriceRows((rows) => rows.map((item, i) => i === index ? { ...item, salePrice: e.target.value } : item))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Sale Price" />
                      {priceRows.length > 1 && <button type="button" onClick={() => setPriceRows((rows) => rows.filter((_, i) => i !== index))} className="text-red-500 px-2">✕</button>}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm font-semibold">বাতিল</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#1f2b22] hover:bg-[#28392f] text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? "Saving..." : "Save করো"}</button>
            </div>
          </div>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setHistoryTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[#1f2b22]">{historyTarget.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">দামের বিস্তারিত (বস্তা সহ এবং ছাড়া)</p>
              </div>
              <button onClick={() => setHistoryTarget(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
            </div>

            {batchesLoading ? (
              <div className="text-center py-10 text-gray-400 text-sm">লোড হচ্ছে...</div>
            ) : batches.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">এখনো কোনো Return হয়নি</p>
            ) : (
              <div className="flex flex-col gap-2">
                {batches.map((b, i) => {
                  const bagSize = b.bagSize || 1;
                  const perBagWithoutBag = (b.costPerKgWithoutBag || 0) * bagSize;
                  const perBagWithBag = (b.costPerKgWithBag || 0) * bagSize;

                  return (
                    <div key={i} className="border border-gray-200 rounded-lg p-3 text-sm bg-gray-50 flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-[#1f2b22]">{b.date} <span className="text-gray-400 font-normal">({b.company})</span></p>
                        <p className="text-xs text-gray-500 mt-1">{b.bagCount} বস্তা · {b.totalKg} kg · সাইজ: {bagSize}kg</p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-600 font-semibold text-xs">
                          বস্তা ছাড়া: ৳{b.costPerKgWithoutBag?.toFixed(2) || "0.00"}/kg | <span className="font-bold">৳{perBagWithoutBag.toFixed(2)}/বস্তা</span>
                        </p>
                        <p className="text-amber-600 font-bold text-xs mt-1">
                          বস্তা সহ: ৳{b.costPerKgWithBag?.toFixed(2) || "0.00"}/kg | <span className="font-bold text-[13px]">৳{perBagWithBag.toFixed(2)}/বস্তা</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-600 mb-1">নিশ্চিত?</p>
            <p className="font-semibold text-[#1f2b22] mb-5">"{deleteTarget.name}" delete হবে</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm font-semibold">বাতিল</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1f2b22] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">{toastMsg}</div>}
    </div>
  );
};

export default ProductMaster;