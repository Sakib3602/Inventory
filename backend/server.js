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
    origin: process.env.CLIENT_URL, // wildcard "*" দিলে cookie কাজ করবে না
    credentials: true, // cookie পাঠানো/গ্রহণ করার জন্য must
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ================= JWT helper ================= */
function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

/* ================= Cookie options ================= */
const cookieOptions = {
  httpOnly: true, // JS দিয়ে access করা যাবে না (XSS protection)
  secure: process.env.NODE_ENV === "production", // production এ শুধু HTTPS এ পাঠাবে
  sameSite: "lax", // localhost dev এর জন্য "lax" ঠিক আছে
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 din
};

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected successfully");

    const db = client.db(dbName);

         const Customers = db.collection("Customers");
         const Sales = db.collection("Sales");
    

    /* =========================================================
       সব Collection — এক জায়গায় গুছিয়ে ঘোষণা (এখানেই একবার)
    ========================================================= */
    const AllUser = db.collection("AllUser");
    const Products = db.collection("Products");
    const Categories = db.collection("Categories");
    const Stock = db.collection("Stock");
    const Funds = db.collection("Funds");
    const FundTransactions = db.collection("FundTransactions");
    const FactoryOrders = db.collection("FactoryOrders");
    const FactoryReturns = db.collection("FactoryReturns"); // আগে এটা মিসিং ছিল, এটাই 500 error এর মূল কারণ
    const Companies = db.collection("Companies");

    /* ================= REGISTER ================= */
    app.post("/register", async (req, res) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).send({ message: "Email ও Password দিন" });
        }

        const existingUser = await AllUser.findOne({ email });
        if (existingUser) {
          return res.status(400).send({ message: "এই email দিয়ে আগে থেকেই account আছে" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const result = await AllUser.insertOne({
          email,
          password: hashedPassword,
          isActive: false,
          createdAt: new Date(),
        });

        const token = generateToken(result.insertedId);

        res.cookie("token", token, cookieOptions);

        res.status(201).send({
          _id: result.insertedId,
          email,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* ================= LOGIN ================= */
    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).send({ message: "Email ও Password দিন" });
        }

        const user = await AllUser.findOne({ email });
        if (!user) {
          return res.status(401).send({ message: "ভুল Email অথবা Password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).send({ message: "ভুল Email অথবা Password" });
        }

        if (!user.isActive) {
          return res.status(403).send({ message: "আপনার account বর্তমানে inactive, Admin এর সাথে যোগাযোগ করুন" });
        }

        const token = generateToken(user._id);
        res.cookie("token", token, cookieOptions);

        res.status(200).send({
          _id: user._id,
          email: user.email,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* ================= LOGOUT ================= */
    app.post("/logout", (req, res) => {
      res.clearCookie("token", cookieOptions);
      res.status(200).send({ message: "Logged out successfully" });
    });

    /* ================= Protect middleware ================= */
    async function protect(req, res, next) {
      try {
        const token = req.cookies.token;

        if (!token) {
          return res.status(401).send({ message: "No token, login করুন" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await AllUser.findOne(
          { _id: new ObjectId(decoded.id) },
          { projection: { password: 0 } }
        );

        if (!user) {
          return res.status(401).send({ message: "User not found" });
        }

        if (!user.isActive) {
          res.clearCookie("token", cookieOptions);
          return res.status(403).send({ message: "আপনার account inactive করা হয়েছে" });
        }

        req.user = user;
        next();
      } catch (err) {
        return res.status(401).send({ message: "Token invalid or expired" });
      }
    }

    /* ================= Get current user ================= */
    app.get("/me", protect, (req, res) => {
      res.send(req.user);
    });

    /* =========================================================
       PRODUCTS (Feed Master)
    ========================================================= */

    async function generateProductCode() {
      const count = await Products.countDocuments();
      return `PRD-${String(count + 1).padStart(4, "0")}`;
    }

    app.get("/products", protect, async (req, res) => {
      try {
        const { search = "", category = "", status = "" } = req.query;
        const query = {};

        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { code: { $regex: search, $options: "i" } },
            { brand: { $regex: search, $options: "i" } },
          ];
        }
        if (category) query.category = category;
        if (status) query.status = status;

        const products = await Products.find(query).sort({ createdAt: -1 }).toArray();
        res.status(200).send(products);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.get("/products/:id", protect, async (req, res) => {
      try {
        const product = await Products.findOne({ _id: new ObjectId(req.params.id) });
        if (!product) return res.status(404).send({ message: "Product পাওয়া যায়নি" });
        res.status(200).send(product);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.post("/products", protect, async (req, res) => {
      try {
        const { name, category, brand, salePricePerKg, status } = req.body;

        if (!name || !category) {
          return res.status(400).send({ message: "Name, Category আবশ্যক" });
        }

        const existing = await Products.findOne({ name: name.trim(), category });
        if (existing) {
          return res.status(400).send({ message: "এই নামে এই Category-তে item আগে থেকেই আছে" });
        }

        const code = await generateProductCode();

        const newProduct = {
          name: name.trim(),
          category,
          brand: brand?.trim() || "",
          purchasePricePerKg: 0,
          totalPurchasedKg: 0,
          totalPurchasedAmount: 0,
          salePricePerKg: Number(salePricePerKg) || 0,
          code,
          status: status || "active",
          createdBy: req.user._id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await Products.insertOne(newProduct);
        res.status(201).send({ ...newProduct, _id: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.patch("/products/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const updates = { ...req.body, updatedAt: new Date() };

        delete updates._id;
        delete updates.code;
        delete updates.createdAt;
        delete updates.createdBy;
        delete updates.purchasePricePerKg;
        delete updates.totalPurchasedKg;
        delete updates.totalPurchasedAmount;

        if (updates.salePricePerKg !== undefined) {
          updates.salePricePerKg = Number(updates.salePricePerKg) || 0;
        }

        const existing = await Products.findOne({ _id });
        if (!existing) return res.status(404).send({ message: "Product পাওয়া যায়নি" });

        await Products.updateOne({ _id }, { $set: updates });
        const updated = await Products.findOne({ _id });
        res.status(200).send(updated);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.delete("/products/:id", protect, async (req, res) => {
      try {
        const result = await Products.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Product পাওয়া যায়নি" });
        }
        res.status(200).send({ message: "Product delete হয়েছে" });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    app.get("/categories", protect, async (req, res) => {
      try {
        const categories = await Categories.find({}).sort({ name: 1 }).toArray();
        res.status(200).send(categories);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.post("/categories", protect, async (req, res) => {
      try {
        const { name } = req.body;
        if (!name || !name.trim()) {
          return res.status(400).send({ message: "Category নাম দাও" });
        }

        const trimmed = name.trim();
        const existing = await Categories.findOne({
          name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" },
        });
        if (existing) {
          return res.status(400).send({ message: "এই Category আগে থেকেই আছে" });
        }

        const newCategory = {
          name: trimmed,
          createdBy: req.user._id,
          createdAt: new Date(),
        };

        const result = await Categories.insertOne(newCategory);
        res.status(201).send({ ...newCategory, _id: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.delete("/categories/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const category = await Categories.findOne({ _id });
        if (!category) return res.status(404).send({ message: "Category পাওয়া যায়নি" });

        const inUse = await Products.findOne({ category: category.name });
        if (inUse) {
          return res.status(400).send({ message: "এই Category-তে Product আছে, আগে সেগুলো সরাও" });
        }

        await Categories.deleteOne({ _id });
        res.status(200).send({ message: "Category delete হয়েছে" });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* =========================================================
       FUNDS — ensure default funds + CRUD + deposit + transactions
    ========================================================= */

    async function ensureDefaultFunds() {
      const defaults = [
        { name: "Cash in Hand", type: "default", deletable: false },
        { name: "Bank", type: "default", deletable: true },
        { name: "Profit Fund", type: "profit", deletable: false },
      ];
      for (const f of defaults) {
        const exists = await Funds.findOne({ name: f.name });
        if (!exists) {
          await Funds.insertOne({
            ...f,
            balance: 0,
            totalIn: 0,
            totalOut: 0,
            createdAt: new Date(),
          });
        }
      }
    }
    await ensureDefaultFunds();

    app.get("/funds", protect, async (req, res) => {
      try {
        const funds = await Funds.find({}).sort({ createdAt: 1 }).toArray();
        res.status(200).send(funds);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.post("/funds", protect, async (req, res) => {
      try {
        const { name } = req.body;
        if (!name || !name.trim()) {
          return res.status(400).send({ message: "Fund নাম দাও" });
        }

        const trimmed = name.trim();
        const existing = await Funds.findOne({ name: { $regex: `^${trimmed}$`, $options: "i" } });
        if (existing) {
          return res.status(400).send({ message: "এই নামে Fund আগে থেকেই আছে" });
        }

        const newFund = {
          name: trimmed,
          type: "custom",
          deletable: true,
          balance: 0,
          totalIn: 0,
          totalOut: 0,
          createdBy: req.user._id,
          createdAt: new Date(),
        };

        const result = await Funds.insertOne(newFund);
        res.status(201).send({ ...newFund, _id: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.post("/funds/:id/deposit", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const { amount, note, date } = req.body;

        const amountNum = Number(amount);
        if (!amountNum || amountNum <= 0) {
          return res.status(400).send({ message: "সঠিক Amount দাও" });
        }

        const fund = await Funds.findOne({ _id });
        if (!fund) return res.status(404).send({ message: "Fund পাওয়া যায়নি" });

        if (fund.type === "profit") {
          return res.status(400).send({ message: "Profit Fund এ সরাসরি Deposit করা যায় না, এটা auto আপডেট হয়" });
        }

        await Funds.updateOne(
          { _id },
          {
            $inc: { balance: amountNum, totalIn: amountNum },
            $set: { updatedAt: new Date() },
          }
        );

        await FundTransactions.insertOne({
          fundId: _id,
          fundName: fund.name,
          type: "deposit",
          direction: "in",
          amount: amountNum,
          note: note?.trim() || "Manual Deposit",
          date: date || new Date().toISOString().slice(0, 10),
          createdBy: req.user._id,
          createdAt: new Date(),
        });

        const updated = await Funds.findOne({ _id });
        res.status(200).send(updated);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.delete("/funds/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const fund = await Funds.findOne({ _id });
        if (!fund) return res.status(404).send({ message: "Fund পাওয়া যায়নি" });

        if (!fund.deletable) {
          return res.status(400).send({ message: "এই Fund Delete করা যাবে না" });
        }
        if (fund.balance !== 0) {
          return res.status(400).send({ message: "Fund এ এখনো টাকা আছে, আগে balance 0 করো" });
        }

        await Funds.deleteOne({ _id });
        res.status(200).send({ message: "Fund Delete হয়েছে" });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.get("/fund-transactions", protect, async (req, res) => {
      try {
        const { fundId } = req.query;
        const query = {};
        if (fundId) query.fundId = new ObjectId(fundId);

        const transactions = await FundTransactions.find(query).sort({ createdAt: -1 }).toArray();
        res.status(200).send(transactions);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* =========================================================
       COMPANY helper (Factory Advance tracking)
    ========================================================= */

    async function getOrCreateCompany(name) {
      const trimmed = name.trim();
      let company = await Companies.findOne({ name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" } });
      if (!company) {
        const result = await Companies.insertOne({
          name: trimmed,
          advanceBalance: 0,
          totalAdvanceGiven: 0,
          totalBillPaid: 0,
          createdAt: new Date(),
        });
        company = await Companies.findOne({ _id: result.insertedId });
      }
      return company;
    }

    /* =========================================================
       FACTORY ORDER (পরিকল্পনা — বসতা সংখ্যা + kg/বসতা + optional Advance)
    ========================================================= */

    app.get("/factory-orders", protect, async (req, res) => {
      try {
        const orders = await FactoryOrders.find({}).sort({ date: -1, createdAt: -1 }).toArray();
        res.status(200).send(orders);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.post("/factory-orders", protect, async (req, res) => {
      try {
        const { company, date, bagCount, weightPerBag, advanceAmount, fundId } = req.body;

        if (!company || !date || !bagCount || !weightPerBag) {
          return res.status(400).send({ message: "সব ফিল্ড পূরণ করো" });
        }

        const bagCountNum = Number(bagCount);
        const weightPerBagNum = Number(weightPerBag);
        if (bagCountNum <= 0 || weightPerBagNum <= 0) {
          return res.status(400).send({ message: "সংখ্যা ০ এর বেশি হতে হবে" });
        }

        const expectedTotalKg = bagCountNum * weightPerBagNum;
        const advanceNum = Number(advanceAmount) || 0;

        let fund = null;
        if (advanceNum > 0) {
          if (!fundId) return res.status(400).send({ message: "Advance দিলে Fund Source বেছে নাও" });
          fund = await Funds.findOne({ _id: new ObjectId(fundId) });
          if (!fund) return res.status(404).send({ message: "Fund পাওয়া যায়নি" });
          if (fund.balance < advanceNum) {
            return res.status(400).send({
              message: `${fund.name} এ যথেষ্ট টাকা নেই। বর্তমান Balance: ৳${fund.balance.toLocaleString()}`,
            });
          }
        }

        const companyDoc = await getOrCreateCompany(company);

        const newOrder = {
          company: companyDoc.name,
          companyId: companyDoc._id,
          date,
          bagCount: bagCountNum,
          weightPerBag: weightPerBagNum,
          expectedTotalKg,
          returnedBags: 0,
          status: "pending", // pending | partial | completed
          advanceAmount: advanceNum,
          advanceFundId: fund ? fund._id : null,
          advanceFundName: fund ? fund.name : null,
          createdBy: req.user._id,
          createdAt: new Date(),
        };

        const result = await FactoryOrders.insertOne(newOrder);

        if (advanceNum > 0 && fund) {
          await Funds.updateOne(
            { _id: fund._id },
            { $inc: { balance: -advanceNum, totalOut: advanceNum }, $set: { updatedAt: new Date() } }
          );

          await Companies.updateOne(
            { _id: companyDoc._id },
            { $inc: { advanceBalance: advanceNum, totalAdvanceGiven: advanceNum }, $set: { updatedAt: new Date() } }
          );

          await FundTransactions.insertOne({
            fundId: fund._id,
            fundName: fund.name,
            type: "factory_advance",
            direction: "out",
            amount: advanceNum,
            note: `Advance — ${companyDoc.name}`,
            date,
            createdBy: req.user._id,
            createdAt: new Date(),
          });
        }

        const saved = await FactoryOrders.findOne({ _id: result.insertedId });
        res.status(201).send(saved);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.delete("/factory-orders/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const order = await FactoryOrders.findOne({ _id });
        if (!order) return res.status(404).send({ message: "Order পাওয়া যায়নি" });

        if (order.returnedBags > 0) {
          return res.status(400).send({ message: "এই Order-এ ইতিমধ্যে Return এসেছে, Delete করা যাবে না" });
        }

        if (order.advanceAmount > 0) {
          await Funds.updateOne(
            { _id: order.advanceFundId },
            { $inc: { balance: order.advanceAmount, totalOut: -order.advanceAmount }, $set: { updatedAt: new Date() } }
          );
          await Companies.updateOne(
            { _id: order.companyId },
            {
              $inc: { advanceBalance: -order.advanceAmount, totalAdvanceGiven: -order.advanceAmount },
              $set: { updatedAt: new Date() },
            }
          );
          await FundTransactions.insertOne({
            fundId: order.advanceFundId,
            fundName: order.advanceFundName,
            type: "factory_advance_reversed",
            direction: "in",
            amount: order.advanceAmount,
            note: `Order বাতিল (Advance ফেরত) — ${order.company}`,
            date: new Date().toISOString().slice(0, 10),
            createdBy: req.user._id,
            createdAt: new Date(),
          });
        }

        await FactoryOrders.deleteOne({ _id });
        res.status(200).send({ message: "Order delete হয়েছে" });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* =========================================================
       FACTORY RETURN (আসল বিল + Advance auto adjust)
    ========================================================= */

    app.get("/factory-returns", protect, async (req, res) => {
      try {
        const { orderId } = req.query;
        const query = {};
        if (orderId) query.orderId = new ObjectId(orderId);
        const returns = await FactoryReturns.find(query).sort({ createdAt: -1 }).toArray();
        res.status(200).send(returns);
      } catch (err) {
        console.error("factory-returns GET error:", err);
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.post("/factory-returns", protect, async (req, res) => {
      try {
        const { orderId, date, fundId, items } = req.body;

        if (!orderId || !date) {
          return res.status(400).send({ message: "Order ও Date আবশ্যক" });
        }
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).send({ message: "অন্তত একটা Product line যোগ করো" });
        }

        const order = await FactoryOrders.findOne({ _id: new ObjectId(orderId) });
        if (!order) return res.status(404).send({ message: "Order পাওয়া যায়নি" });

        const pendingBags = order.bagCount - order.returnedBags;

        const normalizedItems = [];
        let totalBillAmount = 0;
        let totalKgAll = 0;
        let totalBagsUsed = 0;

        for (const item of items) {
          const { productId, bagCount, totalKg, amount } = item;

          if (!productId || !bagCount || !totalKg || !amount) {
            return res.status(400).send({ message: "প্রতিটা Product line এ সব ফিল্ড পূরণ করো" });
          }

          const bagCountNum = Number(bagCount);
          const totalKgNum = Number(totalKg);
          const amountNum = Number(amount);

          if (bagCountNum <= 0 || totalKgNum <= 0 || amountNum <= 0) {
            return res.status(400).send({ message: "সংখ্যা গুলো সঠিক দাও" });
          }

          const product = await Products.findOne({ _id: new ObjectId(productId) });
          if (!product) return res.status(404).send({ message: "Product পাওয়া যায়নি" });

          const costPerKg = amountNum / totalKgNum;

          normalizedItems.push({
            productId: product._id,
            productName: product.name,
            bagCount: bagCountNum,
            totalKg: totalKgNum,
            amount: amountNum,
            costPerKg,
          });

          totalBillAmount += amountNum;
          totalKgAll += totalKgNum;
          totalBagsUsed += bagCountNum;
        }

        if (totalBagsUsed > pendingBags) {
          return res.status(400).send({
            message: `এই Order-এ মাত্র ${pendingBags}টা বসতা বাকি আছে, তুমি ${totalBagsUsed}টার হিসাব দিয়েছো`,
          });
        }

        const companyDoc = await Companies.findOne({ _id: order.companyId });
        const availableAdvance = companyDoc?.advanceBalance || 0;
        const advanceUsed = Math.min(availableAdvance, totalBillAmount);
        const remainingToPay = totalBillAmount - advanceUsed;

        let fund = null;
        if (remainingToPay > 0) {
          if (!fundId) return res.status(400).send({ message: "বাকি টাকার জন্য Fund Source বেছে নাও" });
          fund = await Funds.findOne({ _id: new ObjectId(fundId) });
          if (!fund) return res.status(404).send({ message: "Fund পাওয়া যায়নি" });
          if (fund.balance < remainingToPay) {
            return res.status(400).send({
              message: `${fund.name} এ যথেষ্ট টাকা নেই। বর্তমান Balance: ৳${fund.balance.toLocaleString()}`,
            });
          }
        }

        const newReturn = {
          orderId: order._id,
          company: order.company,
          companyId: order.companyId,
          date,
          items: normalizedItems,
          totalBillAmount,
          advanceUsed,
          remainingPaid: remainingToPay,
          totalKg: totalKgAll,
          totalBagsUsed,
          fundId: fund ? fund._id : null,
          fundName: fund ? fund.name : null,
          createdBy: req.user._id,
          createdAt: new Date(),
        };
        const returnResult = await FactoryReturns.insertOne(newReturn);

        for (const item of normalizedItems) {
          const product = await Products.findOne({ _id: item.productId });
          const prevKg = product.totalPurchasedKg || 0;
          const prevAmount = product.totalPurchasedAmount || 0;

          const newTotalKg = prevKg + item.totalKg;
          const newTotalAmount = prevAmount + item.amount;
          const newAvgCost = newTotalAmount / newTotalKg;

          await Products.updateOne(
            { _id: item.productId },
            {
              $set: {
                purchasePricePerKg: newAvgCost,
                totalPurchasedKg: newTotalKg,
                totalPurchasedAmount: newTotalAmount,
                updatedAt: new Date(),
              },
            }
          );

          await Stock.updateOne(
            { productId: item.productId },
            {
              $inc: { currentKg: item.totalKg },
              $set: { productName: item.productName, updatedAt: new Date() },
              $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
          );
        }

        const newReturnedBags = order.returnedBags + totalBagsUsed;
        const newStatus =
          newReturnedBags >= order.bagCount ? "completed" : newReturnedBags > 0 ? "partial" : "pending";
        await FactoryOrders.updateOne(
          { _id: order._id },
          { $set: { returnedBags: newReturnedBags, status: newStatus, updatedAt: new Date() } }
        );

        if (advanceUsed > 0) {
          await Companies.updateOne(
            { _id: order.companyId },
            { $inc: { advanceBalance: -advanceUsed, totalBillPaid: advanceUsed }, $set: { updatedAt: new Date() } }
          );
        }

        if (remainingToPay > 0 && fund) {
          await Funds.updateOne(
            { _id: fund._id },
            { $inc: { balance: -remainingToPay, totalOut: remainingToPay }, $set: { updatedAt: new Date() } }
          );
          await Companies.updateOne(
            { _id: order.companyId },
            { $inc: { totalBillPaid: remainingToPay }, $set: { updatedAt: new Date() } }
          );
          await FundTransactions.insertOne({
            fundId: fund._id,
            fundName: fund.name,
            type: "factory_return_payment",
            direction: "out",
            amount: remainingToPay,
            note: `Feed Payment (Advance বাদে) — ${order.company}`,
            date,
            createdBy: req.user._id,
            createdAt: new Date(),
          });
        }

        const savedReturn = await FactoryReturns.findOne({ _id: returnResult.insertedId });
        res.status(201).send(savedReturn);
      } catch (err) {
        console.error("factory-returns POST error:", err);
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* ================= DELETE factory return (সব উল্টে দেওয়া) ================= */
    app.delete("/factory-returns/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const ret = await FactoryReturns.findOne({ _id });
        if (!ret) return res.status(404).send({ message: "Return পাওয়া যায়নি" });

        for (const item of ret.items) {
          await Stock.updateOne(
            { productId: item.productId },
            { $inc: { currentKg: -item.totalKg }, $set: { updatedAt: new Date() } }
          );

          const product = await Products.findOne({ _id: item.productId });
          if (product) {
            const newTotalKg = Math.max(0, (product.totalPurchasedKg || 0) - item.totalKg);
            const newTotalAmount = Math.max(0, (product.totalPurchasedAmount || 0) - item.amount);
            const newAvgCost = newTotalKg > 0 ? newTotalAmount / newTotalKg : 0;

            await Products.updateOne(
              { _id: item.productId },
              {
                $set: {
                  purchasePricePerKg: newAvgCost,
                  totalPurchasedKg: newTotalKg,
                  totalPurchasedAmount: newTotalAmount,
                  updatedAt: new Date(),
                },
              }
            );
          }
        }

        const order = await FactoryOrders.findOne({ _id: ret.orderId });
        if (order) {
          const newReturnedBags = Math.max(0, order.returnedBags - ret.totalBagsUsed);
          const newStatus =
            newReturnedBags >= order.bagCount ? "completed" : newReturnedBags > 0 ? "partial" : "pending";
          await FactoryOrders.updateOne(
            { _id: order._id },
            { $set: { returnedBags: newReturnedBags, status: newStatus, updatedAt: new Date() } }
          );
        }

        // Advance ব্যবহার হয়ে থাকলে company balance ফেরত দাও
        if (ret.advanceUsed > 0) {
          await Companies.updateOne(
            { _id: ret.companyId },
            { $inc: { advanceBalance: ret.advanceUsed, totalBillPaid: -ret.advanceUsed }, $set: { updatedAt: new Date() } }
          );
        }

        // Fund থেকে যেই remaining টাকা কাটা হয়েছিল সেটা ফেরত দাও
        if (ret.remainingPaid > 0 && ret.fundId) {
          await Funds.updateOne(
            { _id: ret.fundId },
            { $inc: { balance: ret.remainingPaid, totalOut: -ret.remainingPaid }, $set: { updatedAt: new Date() } }
          );
          await Companies.updateOne(
            { _id: ret.companyId },
            { $inc: { totalBillPaid: -ret.remainingPaid }, $set: { updatedAt: new Date() } }
          );
          await FundTransactions.insertOne({
            fundId: ret.fundId,
            fundName: ret.fundName,
            type: "factory_return_reversed",
            direction: "in",
            amount: ret.remainingPaid,
            note: `Return বাতিল — ${ret.company}`,
            date: new Date().toISOString().slice(0, 10),
            createdBy: req.user._id,
            createdAt: new Date(),
          });
        }

        await FactoryReturns.deleteOne({ _id });
        res.status(200).send({ message: "Return delete হয়েছে ও সব হিসাব ফেরত নেওয়া হয়েছে" });
      } catch (err) {
        console.error("factory-returns DELETE error:", err);
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* =========================================================
       COMPANY LEDGER (Factory Advance tracking)
    ========================================================= */

    app.get("/companies", protect, async (req, res) => {
      try {
        const companies = await Companies.find({}).sort({ name: 1 }).toArray();
        res.status(200).send(companies);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.get("/companies/:id/history", protect, async (req, res) => {
      try {
        const companyId = new ObjectId(req.params.id);
        const orders = await FactoryOrders.find({ companyId }).sort({ date: -1 }).toArray();
        const returns = await FactoryReturns.find({ companyId }).sort({ date: -1 }).toArray();
        res.status(200).send({ orders, returns });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });


    /* =========================================================
   STOCK (view only — Factory Return থেকে বাড়ে, Sale থেকে কমবে)
========================================================= */

app.get("/stock", protect, async (req, res) => {
  try {
    const stock = await Stock.find({}).toArray();
    // Mongo _id ObjectId কে string করে পাঠাচ্ছি যাতে frontend এ productId মিলাতে সুবিধা হয়
    const formatted = stock.map((s) => ({
      ...s,
      productId: s.productId.toString(),
    }));
    res.status(200).send(formatted);
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});


/* =========================================================================
   এই ফাইলের কোড তোমার backend/server.js এ যোগ করতে হবে।

   কোথায় বসাবে:
   1) collection ঘোষণার জায়গায় (যেখানে AllUser, Products, Stock... আছে)
      এই দুইটা লাইন যোগ করো:
         const Customers = db.collection("Customers");
         const Sales = db.collection("Sales");

   2) "/products" POST route এ bagSize যোগ করো (নিচে ধাপ ২ দেখো)

   3) পুরনো "/stock" GET route টা DELETE করে এই ফাইলের নতুন "/stock" route
      দিয়ে REPLACE করো (broken bag / bhanga bosta হিসাব যোগ হয়েছে)

   4) এই ফাইলের CUSTOMERS ও SALES এর পুরো ব্লক server.js এ, "/stock" route এর
      কাছাকাছি বা company routes এর পরে বসিয়ে দাও।
========================================================================= */


/* =========================================================================
   ধাপ ১ — Collections (run() এর ভিতরে, বাকি collection গুলোর সাথে)
========================================================================= */
// const Customers = db.collection("Customers");
// const Sales = db.collection("Sales");


/* =========================================================================
   ধাপ ২ — Product এ bagSize (kg/বস্তা) যোগ করা
   তোমার বর্তমান POST /products route টা replace করো এটা দিয়ে:
========================================================================= */

app.post("/products", protect, async (req, res) => {
  try {
    const { name, category, brand, salePricePerKg, bagSize, status } = req.body;

    if (!name || !category) {
      return res.status(400).send({ message: "Name, Category আবশ্যক" });
    }

    const existing = await Products.findOne({ name: name.trim(), category });
    if (existing) {
      return res.status(400).send({ message: "এই নামে এই Category-তে item আগে থেকেই আছে" });
    }

    const code = await generateProductCode();

    const newProduct = {
      name: name.trim(),
      category,
      brand: brand?.trim() || "",
      purchasePricePerKg: 0,
      totalPurchasedKg: 0,
      totalPurchasedAmount: 0,
      salePricePerKg: Number(salePricePerKg) || 0,
      bagSize: Number(bagSize) || 0, // এক বস্তায় কত kg — broken bag হিসাবের জন্য দরকার
      code,
      status: status || "active",
      createdBy: req.user._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await Products.insertOne(newProduct);
    res.status(201).send({ ...newProduct, _id: result.insertedId });
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

// PATCH /products/:id তোমার আগের মতোই থাকবে, বদলানোর দরকার নেই —
// bagSize এমনিতেই req.body থেকে চলে যাবে কারণ ওখানে generic spread আছে।


/* =========================================================================
   ধাপ ৩ — পুরনো "/stock" GET route DELETE করে এটা বসাও
   (fullBags + brokenKg / ভাঙা বস্তা হিসাব সহ)
========================================================================= */

app.get("/stock", protect, async (req, res) => {
  try {
    const stock = await Stock.find({}).toArray();
    const products = await Products.find({}).toArray();

    const productMap = {};
    products.forEach((p) => (productMap[p._id.toString()] = p));

    const formatted = stock.map((s) => {
      const pid = s.productId.toString();
      const product = productMap[pid];
      const bagSize = Number(product?.bagSize) || 0;
      const currentKg = s.currentKg || 0;

      let fullBags = 0;
      let brokenKg = currentKg;

      if (bagSize > 0) {
        fullBags = Math.floor(currentKg / bagSize);
        brokenKg = Math.round((currentKg - fullBags * bagSize) * 100) / 100;
      }

      return {
        ...s,
        productId: pid,
        bagSize,
        fullBags, // পুরো বস্তা কয়টা আছে
        brokenKg, // ভাঙা বস্তার loose kg কত আছে
      };
    });

    res.status(200).send(formatted);
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});


/* =========================================================================
   ধাপ ৪ — CUSTOMERS (দোকান/গ্রাহক ledger)
========================================================================= */

/* =========================================================
   CUSTOMERS (দোকান) — Sale ও Dokan Ledger দুই জায়গাতেই লাগবে
========================================================= */

app.get("/customers", protect, async (req, res) => {
  try {
    const customers = await Customers.find({}).sort({ name: 1 }).toArray();
    res.status(200).send(customers);
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

app.post("/customers", protect, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).send({ message: "দোকানের নাম দাও" });
    }

    const trimmed = name.trim();
    const existing = await Customers.findOne({ name: { $regex: `^${trimmed}$`, $options: "i" } });
    if (existing) {
      return res.status(400).send({ message: "এই নামে দোকান আগে থেকেই আছে" });
    }

    const newCustomer = {
      name: trimmed,
      phone: phone?.trim() || "",
      due: 0,
      createdBy: req.user._id,
      createdAt: new Date(),
    };

    const result = await Customers.insertOne(newCustomer);
    res.status(201).send({ ...newCustomer, _id: result.insertedId });
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

/* =========================================================
   STOCK (view only)
========================================================= */

app.get("/stock", protect, async (req, res) => {
  try {
    const stock = await Stock.find({}).toArray();
    const formatted = stock.map((s) => ({
      ...s,
      productId: s.productId.toString(),
    }));
    res.status(200).send(formatted);
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

/* =========================================================
   SALES (বিক্রি + Profit/Loss + Fund + Customer Due)
========================================================= */

app.get("/sales", protect, async (req, res) => {
  try {
    const sales = await Sales.find({}).sort({ date: -1, createdAt: -1 }).toArray();
    res.status(200).send(sales);
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

app.post("/sales", protect, async (req, res) => {
  try {
    const { date, customerId, productId, kg, rate, paidAmount, fundId } = req.body;

    if (!date || !customerId || !productId || !kg || !rate) {
      return res.status(400).send({ message: "সব ফিল্ড পূরণ করো" });
    }

    const kgNum = Number(kg);
    const rateNum = Number(rate);
    const paidNum = Number(paidAmount) || 0;

    if (kgNum <= 0 || rateNum <= 0) {
      return res.status(400).send({ message: "kg ও rate ০ এর বেশি হতে হবে" });
    }

    const customer = await Customers.findOne({ _id: new ObjectId(customerId) });
    if (!customer) return res.status(404).send({ message: "Customer পাওয়া যায়নি" });

    const product = await Products.findOne({ _id: new ObjectId(productId) });
    if (!product) return res.status(404).send({ message: "Product পাওয়া যায়নি" });

    const stockEntry = await Stock.findOne({ productId: product._id });
    const currentKg = stockEntry?.currentKg || 0;
    if (currentKg < kgNum) {
      return res.status(400).send({
        message: `Stock এ যথেষ্ট kg নেই। বর্তমানে আছে: ${currentKg}kg`,
      });
    }

    const totalBill = kgNum * rateNum;
    const due = totalBill - paidNum;
    if (due < 0) {
      return res.status(400).send({ message: "Paid Amount, মোট বিলের চেয়ে বেশি হতে পারবে না" });
    }

    const purchasePrice = product.purchasePricePerKg || 0;
    const totalProfit = (rateNum - purchasePrice) * kgNum; // পুরো বিলের profit/loss (accrual)

    // Paid Amount দিলে Fund লাগবে
    let fund = null;
    if (paidNum > 0) {
      if (!fundId) return res.status(400).send({ message: "Paid Amount দিলে Fund Source বেছে নাও" });
      fund = await Funds.findOne({ _id: new ObjectId(fundId) });
      if (!fund) return res.status(404).send({ message: "Fund পাওয়া যায়নি" });
    }

    // শুধু আসলে হাতে আসা টাকার proportion অনুযায়ী profit realize হবে (Profit Fund এ)
    const paidRatio = totalBill > 0 ? paidNum / totalBill : 0;
    const realizedProfit = totalProfit * paidRatio;

    const newSale = {
      date,
      customerId: customer._id,
      customerName: customer.name,
      productId: product._id,
      productName: product.name,
      kg: kgNum,
      rate: rateNum,
      purchasePriceAtSale: purchasePrice,
      totalBill,
      paidAmount: paidNum,
      due,
      totalProfit, // পুরো বিলের হিসাবে profit/loss (accrual — Profit & Loss report এ কাজে লাগবে)
      realizedProfit, // শুধু cash আসা অংশের profit (Profit Fund এ যোগ হবে)
      fundId: fund ? fund._id : null,
      fundName: fund ? fund.name : null,
      createdBy: req.user._id,
      createdAt: new Date(),
    };

    const result = await Sales.insertOne(newSale);

    // Stock কমাও
    await Stock.updateOne(
      { productId: product._id },
      { $inc: { currentKg: -kgNum }, $set: { updatedAt: new Date() } }
    );

    // Customer due বাড়াও
    if (due > 0) {
      await Customers.updateOne(
        { _id: customer._id },
        { $inc: { due: due }, $set: { updatedAt: new Date() } }
      );
    }

    // Paid Amount থাকলে সেই Fund এ জমা করো
    if (paidNum > 0 && fund) {
      await Funds.updateOne(
        { _id: fund._id },
        { $inc: { balance: paidNum, totalIn: paidNum }, $set: { updatedAt: new Date() } }
      );

      await FundTransactions.insertOne({
        fundId: fund._id,
        fundName: fund.name,
        type: "sale_payment",
        direction: "in",
        amount: paidNum,
        note: `Sale — ${customer.name} (${product.name})`,
        date,
        createdBy: req.user._id,
        createdAt: new Date(),
      });
    }

    // Realized profit থাকলে Profit Fund এ যোগ করো (হিসাবি, Cash in Hand এর সাথে sync)
    if (realizedProfit !== 0) {
      const profitFund = await Funds.findOne({ type: "profit" });
      if (profitFund) {
        await Funds.updateOne(
          { _id: profitFund._id },
          {
            $inc: {
              balance: realizedProfit,
              totalIn: realizedProfit > 0 ? realizedProfit : 0,
              totalOut: realizedProfit < 0 ? -realizedProfit : 0,
            },
            $set: { updatedAt: new Date() },
          }
        );
      }
    }

    const savedSale = await Sales.findOne({ _id: result.insertedId });
    res.status(201).send(savedSale);
  } catch (err) {
    console.error("sales POST error:", err);
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

/* ================= DELETE sale (সব উল্টে দেওয়া) ================= */
app.delete("/sales/:id", protect, async (req, res) => {
  try {
    const _id = new ObjectId(req.params.id);
    const sale = await Sales.findOne({ _id });
    if (!sale) return res.status(404).send({ message: "Sale পাওয়া যায়নি" });

    // Stock ফেরত দাও
    await Stock.updateOne(
      { productId: sale.productId },
      { $inc: { currentKg: sale.kg }, $set: { updatedAt: new Date() } }
    );

    // Customer due ফেরত নাও
    if (sale.due > 0) {
      await Customers.updateOne(
        { _id: sale.customerId },
        { $inc: { due: -sale.due }, $set: { updatedAt: new Date() } }
      );
    }

    // Fund থেকে paid amount ফেরত নাও
    if (sale.paidAmount > 0 && sale.fundId) {
      await Funds.updateOne(
        { _id: sale.fundId },
        { $inc: { balance: -sale.paidAmount, totalIn: -sale.paidAmount }, $set: { updatedAt: new Date() } }
      );

      await FundTransactions.insertOne({
        fundId: sale.fundId,
        fundName: sale.fundName,
        type: "sale_reversed",
        direction: "out",
        amount: sale.paidAmount,
        note: `Sale বাতিল — ${sale.customerName}`,
        date: new Date().toISOString().slice(0, 10),
        createdBy: req.user._id,
        createdAt: new Date(),
      });
    }

    // Profit Fund থেকে realized profit ফেরত নাও
    if (sale.realizedProfit !== 0) {
      const profitFund = await Funds.findOne({ type: "profit" });
      if (profitFund) {
        await Funds.updateOne(
          { _id: profitFund._id },
          { $inc: { balance: -sale.realizedProfit }, $set: { updatedAt: new Date() } }
        );
      }
    }

    await Sales.deleteOne({ _id });
    res.status(200).send({ message: "Sale delete হয়েছে ও সব হিসাব ফেরত নেওয়া হয়েছে" });
  } catch (err) {
    console.error("sales DELETE error:", err);
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

    /* ================= Root route ================= */
    app.get("/", (req, res) => {
      res.send("Server is running...");
    });

    /* ================= Start server ================= */
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
  }
}

run().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});