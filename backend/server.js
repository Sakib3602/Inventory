const express = require("express");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { MongoClient, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 5000;
const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;

const client = new MongoClient(uri);

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected successfully");

    const db = client.db(dbName);

    /* =========================================================
       Collections
    ========================================================= */
    const AllUser = db.collection("AllUser");
    const Products = db.collection("Products");
    const Categories = db.collection("Categories");
    const Stock = db.collection("Stock");
    const Funds = db.collection("Funds");
    const FundTransactions = db.collection("FundTransactions");
    const FactoryOrders = db.collection("FactoryOrders");
    const FactoryReturns = db.collection("FactoryReturns");
    const Companies = db.collection("Companies");
    const Customers = db.collection("Customers");
    const Sales = db.collection("Sales");
    const BagDispatches = db.collection("BagDispatches");
    const Expenses = db.collection("Expenses"); // <-- New Collection for Expenses

    /* =========================================================
       Authentication & Middleware
    ========================================================= */
    app.post("/register", async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).send({ message: "Email ও Password দিন" });
        const existingUser = await AllUser.findOne({ email });
        if (existingUser) return res.status(400).send({ message: "এই email দিয়ে আগে থেকেই account আছে" });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const result = await AllUser.insertOne({ email, password: hashedPassword, isActive: false, createdAt: new Date() });
        const token = generateToken(result.insertedId);
        res.cookie("token", token, cookieOptions);
        res.status(201).send({ _id: result.insertedId, email });
      } catch (err) { res.status(500).send({ message: "Server error", error: err.message }); }
    });

    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).send({ message: "Email ও Password দিন" });
        const user = await AllUser.findOne({ email });
        if (!user) return res.status(401).send({ message: "ভুল Email অথবা Password" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).send({ message: "ভুল Email অথবা Password" });
        if (!user.isActive) return res.status(403).send({ message: "আপনার account বর্তমানে inactive, Admin এর সাথে যোগাযোগ করুন" });
        const token = generateToken(user._id);
        res.cookie("token", token, cookieOptions);
        res.status(200).send({ _id: user._id, email: user.email });
      } catch (err) { res.status(500).send({ message: "Server error", error: err.message }); }
    });

    app.post("/logout", (req, res) => {
      res.clearCookie("token", cookieOptions);
      res.status(200).send({ message: "Logged out successfully" });
    });

    async function protect(req, res, next) {
      try {
        const token = req.cookies.token;
        if (!token) return res.status(401).send({ message: "No token, login করুন" });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await AllUser.findOne({ _id: new ObjectId(decoded.id) }, { projection: { password: 0 } });
        if (!user) return res.status(401).send({ message: "User not found" });
        if (!user.isActive) {
          res.clearCookie("token", cookieOptions);
          return res.status(403).send({ message: "আপনার account inactive করা হয়েছে" });
        }
        req.user = user;
        next();
      } catch (err) { return res.status(401).send({ message: "Token invalid or expired" }); }
    }

    app.get("/me", protect, (req, res) => res.send(req.user));

    /* =========================================================
       Dashboard Stats
    ========================================================= */
    app.get("/dashboard-stats", protect, async (req, res) => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const sales = await Sales.find({}).toArray();
        const funds = await Funds.find({}).toArray();
        const customers = await Customers.find({}).toArray();
        const stock = await Stock.find({}).toArray();
        const orders = await FactoryOrders.find({}).toArray();
        const expenses = await Expenses.find({}).toArray();

        const totalSalesAmount = sales.reduce((sum, s) => sum + (s.totalBill || 0), 0);
        const todaySalesAmount = sales.filter((s) => s.date === today).reduce((sum, s) => sum + (s.totalBill || 0), 0);
        const grossProfit = sales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
        const totalDue = customers.reduce((sum, c) => sum + (c.totalDue || 0), 0);
        const totalFundBalance = funds.reduce((sum, f) => sum + (f.balance || 0), 0);
        const pendingOrdersCount = orders.filter((o) => (o.sentBags || 0) > (o.returnedBags || 0)).length;
        const totalStockKg = stock.reduce((sum, s) => sum + (s.currentKg || 0), 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        const netProfit = grossProfit - totalExpenses;

        res.status(200).send({
          totalSalesAmount, todaySalesAmount, grossProfit, netProfit, totalExpenses,
          totalDue, totalFundBalance, pendingOrdersCount, totalStockKg,
        });
      } catch (err) { res.status(500).send({ message: "Server error", error: err.message }); }
    });

    /* =========================================================
       Expenses (NEW)
    ========================================================= */
    app.get("/expenses", protect, async (req, res) => {
      try {
        const expenses = await Expenses.find({}).sort({ date: -1, createdAt: -1 }).toArray();
        res.status(200).send(expenses);
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.post("/expenses", protect, async (req, res) => {
      try {
        const { title, amount, date, note, fundId } = req.body;
        const amountNum = Number(amount);
        if (!title || !amountNum || !fundId) return res.status(400).send({ message: "Title, Amount এবং Fund আবশ্যক" });

        const fund = await Funds.findOne({ _id: new ObjectId(fundId) });
        if (!fund || fund.balance < amountNum) return res.status(400).send({ message: "Fund এ যথেষ্ট টাকা নেই" });

        // Deduct from fund
        await Funds.updateOne(
          { _id: fund._id },
          { $inc: { balance: -amountNum, totalOut: amountNum }, $set: { updatedAt: new Date() } }
        );

        const newExpense = {
          title: title.trim(),
          amount: amountNum,
          date: date || new Date().toISOString().slice(0, 10),
          note: note?.trim() || "",
          fundId: fund._id,
          fundName: fund.name,
          createdBy: req.user._id,
          createdAt: new Date(),
        };

        const result = await Expenses.insertOne(newExpense);

        // Add to Fund Transactions
        await FundTransactions.insertOne({
          fundId: fund._id,
          fundName: fund.name,
          type: "expense",
          direction: "out",
          amount: amountNum,
          note: `Expense: ${title.trim()}`,
          date: newExpense.date,
          createdBy: req.user._id,
          createdAt: new Date(),
        });

        res.status(201).send(await Expenses.findOne({ _id: result.insertedId }));
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.delete("/expenses/:id", protect, async (req, res) => {
      try {
        const expense = await Expenses.findOne({ _id: new ObjectId(req.params.id) });
        if (!expense) return res.status(404).send({ message: "Expense পাওয়া যায়নি" });

        // Refund money back to the fund
        await Funds.updateOne(
          { _id: expense.fundId },
          { $inc: { balance: expense.amount, totalOut: -expense.amount }, $set: { updatedAt: new Date() } }
        );

        await FundTransactions.insertOne({
          fundId: expense.fundId,
          fundName: expense.fundName,
          type: "expense_reversed",
          direction: "in",
          amount: expense.amount,
          note: `Expense Refund: ${expense.title}`,
          date: new Date().toISOString().slice(0, 10),
          createdBy: req.user._id,
          createdAt: new Date(),
        });

        await Expenses.deleteOne({ _id: expense._id });
        res.status(200).send({ message: "Expense deleted successfully" });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });


    /* =========================================================
       Products & Categories
    ========================================================= */
    async function generateProductCode() {
      const count = await Products.countDocuments();
      return `PRD-${String(count + 1).padStart(4, "0")}`;
    }
    app.get("/products", protect, async (req, res) => {
      try {
        const { search = "", category = "", status = "" } = req.query;
        const query = {};
        if (search) query.$or = [{ name: { $regex: search, $options: "i" } }, { code: { $regex: search, $options: "i" } }, { brand: { $regex: search, $options: "i" } }];
        if (category) query.category = category;
        if (status) query.status = status;
        const products = await Products.find(query).sort({ createdAt: -1 }).toArray();
        res.status(200).send(products);
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });
    app.get("/products/:id/purchase-history", protect, async (req, res) => {
      try {
        const productId = new ObjectId(req.params.id);
        const returns = await FactoryReturns.find({ "items.productId": productId }).sort({ date: -1 }).toArray();
        const batches = [];
        returns.forEach((r) => { r.items.forEach((it) => { if (it.productId.toString() === req.params.id) batches.push({ date: r.date, company: r.company, bagCount: it.bagCount, totalKg: it.totalKg, amount: it.amount, costPerKgWithoutBag: it.costPerKgWithoutBag, costPerKgWithBag: it.costPerKgWithBag, bagSize: it.bagSize }); }); });
        res.status(200).send(batches);
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });
    app.get("/products/:id", protect, async (req, res) => {
      try {
        const product = await Products.findOne({ _id: new ObjectId(req.params.id) });
        if (!product) return res.status(404).send({ message: "Product পাওয়া যায়নি" });
        res.status(200).send(product);
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });
    app.post("/products", protect, async (req, res) => {
      try {
        const { name, category, brand, bagSize, salePricePerBag, salePrices, status } = req.body;
        if (!name || !category) return res.status(400).send({ message: "Name, Category আবশ্যক" });
        const existing = await Products.findOne({ name: name.trim(), category });
        if (existing) return res.status(400).send({ message: "এই নামে এই Category-তে item আগে থেকেই আছে" });
        const code = await generateProductCode();
        const newProduct = { name: name.trim(), category, brand: brand?.trim() || "", bagSize: Number(bagSize) || 0, salePricePerBag: Number(salePricePerBag) || 0, salePrices: Array.isArray(salePrices) ? salePrices.map((price) => ({ bagSize: Number(price.bagSize) || 0, salePrice: Number(price.salePrice) || 0 })).filter((price) => price.bagSize > 0 && price.salePrice > 0) : [], purchasePricePerKg: 0, totalPurchasedKg: 0, totalPurchasedAmount: 0, code, status: status || "active", createdBy: req.user._id, createdAt: new Date(), updatedAt: new Date() };
        const result = await Products.insertOne(newProduct);
        res.status(201).send({ ...newProduct, _id: result.insertedId });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });
    app.patch("/products/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const updates = { ...req.body, updatedAt: new Date() };
        delete updates._id; delete updates.code; delete updates.createdAt; delete updates.createdBy; delete updates.purchasePricePerKg; delete updates.totalPurchasedKg; delete updates.totalPurchasedAmount;
        if (updates.salePricePerBag !== undefined) updates.salePricePerBag = Number(updates.salePricePerBag) || 0;
        if (updates.bagSize !== undefined) updates.bagSize = Number(updates.bagSize) || 0;
        if (updates.salePrices !== undefined) { updates.salePrices = Array.isArray(updates.salePrices) ? updates.salePrices.map((price) => ({ bagSize: Number(price.bagSize) || 0, salePrice: Number(price.salePrice) || 0 })).filter((price) => price.bagSize > 0 && price.salePrice > 0) : []; }
        await Products.updateOne({ _id }, { $set: updates });
        res.status(200).send(await Products.findOne({ _id }));
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });
    app.delete("/products/:id", protect, async (req, res) => {
      try {
        const result = await Products.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).send({ message: "Product পাওয়া যায়নি" });
        res.status(200).send({ message: "Product delete হয়েছে" });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.get("/categories", protect, async (req, res) => { res.status(200).send(await Categories.find({}).sort({ name: 1 }).toArray()); });
    app.post("/categories", protect, async (req, res) => {
      try {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).send({ message: "Category নাম দাও" });
        const trimmed = name.trim();
        const existing = await Categories.findOne({ name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" } });
        if (existing) return res.status(400).send({ message: "এই Category আগে থেকেই আছে" });
        const newCategory = { name: trimmed, createdBy: req.user._id, createdAt: new Date() };
        const result = await Categories.insertOne(newCategory);
        res.status(201).send({ ...newCategory, _id: result.insertedId });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });
    app.delete("/categories/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const category = await Categories.findOne({ _id });
        if (!category) return res.status(404).send({ message: "Category পাওয়া যায়নি" });
        const inUse = await Products.findOne({ category: category.name });
        if (inUse) return res.status(400).send({ message: "এই Category-তে Product আছে, আগে সেগুলো সরাও" });
        await Categories.deleteOne({ _id });
        res.status(200).send({ message: "Category delete হয়েছে" });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    /* =========================================================
       Funds & Fund Transactions
    ========================================================= */
    async function ensureDefaultFunds() {
      const defaults = [{ name: "Cash in Hand", type: "default", deletable: false }, { name: "Bank", type: "default", deletable: true }, { name: "Profit Fund", type: "profit", deletable: false }];
      for (const f of defaults) {
        const exists = await Funds.findOne({ name: f.name });
        if (!exists) await Funds.insertOne({ ...f, balance: 0, totalIn: 0, totalOut: 0, createdAt: new Date() });
      }
    }
    await ensureDefaultFunds();

    app.get("/funds", protect, async (req, res) => { res.status(200).send(await Funds.find({}).sort({ createdAt: 1 }).toArray()); });
    app.post("/funds", protect, async (req, res) => {
      try {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).send({ message: "Fund নাম দাও" });
        const trimmed = name.trim();
        const existing = await Funds.findOne({ name: { $regex: `^${trimmed}$`, $options: "i" } });
        if (existing) return res.status(400).send({ message: "এই নামে Fund আগে থেকেই আছে" });
        const newFund = { name: trimmed, type: "custom", deletable: true, balance: 0, totalIn: 0, totalOut: 0, createdBy: req.user._id, createdAt: new Date() };
        const result = await Funds.insertOne(newFund);
        res.status(201).send({ ...newFund, _id: result.insertedId });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.post("/funds/:id/deposit", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const { amount, note, date } = req.body;
        const amountNum = Number(amount);
        if (!amountNum || amountNum <= 0) return res.status(400).send({ message: "সঠিক Amount দাও" });
        const fund = await Funds.findOne({ _id });
        if (!fund) return res.status(404).send({ message: "Fund পাওয়া যায়নি" });
        if (fund.type === "profit") return res.status(400).send({ message: "Profit Fund এ সরাসরি Deposit করা যায় না" });
        await Funds.updateOne({ _id }, { $inc: { balance: amountNum, totalIn: amountNum }, $set: { updatedAt: new Date() } });
        await FundTransactions.insertOne({ fundId: _id, fundName: fund.name, type: "deposit", direction: "in", amount: amountNum, note: note?.trim() || "Manual Deposit", date: date || new Date().toISOString().slice(0, 10), createdBy: req.user._id, createdAt: new Date() });
        res.status(200).send(await Funds.findOne({ _id }));
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.delete("/funds/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const fund = await Funds.findOne({ _id });
        if (!fund) return res.status(404).send({ message: "Fund পাওয়া যায়নি" });
        if (!fund.deletable) return res.status(400).send({ message: "এই Fund Delete করা যাবে না" });
        if (fund.balance !== 0) return res.status(400).send({ message: "Fund এ এখনো টাকা আছে, আগে balance 0 করো" });
        await Funds.deleteOne({ _id });
        res.status(200).send({ message: "Fund Delete হয়েছে" });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.get("/fund-transactions", protect, async (req, res) => {
      try {
        const { fundId } = req.query;
        const query = {};
        if (fundId) query.fundId = new ObjectId(fundId);
        const transactions = await FundTransactions.find(query).sort({ createdAt: -1 }).toArray();
        res.status(200).send(transactions);
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    /* =========================================================
       Company Helper & Ledger
    ========================================================= */
    async function getOrCreateCompany(name, phone = "") {
      const trimmed = name.trim();
      let company = await Companies.findOne({ name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" } });
      if (!company) {
        const result = await Companies.insertOne({ name: trimmed, phone: phone?.trim() || "", advanceBalance: 0, totalAdvanceGiven: 0, totalBillPaid: 0, createdAt: new Date() });
        company = await Companies.findOne({ _id: result.insertedId });
      } else if (phone && !company.phone) {
        await Companies.updateOne({ _id: company._id }, { $set: { phone: phone.trim() } });
        company.phone = phone.trim();
      }
      return company;
    }

    app.get("/companies", protect, async (req, res) => {
      try {
        const companies = await Companies.find({}).sort({ name: 1 }).toArray();
        const orders = await FactoryOrders.find({ bagDue: { $gt: 0 } }).toArray();
        const companiesWithDue = companies.map(c => {
          const cOrders = orders.filter(o => o.bagSupplierId?.toString() === c._id.toString() || o.bagSupplier === c.name);
          const totalDue = cOrders.reduce((sum, o) => sum + (o.bagDue || 0), 0);
          return { ...c, totalDue };
        });
        res.status(200).send(companiesWithDue);
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.post("/companies/:id/pay", protect, async (req, res) => {
      try {
        const companyId = new ObjectId(req.params.id);
        const { amount, fundId, note, date } = req.body;
        const amountNum = Number(amount);
        const fund = await Funds.findOne({ _id: new ObjectId(fundId) });
        if (!fund || fund.balance < amountNum) return res.status(400).send({ message: "Fund এ যথেষ্ট টাকা নেই" });
        const company = await Companies.findOne({ _id: companyId });

        await Funds.updateOne({ _id: fund._id }, { $inc: { balance: -amountNum, totalOut: amountNum } });
        let remainingAmount = amountNum;
        const pendingOrders = await FactoryOrders.find({ $or: [{ bagSupplierId: companyId }, { bagSupplier: company.name }], bagDue: { $gt: 0 } }).sort({ date: 1 }).toArray();

        for (const order of pendingOrders) {
            if (remainingAmount <= 0) break;
            const payForThisOrder = Math.min(order.bagDue, remainingAmount);
            await FactoryOrders.updateOne({ _id: order._id }, { $inc: { bagPaidAmount: payForThisOrder, bagDue: -payForThisOrder } });
            remainingAmount -= payForThisOrder;
        }
        if (remainingAmount > 0) { await Companies.updateOne({ _id: companyId }, { $inc: { advanceBalance: remainingAmount, totalAdvanceGiven: remainingAmount } }); }

        await FundTransactions.insertOne({ fundId: fund._id, fundName: fund.name, type: "factory_payment", direction: "out", amount: amountNum, note: note?.trim() || `Payment to ${company.name}`, date: date || new Date().toISOString().slice(0, 10), createdBy: req.user._id, createdAt: new Date() });
        res.status(200).send({ message: "Payment successful" });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.get("/companies/:id/history", protect, async (req, res) => {
      try {
        const companyId = new ObjectId(req.params.id);
        const company = await Companies.findOne({ _id: companyId });
        const orders = await FactoryOrders.find({ bagSupplierId: companyId }).sort({ date: -1 }).toArray();
        const dispatches = await BagDispatches.find({ factoryId: companyId }).sort({ date: -1 }).toArray();
        const returns = await FactoryReturns.find({ $or: [{ companyId }, { bagCompanyId: companyId }] }).sort({ date: -1 }).toArray();
        const directPayments = await FundTransactions.find({ type: "factory_payment", note: { $regex: company.name, $options: "i" } }).sort({ date: -1 }).toArray();

        const productMap = {};
        returns.forEach((ret) => {
          if (ret.companyId?.toString() === companyId.toString()) {
              const totalPaidForReturn = (ret.advanceUsed || 0) + (ret.remainingPaid || 0);
              const paidRatio = totalPaidForReturn / (ret.totalBillAmount || 1);
              ret.items.forEach((item) => {
                const key = item.productId.toString();
                if (!productMap[key]) productMap[key] = { productId: key, productName: item.productName, totalKg: 0, totalBags: 0, totalBill: 0, paid: 0 };
                productMap[key].totalKg += item.totalKg || 0; productMap[key].totalBags += item.bagCount || 0;
                productMap[key].totalBill += item.amount || 0; productMap[key].paid += (item.amount || 0) * paidRatio;
              });
          }
        });
        const productBreakdown = Object.values(productMap).map((item) => ({ ...item, payable: item.totalBill - item.paid }));
        res.status(200).send({ orders, dispatches, returns, directPayments, productBreakdown });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    /* =========================================================
       Factory Orders (Empty Bags) & Returns
    ========================================================= */
    app.get("/factory-orders", protect, async (req, res) => res.status(200).send(await FactoryOrders.find({}).sort({ date: -1, createdAt: -1 }).toArray()));
    app.get("/bag-dispatches", protect, async (req, res) => res.status(200).send(await BagDispatches.find({}).toArray()));

    app.post("/factory-orders", protect, async (req, res) => {
      try {
        const { bagSupplier, bagSupplierPhone, date, bagName, bagCount, weightPerBag, bagPrice, bagPaidAmount, fundId } = req.body;
        const bagCompDoc = await getOrCreateCompany(bagSupplier, bagSupplierPhone);
        const bagCountNum = Number(bagCount); const weightPerBagNum = Number(weightPerBag);
        const totalBagPrice = bagCountNum * (Number(bagPrice) || 0);
        const bagPaidNum = Number(bagPaidAmount) || 0;

        let fund = null;
        if (bagPaidNum > 0) {
          fund = await Funds.findOne({ _id: new ObjectId(fundId) });
          if (!fund || fund.balance < bagPaidNum) return res.status(400).send({ message: "Fund এ যথেষ্ট টাকা নেই" });
        }

        const newOrder = {
          bagSupplier: bagCompDoc.name, bagSupplierId: bagCompDoc._id, date: date || new Date().toISOString().slice(0, 10),
          bagName: bagName?.trim() || "", bagCount: bagCountNum, weightPerBag: weightPerBagNum, expectedTotalKg: bagCountNum * weightPerBagNum,
          bagPrice: Number(bagPrice) || 0, totalBagPrice, bagPaidAmount: bagPaidNum, bagDue: totalBagPrice - bagPaidNum,
          sentBags: 0, returnedBags: 0, status: "pending", createdBy: req.user._id, createdAt: new Date(),
        };

        const result = await FactoryOrders.insertOne(newOrder);

        if (bagPaidNum > 0 && fund) {
          await Funds.updateOne({ _id: fund._id }, { $inc: { balance: -bagPaidNum, totalOut: bagPaidNum } });
          await FundTransactions.insertOne({ fundId: fund._id, fundName: fund.name, type: "bag_payment", direction: "out", amount: bagPaidNum, note: `Bag Payment — ${bagCompDoc.name}`, date: newOrder.date, createdBy: req.user._id, createdAt: new Date() });
        }
        res.status(201).send(await FactoryOrders.findOne({ _id: result.insertedId }));
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.post("/factory-orders/:id/dispatch", protect, async (req, res) => {
      try {
        const { factory, factoryPhone, date, count } = req.body;
        const order = await FactoryOrders.findOne({ _id: new ObjectId(req.params.id) });
        if(!order) return res.status(404).send({message: "Order not found"});

        const countNum = Number(count);
        if(countNum <= 0 || countNum > (order.bagCount - (order.sentBags || 0))) return res.status(400).send({message: "Invalid count"});

        const compDoc = await getOrCreateCompany(factory, factoryPhone);
        await BagDispatches.insertOne({ orderId: order._id, bagSupplier: order.bagSupplier, bagName: order.bagName, weightPerBag: order.weightPerBag, factory: compDoc.name, factoryId: compDoc._id, count: countNum, date, createdBy: req.user._id, createdAt: new Date() });
        await FactoryOrders.updateOne({ _id: order._id }, { $inc: { sentBags: countNum } });
        res.status(200).send({ message: "Dispatched successfully" });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.get("/factory-orders/:id/dispatches", protect, async (req, res) => {
        res.status(200).send(await BagDispatches.find({ orderId: new ObjectId(req.params.id) }).sort({ date: -1 }).toArray());
    });

    app.post("/factory-orders/:id/pay-bag", protect, async (req, res) => {
      try {
        const order = await FactoryOrders.findOne({ _id: new ObjectId(req.params.id) });
        const { amount, fundId } = req.body;
        const fund = await Funds.findOne({ _id: new ObjectId(fundId) });
        await Funds.updateOne({ _id: fund._id }, { $inc: { balance: -Number(amount), totalOut: Number(amount) } });
        await FactoryOrders.updateOne({ _id: order._id }, { $inc: { bagPaidAmount: Number(amount), bagDue: -Number(amount) } });
        await FundTransactions.insertOne({ fundId: fund._id, fundName: fund.name, type: "bag_payment", direction: "out", amount: Number(amount), note: `Bag Due Payment — ${order.bagSupplier}`, date: new Date().toISOString().slice(0, 10), createdBy: req.user._id, createdAt: new Date() });
        res.status(200).send(await FactoryOrders.findOne({ _id: order._id }));
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    app.delete("/factory-orders/:id", protect, async (req, res) => res.status(400).send({ message: "Delete disabled" }));

    app.get("/factory-returns", protect, async (req, res) => res.status(200).send(await FactoryReturns.find({}).sort({ createdAt: -1 }).toArray()));

    app.post("/factory-returns", protect, async (req, res) => {
      try {
        const { orderId, productCompany, date, fundId, items } = req.body;
        const order = await FactoryOrders.findOne({ _id: new ObjectId(orderId) });
        const prodCompDoc = await getOrCreateCompany(productCompany);

        const normalizedItems = [];
        let totalBillAmount = 0, totalKgAll = 0, totalBagsUsed = 0;

        for (const item of items) {
          const product = await Products.findOne({ _id: new ObjectId(item.productId) });
          const actualBagSize = Number(item.totalKg) / Number(item.bagCount);
          const lineTotalBagCost = Number(item.bagCount) * (order.bagPrice || 0);
          normalizedItems.push({ productId: product._id, productName: product.name, bagCount: Number(item.bagCount), totalKg: Number(item.totalKg), amount: Number(item.amount), lineTotalBagCost, costPerKgWithoutBag: Number(item.amount) / Number(item.totalKg), costPerKgWithBag: (Number(item.amount) + lineTotalBagCost) / Number(item.totalKg), bagSize: actualBagSize });
          totalBillAmount += Number(item.amount); totalKgAll += Number(item.totalKg); totalBagsUsed += Number(item.bagCount);
        }

        const advanceUsed = Math.min(prodCompDoc.advanceBalance || 0, totalBillAmount);
        const remainingToPay = totalBillAmount - advanceUsed;

        let fund = null;
        if (remainingToPay > 0 && fundId) fund = await Funds.findOne({ _id: new ObjectId(fundId) });

        const newReturn = {
          orderId: order._id, bagCompany: order.bagSupplier, bagCompanyId: order.bagSupplierId, company: prodCompDoc.name, companyId: prodCompDoc._id,
          date, items: normalizedItems, totalBillAmount, advanceUsed, remainingPaid: remainingToPay, totalKg: totalKgAll, totalBagsUsed,
          fundId: fund ? fund._id : null, fundName: fund ? fund.name : null, createdBy: req.user._id, createdAt: new Date(),
        };
        const returnResult = await FactoryReturns.insertOne(newReturn);

        for (const item of normalizedItems) {
          await Stock.updateOne({ productId: item.productId, bagSize: item.bagSize }, { $inc: { currentKg: item.totalKg, fullBags: item.bagCount }, $set: { productName: item.productName, updatedAt: new Date(), lastReturnDate: date, costPerKgWithoutBag: item.costPerKgWithoutBag, costPerKgWithBag: item.costPerKgWithBag }, $setOnInsert: { createdAt: new Date(), bagSize: item.bagSize } }, { upsert: true });
        }

        await FactoryOrders.updateOne({ _id: order._id }, { $inc: { returnedBags: totalBagsUsed }, $set: { status: (order.returnedBags + totalBagsUsed) >= order.sentBags ? "completed" : "partial" } });

        if (advanceUsed > 0) await Companies.updateOne({ _id: prodCompDoc._id }, { $inc: { advanceBalance: -advanceUsed, totalBillPaid: advanceUsed } });
        if (remainingToPay > 0 && fund) {
          await Funds.updateOne({ _id: fund._id }, { $inc: { balance: -remainingToPay, totalOut: remainingToPay } });
          await Companies.updateOne({ _id: prodCompDoc._id }, { $inc: { totalBillPaid: remainingToPay } });
        }
        res.status(201).send(await FactoryReturns.findOne({ _id: returnResult.insertedId }));
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

    /* =========================================================
       Stock, Customers, Sales
    ========================================================= */
    app.get("/stock", protect, async (req, res) => {
      const stock = await Stock.find({}).toArray();
      const products = await Products.find({}).toArray();
      const productMap = {}; products.forEach((p) => (productMap[p._id.toString()] = p));
      const formatted = stock.map((s) => {
        const product = productMap[s.productId.toString()];
        return { ...s, productId: s.productId.toString(), bagSize: Number(s.bagSize) || Number(product?.bagSize) || 0, fullBags: Number(s.fullBags) || 0, brokenKg: s.currentKg || 0 };
      });
      res.status(200).send(formatted);
    });

    app.get("/customers", protect, async (req, res) => res.status(200).send(await Customers.find({}).sort({ name: 1 }).toArray()));
    app.post("/customers", protect, async (req, res) => {
      const { name, phone, address } = req.body;
      const result = await Customers.insertOne({ name: name.trim(), phone, address, totalBilled: 0, totalPaid: 0, totalDue: 0, createdAt: new Date() });
      res.status(201).send(await Customers.findOne({ _id: result.insertedId }));
    });
    
    app.get("/customers/:id/sales", protect, async (req, res) => {
      const customerId = new ObjectId(req.params.id);
      const sales = await Sales.find({ customerId }).sort({ date: -1 }).toArray();
      const payments = await FundTransactions.find({ customerId }).sort({ date: -1 }).toArray();
      res.status(200).send({ sales, payments });
    });

    app.post("/customers/:id/payment", protect, async (req, res) => {
      const customerId = new ObjectId(req.params.id);
      const amountNum = Number(req.body.amount);
      const customer = await Customers.findOne({ _id: customerId });
      let fund = null;
      if (req.body.fundId) fund = await Funds.findOne({ _id: new ObjectId(req.body.fundId) });
      await Customers.updateOne({ _id: customerId }, { $inc: { totalDue: -amountNum, totalPaid: amountNum } });
      if (fund) {
        await Funds.updateOne({ _id: fund._id }, { $inc: { balance: amountNum, totalIn: amountNum } });
        await FundTransactions.insertOne({ fundId: fund._id, fundName: fund.name, customerId, customerName: customer.name, type: "customer_payment", direction: "in", amount: amountNum, note: req.body.note || `Customer Payment`, date: req.body.date, createdBy: req.user._id, createdAt: new Date() });
      }
      res.status(200).send(await Customers.findOne({ _id: customerId }));
    });

    app.get("/sales", protect, async (req, res) => res.status(200).send(await Sales.find({}).sort({ date: -1, createdAt: -1 }).toArray()));
    
    app.post("/sales", protect, async (req, res) => {
      try {
        const { date, customerId, discount, paidAmount, items } = req.body;

        if (!customerId || !Array.isArray(items) || items.length === 0) {
          return res.status(400).send({ message: "Invalid data provided" });
        }

        const customer = await Customers.findOne({ _id: new ObjectId(customerId) });
        if (!customer) return res.status(404).send({ message: "Customer not found" });

        let totalBagCount = 0;
        let subtotalAll = 0;
        let costAll = 0;
        const saleLines = [];

        for (const item of items) {
          const product = await Products.findOne({ _id: new ObjectId(item.productId) });
          if (!product) return res.status(404).send({ message: "Product not found" });

          const count = Number(item.bagCount);
          const size = Number(item.bagSize);
          const rate = Number(item.ratePerBag);

          // Find exact stock entry based on product and bag size
          const stockEntry = await Stock.findOne({ 
            $or: [
              { productId: product._id, bagSize: size },
              { productId: product._id.toString(), bagSize: size }
            ] 
          });
          
          const availableBags = Number(stockEntry?.fullBags) || Math.floor((stockEntry?.currentKg || 0) / size) || 0;
          
          if (!stockEntry || availableBags < count) {
            return res.status(400).send({ message: `Insufficient stock for ${product.name} (${size}kg). Available: ${availableBags}` });
          }

          const lineSubtotal = count * rate;
          const costPerKg = Number(stockEntry.costPerKgWithBag) || (product.purchasePricePerKg || 0);
          
          saleLines.push({
            productId: product._id,
            productName: product.name,
            bagCount: count,
            bagSize: size,
            kg: count * size,
            ratePerBag: rate,
            subtotal: lineSubtotal,
            purchasePriceAtSale: costPerKg,
          });

          totalBagCount += count;
          subtotalAll += lineSubtotal;
          costAll += (count * size) * costPerKg;
        }

        const totalDiscount = Number(discount) || 0;
        const totalPaid = Number(paidAmount) || 0;
        const totalBill = subtotalAll - totalDiscount;

        if (totalBill < 0 || totalPaid > totalBill) {
          return res.status(400).send({ message: "Invalid discount or paid amount" });
        }

        const due = totalBill - totalPaid;
        
        // Find default cash fund to receive payment
        const cashFund = totalPaid > 0 ? await Funds.findOne({ name: "Cash in Hand" }) : null;

        const sale = {
          date: date || new Date().toISOString().slice(0, 10),
          customerId: customer._id,
          customerName: customer.name,
          items: saleLines,
          productName: saleLines.map(l => l.productName).join(", "),
          productId: saleLines[0].productId,
          bagCount: totalBagCount,
          bagSize: saleLines[0].bagSize,
          kg: saleLines.reduce((sum, line) => sum + line.kg, 0),
          ratePerBag: saleLines[0].ratePerBag,
          subtotal: subtotalAll,
          discount: totalDiscount,
          totalBill,
          paidAmount: totalPaid,
          due,
          totalProfit: totalBill - costAll,
          realizedProfit: totalBill > 0 ? (totalBill - costAll) * (totalPaid / totalBill) : 0,
          fundId: cashFund?._id || null,
          fundName: cashFund?.name || null,
          createdBy: req.user._id,
          createdAt: new Date(),
        };

        const result = await Sales.insertOne(sale);

        // Deduct Stock
        for (const line of saleLines) {
          await Stock.updateOne(
            { productId: line.productId, bagSize: line.bagSize },
            { $inc: { currentKg: -line.kg, fullBags: -line.bagCount }, $set: { updatedAt: new Date() } }
          );
        }

        // Add Due/Paid to Customer
        await Customers.updateOne(
          { _id: customer._id },
          { $inc: { totalBilled: totalBill, totalPaid: totalPaid, totalDue: due }, $set: { updatedAt: new Date() } }
        );

        // Add cash to Fund
        if (totalPaid > 0 && cashFund) {
          await Funds.updateOne(
            { _id: cashFund._id },
            { $inc: { balance: totalPaid, totalIn: totalPaid }, $set: { updatedAt: new Date() } }
          );
          await FundTransactions.insertOne({
            fundId: cashFund._id,
            fundName: cashFund.name,
            customerId: customer._id,
            customerName: customer.name,
            type: "sale_payment",
            direction: "in",
            amount: totalPaid,
            note: `Sale — ${customer.name}`,
            date: date || new Date().toISOString().slice(0, 10),
            createdBy: req.user._id,
            createdAt: new Date(),
          });
        }

        res.status(201).send(await Sales.findOne({ _id: result.insertedId }));
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.delete("/sales/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const sale = await Sales.findOne({ _id });
        if (!sale) return res.status(404).send({ message: "Sale not found" });

        for (const line of sale.items) {
            await Stock.updateOne(
              { productId: line.productId, bagSize: line.bagSize },
              { $inc: { currentKg: line.kg, fullBags: line.bagCount }, $set: { updatedAt: new Date() } }
            );
        }

        await Customers.updateOne(
          { _id: sale.customerId },
          { $inc: { totalBilled: -sale.totalBill, totalPaid: -sale.paidAmount, totalDue: -sale.due }, $set: { updatedAt: new Date() } }
        );

        if (sale.paidAmount > 0 && sale.fundId) {
          await Funds.updateOne(
            { _id: sale.fundId },
            { $inc: { balance: -sale.paidAmount, totalIn: -sale.paidAmount }, $set: { updatedAt: new Date() } }
          );
          await FundTransactions.insertOne({
            fundId: sale.fundId, fundName: sale.fundName, type: "sale_reversed", direction: "out", amount: sale.paidAmount, note: `Sale Cancelled — ${sale.customerName}`, date: new Date().toISOString().slice(0, 10), createdBy: req.user._id, createdAt: new Date()
          });
        }

        await Sales.deleteOne({ _id });
        res.status(200).send({ message: "Sale deleted and reversed" });
      } catch (err) { res.status(500).send({ message: "Server error" }); }
    });

   /* =========================================================
        
========================================================= */

app.get("/dashboard-summary", protect, async (req, res) => {
  try {
    const { from, to, all } = req.query;

    // ---- Decide date range (only applies to date-based collections) ----
    let fromDate = from;
    let toDate = to;
    let noDateFilter = all === "true";

    if (!noDateFilter && (!fromDate || !toDate)) {
      const now = new Date();
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    }
    const dateFilter = noDateFilter ? {} : { date: { $gte: fromDate, $lte: toDate } };

    const [sales, expenses, purchases, funds, customers, stock, allOrders, companies] = await Promise.all([
      Sales.find(dateFilter).toArray(),
      Expenses.find(dateFilter).toArray(),
      FactoryReturns.find(dateFilter).toArray(), // = actual product purchase bills in this period
      Funds.find({}).sort({ createdAt: 1 }).toArray(),
      Customers.find({}).toArray(),
      Stock.find({}).toArray(),
      FactoryOrders.find({}).toArray(), // bag pipeline is a running snapshot, always all-time
      Companies.find({}).toArray(),
    ]);

    /* ---------------- Sales roll-up (date-filtered) ---------------- */
    let totalRevenue = 0, totalDiscount = 0, totalPaid = 0, totalDueGenerated = 0;
    let totalBagsSold = 0, totalKgSold = 0, grossProfit = 0;
    const productMap = {};
    const dailyMap = {}; // date-sortable trend data

    sales.forEach((sale) => {
      totalRevenue += sale.totalBill || 0;
      totalDiscount += sale.discount || 0;
      totalPaid += sale.paidAmount || 0;
      totalDueGenerated += sale.due || 0;
      grossProfit += sale.totalProfit || 0;

      if (!dailyMap[sale.date]) dailyMap[sale.date] = { date: sale.date, revenue: 0, profit: 0, expense: 0, purchase: 0 };
      dailyMap[sale.date].revenue += sale.totalBill || 0;
      dailyMap[sale.date].profit += sale.totalProfit || 0;

      (sale.items || []).forEach((item) => {
        const key = item.productId.toString();
        if (!productMap[key]) {
          productMap[key] = { productId: key, productName: item.productName, bags: 0, kg: 0, revenue: 0, cost: 0 };
        }
        const cost = (item.kg || 0) * (item.purchasePriceAtSale || 0);
        productMap[key].bags += item.bagCount || 0;
        productMap[key].kg += item.kg || 0;
        productMap[key].revenue += item.subtotal || 0;
        productMap[key].cost += cost;
        totalBagsSold += item.bagCount || 0;
        totalKgSold += item.kg || 0;
      });
    });

    /* ---------------- Expense roll-up (date-filtered) ---------------- */
    let totalExpenseAmount = 0;
    const expenseByTitle = {};
    expenses.forEach((e) => {
      totalExpenseAmount += e.amount || 0;
      if (!dailyMap[e.date]) dailyMap[e.date] = { date: e.date, revenue: 0, profit: 0, expense: 0, purchase: 0 };
      dailyMap[e.date].expense += e.amount || 0;
      const key = e.title;
      if (!expenseByTitle[key]) expenseByTitle[key] = { title: key, amount: 0 };
      expenseByTitle[key].amount += e.amount || 0;
    });

    /* ---------------- Purchase roll-up (date-filtered) ----------------
       "কত টাকার প্রোডাক্ট কিনলাম" = FactoryReturns বিল, কারণ এটাই আসল
       raw-material purchase যা Stock এ যোগ হয়। ---------------------- */
    let totalPurchaseAmount = 0, totalPurchaseKg = 0, totalPurchaseBags = 0;
    purchases.forEach((p) => {
      totalPurchaseAmount += p.totalBillAmount || 0;
      totalPurchaseKg += p.totalKg || 0;
      totalPurchaseBags += p.totalBagsUsed || 0;
      if (!dailyMap[p.date]) dailyMap[p.date] = { date: p.date, revenue: 0, profit: 0, expense: 0, purchase: 0 };
      dailyMap[p.date].purchase += p.totalBillAmount || 0;
    });

    const netProfit = grossProfit - totalExpenseAmount;

    const productBreakdownRaw = Object.values(productMap).map((p) => ({
      ...p,
      profit: p.revenue - p.cost,
      status: p.revenue - p.cost >= 0 ? "profit" : "loss",
    }));
    const productByProfit = [...productBreakdownRaw].sort((a, b) => b.profit - a.profit);
    const topSellingProducts = [...productBreakdownRaw].sort((a, b) => b.kg - a.kg);

    // Date-sortable trend — always sorted ascending by date
    const dailyChart = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    /* ---------------- Snapshot tables (NOT date-based, sorted by value) ---------------- */

    // Funds
    const fundTable = funds.map((f) => ({
      id: f._id, name: f.name, type: f.type, balance: f.balance || 0, totalIn: f.totalIn || 0, totalOut: f.totalOut || 0,
    }));
    const totalFundBalance = fundTable.reduce((s, f) => s + f.balance, 0);

    // Customers who owe money — sorted by due amount, highest first
    const customerDues = customers
      .filter((c) => (c.totalDue || 0) > 0)
      .map((c) => ({ id: c._id, name: c.name, phone: c.phone || "", totalBilled: c.totalBilled || 0, totalPaid: c.totalPaid || 0, totalDue: c.totalDue || 0 }))
      .sort((a, b) => b.totalDue - a.totalDue);
    const totalCustomerDue = customerDues.reduce((s, c) => s + c.totalDue, 0);

    // Suppliers (bag companies) we still owe money to — sorted by due, highest first
    const supplierDueMap = {};
    allOrders.filter((o) => (o.bagDue || 0) > 0).forEach((o) => {
      const key = (o.bagSupplierId || o.bagSupplier)?.toString();
      if (!key) return;
      if (!supplierDueMap[key]) supplierDueMap[key] = { id: o.bagSupplierId, name: o.bagSupplier, totalDue: 0 };
      supplierDueMap[key].totalDue += o.bagDue || 0;
    });
    const companyById = {};
    companies.forEach((c) => (companyById[c._id.toString()] = c));
    const supplierDues = Object.values(supplierDueMap)
      .map((s) => ({
        ...s,
        phone: companyById[s.id?.toString()]?.phone || "",
        advanceBalance: companyById[s.id?.toString()]?.advanceBalance || 0,
      }))
      .sort((a, b) => b.totalDue - a.totalDue);
    const totalSupplierDue = supplierDues.reduce((s, c) => s + c.totalDue, 0);
    const totalCompanyAdvance = companies.reduce((s, c) => s + (c.advanceBalance || 0), 0);

    // Bag pipeline — ordered vs sent vs returned vs pending (always all-time snapshot)
    let totalOrderedBags = 0, totalSentBags = 0, totalReturnedBags = 0, pendingBagValue = 0;
    const statusCount = { pending: 0, partial: 0, completed: 0 };
    allOrders.forEach((o) => {
      totalOrderedBags += o.bagCount || 0;
      totalSentBags += o.sentBags || 0;
      totalReturnedBags += o.returnedBags || 0;
      pendingBagValue += o.bagDue || 0;
      if (statusCount[o.status] !== undefined) statusCount[o.status] += 1;
    });
    const bagPipeline = {
      totalOrders: allOrders.length,
      totalOrderedBags, totalSentBags, totalReturnedBags,
      pendingToSend: totalOrderedBags - totalSentBags,
      pendingToReturn: totalSentBags - totalReturnedBags,
      pendingBagValue,
      statusCount,
    };

    const totalStockKg = stock.reduce((s, st) => s + (st.currentKg || 0), 0);

    res.status(200).send({
      range: { from: fromDate || null, to: toDate || null, all: noDateFilter },
      totals: {
        totalRevenue, totalDiscount, totalPaid, totalDueGenerated,
        grossProfit, totalExpense: totalExpenseAmount, netProfit,
        totalBagsSold, totalKgSold, salesCount: sales.length, expenseCount: expenses.length,
        totalPurchaseAmount, totalPurchaseKg, totalPurchaseBags, purchaseCount: purchases.length,
      },
      overall: { totalFundBalance, totalCustomerDue, totalStockKg, totalSupplierDue, totalCompanyAdvance },
      funds: fundTable,
      customerDues,
      supplierDues,
      bagPipeline,
      productBreakdown: productByProfit,   // sorted by profit (desc)
      topSellingProducts,                  // sorted by qty (desc)
      dailyChart,                          // sorted by date (asc)
      expenseByTitle: Object.values(expenseByTitle).sort((a, b) => b.amount - a.amount),
    });
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

    /* =========================================================
       Root Route & Server Listen
    ========================================================= */
    app.get("/", (req, res) => res.send("Server is running..."));

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) { console.error("❌ MongoDB connection failed:", err.message); }
}

run().catch((err) => { console.error("❌ Fatal error:", err.message); process.exit(1); });