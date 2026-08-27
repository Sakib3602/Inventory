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

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected successfully");

    const db = client.db(dbName);

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

    /* ================= REGISTER ================= */
    app.post("/register", async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).send({ message: "Email ও Password দিন" });

        const existingUser = await AllUser.findOne({ email });
        if (existingUser) return res.status(400).send({ message: "এই email দিয়ে আগে থেকেই account আছে" });

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
        res.status(201).send({ _id: result.insertedId, email });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* ================= LOGIN ================= */
    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).send({ message: "Email ও Password দিন" });

        const user = await AllUser.findOne({ email });
        if (!user) return res.status(401).send({ message: "ভুল Email অথবা Password" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).send({ message: "ভুল Email অথবা Password" });

        if (!user.isActive) {
          return res.status(403).send({ message: "আপনার account বর্তমানে inactive, Admin এর সাথে যোগাযোগ করুন" });
        }

        const token = generateToken(user._id);
        res.cookie("token", token, cookieOptions);
        res.status(200).send({ _id: user._id, email: user.email });
      } catch (err) {
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
        if (!token) return res.status(401).send({ message: "No token, login করুন" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await AllUser.findOne(
          { _id: new ObjectId(decoded.id) },
          { projection: { password: 0 } }
        );
        if (!user) return res.status(401).send({ message: "User not found" });

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

    app.get("/me", protect, (req, res) => res.send(req.user));

    /* ================= DASHBOARD STATS ================= */
    app.get("/dashboard-stats", protect, async (req, res) => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const sales = await Sales.find({}).toArray();
        const funds = await Funds.find({}).toArray();
        const customers = await Customers.find({}).toArray();
        const stock = await Stock.find({}).toArray();
        const orders = await FactoryOrders.find({}).toArray();

        const totalSalesAmount = sales.reduce((sum, s) => sum + (s.totalBill || 0), 0);
        const todaySalesAmount = sales.filter(s => s.date === today).reduce((sum, s) => sum + (s.totalBill || 0), 0);
        const totalProfit = sales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
        const totalDue = customers.reduce((sum, c) => sum + (c.totalDue || 0), 0);
        const totalFundBalance = funds.reduce((sum, f) => sum + (f.balance || 0), 0);
        
        const pendingOrdersCount = orders.filter(o => o.status !== "completed").length;
        const totalStockKg = stock.reduce((sum, s) => sum + (s.currentKg || 0), 0);

        res.status(200).send({
          totalSalesAmount,
          todaySalesAmount,
          totalProfit,
          totalDue,
          totalFundBalance,
          pendingOrdersCount,
          totalStockKg
        });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* ================= PRODUCTS ================= */
    async function generateProductCode() {
      const count = await Products.countDocuments();
      return `PRD-${String(count + 1).padStart(4, "0")}`;
    }

    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/products/:id/purchase-history", protect, async (req, res) => {
      try {
        const productId = new ObjectId(req.params.id);
        const returns = await FactoryReturns.find({ "items.productId": productId }).sort({ date: -1 }).toArray();
        const batches = [];
        returns.forEach((r) => {
          r.items.forEach((it) => {
            if (it.productId.toString() === req.params.id) {
              batches.push({
                date: r.date,
                company: r.company,
                bagCount: it.bagCount,
                totalKg: it.totalKg,
                amount: it.amount,
                costPerKgWithoutBag: it.costPerKgWithoutBag,
                costPerKgWithBag: it.costPerKgWithBag,
                bagSize: it.bagSize
              });
            }
          });
        });
        res.status(200).send(batches);
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/products", protect, async (req, res) => {
      try {
        const { name, category, brand, bagSize, salePricePerBag, salePrices, status } = req.body;
        if (!name || !category) return res.status(400).send({ message: "Name, Category আবশ্যক" });

        const existing = await Products.findOne({ name: name.trim(), category });
        if (existing) return res.status(400).send({ message: "এই নামে item আগে থেকেই আছে" });

        const code = await generateProductCode();

        const newProduct = {
          name: name.trim(),
          category,
          brand: brand?.trim() || "",
          bagSize: Number(bagSize) || 0,
          salePricePerBag: Number(salePricePerBag) || 0,
          salePrices: Array.isArray(salePrices) ? salePrices.map((p) => ({ bagSize: Number(p.bagSize) || 0, salePrice: Number(p.salePrice) || 0 })).filter((p) => p.bagSize > 0 && p.salePrice > 0) : [],
          purchasePricePerKg: 0, 
          totalPurchasedKg: 0,
          totalPurchasedAmount: 0,
          code,
          status: status || "active",
          createdBy: req.user._id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await Products.insertOne(newProduct);
        res.status(201).send({ ...newProduct, _id: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    app.patch("/products/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const updates = { ...req.body, updatedAt: new Date() };

        delete updates._id; delete updates.code; delete updates.createdAt; delete updates.createdBy;
        delete updates.purchasePricePerKg; delete updates.totalPurchasedKg; delete updates.totalPurchasedAmount;

        if (updates.salePrices !== undefined) {
          updates.salePrices = Array.isArray(updates.salePrices) ? updates.salePrices.map((p) => ({ bagSize: Number(p.bagSize) || 0, salePrice: Number(p.salePrice) || 0 })).filter((p) => p.bagSize > 0 && p.salePrice > 0) : [];
        }

        await Products.updateOne({ _id }, { $set: updates });
        res.status(200).send(await Products.findOne({ _id }));
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/products/:id", protect, async (req, res) => {
      try {
        const result = await Products.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).send({ message: "Product পাওয়া যায়নি" });
        res.status(200).send({ message: "Product delete হয়েছে" });
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    /* ================= CATEGORIES ================= */
    app.get("/categories", protect, async (req, res) => {
      res.status(200).send(await Categories.find({}).sort({ name: 1 }).toArray());
    });

    app.post("/categories", protect, async (req, res) => {
      try {
        const trimmed = req.body.name?.trim();
        if (!trimmed) return res.status(400).send({ message: "Category নাম দাও" });
        const existing = await Categories.findOne({ name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" } });
        if (existing) return res.status(400).send({ message: "এই Category আগে থেকেই আছে" });

        const newCategory = { name: trimmed, createdBy: req.user._id, createdAt: new Date() };
        const result = await Categories.insertOne(newCategory);
        res.status(201).send({ ...newCategory, _id: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/categories/:id", protect, async (req, res) => {
      try {
        const category = await Categories.findOne({ _id: new ObjectId(req.params.id) });
        if (await Products.findOne({ category: category?.name })) return res.status(400).send({ message: "এই Category-তে Product আছে" });
        await Categories.deleteOne({ _id: new ObjectId(req.params.id) });
        res.status(200).send({ message: "Category delete হয়েছে" });
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    /* ================= FUNDS ================= */
    async function ensureDefaultFunds() {
      const defaults = [
        { name: "Cash in Hand", type: "default", deletable: false },
        { name: "Bank", type: "default", deletable: true },
        { name: "Profit Fund", type: "profit", deletable: false },
      ];
      for (const f of defaults) {
        if (!(await Funds.findOne({ name: f.name }))) await Funds.insertOne({ ...f, balance: 0, totalIn: 0, totalOut: 0, createdAt: new Date() });
      }
    }
    await ensureDefaultFunds();

    app.get("/funds", protect, async (req, res) => res.status(200).send(await Funds.find({}).sort({ createdAt: 1 }).toArray()));

    app.post("/funds", protect, async (req, res) => {
      try {
        const trimmed = req.body.name?.trim();
        if (!trimmed) return res.status(400).send({ message: "Fund নাম দাও" });
        if (await Funds.findOne({ name: { $regex: `^${trimmed}$`, $options: "i" } })) return res.status(400).send({ message: "Fund আগে থেকেই আছে" });
        const newFund = { name: trimmed, type: "custom", deletable: true, balance: 0, totalIn: 0, totalOut: 0, createdBy: req.user._id, createdAt: new Date() };
        const result = await Funds.insertOne(newFund);
        res.status(201).send({ ...newFund, _id: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/funds/:id/deposit", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const { amount, note, date } = req.body;
        const amountNum = Number(amount);
        if (!amountNum || amountNum <= 0) return res.status(400).send({ message: "সঠিক Amount দাও" });

        const fund = await Funds.findOne({ _id });
        if (fund?.type === "profit") return res.status(400).send({ message: "Profit Fund এ Deposit করা যায় না" });

        await Funds.updateOne({ _id }, { $inc: { balance: amountNum, totalIn: amountNum }, $set: { updatedAt: new Date() } });
        await FundTransactions.insertOne({ fundId: _id, fundName: fund.name, type: "deposit", direction: "in", amount: amountNum, note: note?.trim() || "Manual Deposit", date: date || new Date().toISOString().slice(0, 10), createdBy: req.user._id, createdAt: new Date() });
        res.status(200).send(await Funds.findOne({ _id }));
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/fund-transactions", protect, async (req, res) => {
      const query = req.query.fundId ? { fundId: new ObjectId(req.query.fundId) } : {};
      res.status(200).send(await FundTransactions.find(query).sort({ createdAt: -1 }).toArray());
    });

    /* ================= COMPANY HELPER ================= */
    async function getOrCreateCompany(name) {
      const trimmed = name.trim();
      let company = await Companies.findOne({ name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" } });
      if (!company) {
        const result = await Companies.insertOne({ name: trimmed, advanceBalance: 0, totalAdvanceGiven: 0, totalBillPaid: 0, createdAt: new Date() });
        company = await Companies.findOne({ _id: result.insertedId });
      }
      return company;
    }

    /* ================= FACTORY ORDERS (With Bag Cost) ================= */
    app.get("/factory-orders", protect, async (req, res) => {
      res.status(200).send(await FactoryOrders.find({}).sort({ date: -1, createdAt: -1 }).toArray());
    });

    app.post("/factory-orders", protect, async (req, res) => {
      try {
        const { company, date, bagCount, weightPerBag, bagPrice, bagPaidAmount, advanceAmount, fundId } = req.body;
        if (!company || !date || !bagCount || !weightPerBag) return res.status(400).send({ message: "সব ফিল্ড পূরণ করো" });

        const bagCountNum = Number(bagCount);
        const weightPerBagNum = Number(weightPerBag);
        const bagPriceNum = Number(bagPrice) || 0;
        const totalBagPrice = bagCountNum * bagPriceNum;
        const bagPaidNum = Number(bagPaidAmount) || 0;
        const bagDue = totalBagPrice - bagPaidNum;
        const advanceNum = Number(advanceAmount) || 0;
        const totalToDeduct = advanceNum + bagPaidNum;

        let fund = null;
        if (totalToDeduct > 0) {
          if (!fundId) return res.status(400).send({ message: "টাকা পেমেন্ট করতে Fund Source বেছে নাও" });
          fund = await Funds.findOne({ _id: new ObjectId(fundId) });
          if (fund.balance < totalToDeduct) return res.status(400).send({ message: "Fund এ যথেষ্ট টাকা নেই" });
        }

        const companyDoc = await getOrCreateCompany(company);

        const newOrder = {
          company: companyDoc.name,
          companyId: companyDoc._id,
          date,
          bagCount: bagCountNum,
          weightPerBag: weightPerBagNum,
          expectedTotalKg: bagCountNum * weightPerBagNum,
          bagPrice: bagPriceNum,
          totalBagPrice,
          bagPaidAmount: bagPaidNum,
          bagDue,
          returnedBags: 0,
          status: "pending",
          advanceAmount: advanceNum,
          advanceFundId: fund ? fund._id : null,
          advanceFundName: fund ? fund.name : null,
          createdBy: req.user._id,
          createdAt: new Date(),
        };

        const result = await FactoryOrders.insertOne(newOrder);

        if (totalToDeduct > 0 && fund) {
          await Funds.updateOne({ _id: fund._id }, { $inc: { balance: -totalToDeduct, totalOut: totalToDeduct }, $set: { updatedAt: new Date() } });
          
          if (advanceNum > 0) {
            await Companies.updateOne({ _id: companyDoc._id }, { $inc: { advanceBalance: advanceNum, totalAdvanceGiven: advanceNum } });
            await FundTransactions.insertOne({ fundId: fund._id, fundName: fund.name, type: "factory_advance", direction: "out", amount: advanceNum, note: `Advance — ${companyDoc.name}`, date, createdBy: req.user._id, createdAt: new Date() });
          }
          if (bagPaidNum > 0) {
            await FundTransactions.insertOne({ fundId: fund._id, fundName: fund.name, type: "bag_payment", direction: "out", amount: bagPaidNum, note: `Bag Payment — ${companyDoc.name} (${bagCountNum} bags)`, date, createdBy: req.user._id, createdAt: new Date() });
          }
        }

        res.status(201).send(await FactoryOrders.findOne({ _id: result.insertedId }));
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.post("/factory-orders/:id/pay-bag", protect, async (req, res) => {
      try {
        const order = await FactoryOrders.findOne({ _id: new ObjectId(req.params.id) });
        if (!order) return res.status(404).send({ message: "Order not found" });

        const { amount, fundId, date } = req.body;
        const amountNum = Number(amount);
        if (amountNum <= 0 || amountNum > order.bagDue) return res.status(400).send({ message: "Amount সঠিক নয়" });

        const fund = await Funds.findOne({ _id: new ObjectId(fundId) });
        if (!fund || fund.balance < amountNum) return res.status(400).send({ message: "Fund এ যথেষ্ট টাকা নেই" });

        await Funds.updateOne({ _id: fund._id }, { $inc: { balance: -amountNum, totalOut: amountNum } });
        await FactoryOrders.updateOne(
          { _id: order._id },
          { $inc: { bagPaidAmount: amountNum, bagDue: -amountNum } }
        );

        await FundTransactions.insertOne({
          fundId: fund._id,
          fundName: fund.name,
          type: "bag_payment",
          direction: "out",
          amount: amountNum,
          note: `Bag Due Payment — ${order.company}`,
          date: date || new Date().toISOString().slice(0, 10),
          createdBy: req.user._id,
          createdAt: new Date(),
        });

        res.status(200).send(await FactoryOrders.findOne({ _id: order._id }));
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/factory-orders/:id", protect, async (req, res) => {
      try {
        const order = await FactoryOrders.findOne({ _id: new ObjectId(req.params.id) });
        if (order.returnedBags > 0) return res.status(400).send({ message: "ইতিমধ্যে Return এসেছে, Delete করা যাবে না" });

        if (order.advanceAmount > 0) {
          await Funds.updateOne({ _id: order.advanceFundId }, { $inc: { balance: order.advanceAmount, totalOut: -order.advanceAmount } });
          await Companies.updateOne({ _id: order.companyId }, { $inc: { advanceBalance: -order.advanceAmount, totalAdvanceGiven: -order.advanceAmount } });
        }
        
        if (order.bagPaidAmount > 0) {
          await Funds.updateOne({ _id: order.advanceFundId }, { $inc: { balance: order.bagPaidAmount, totalOut: -order.bagPaidAmount } });
        }

        await FactoryOrders.deleteOne({ _id: order._id });
        res.status(200).send({ message: "Order delete হয়েছে" });
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    /* ================= FACTORY RETURN (Calculates With/Without Bag Cost) ================= */
    app.get("/factory-returns", protect, async (req, res) => {
      res.status(200).send(await FactoryReturns.find({}).sort({ createdAt: -1 }).toArray());
    });

    app.post("/factory-returns", protect, async (req, res) => {
      try {
        const { orderId, date, fundId, items } = req.body;
        const order = await FactoryOrders.findOne({ _id: new ObjectId(orderId) });
        if (!order) return res.status(404).send({ message: "Order পাওয়া যায়নি" });

        const normalizedItems = [];
        let totalBillAmount = 0, totalKgAll = 0, totalBagsUsed = 0;

        for (const item of items) {
          const { productId, bagCount, totalKg, amount } = item;
          const bagCountNum = Number(bagCount);
          const totalKgNum = Number(totalKg);
          const amountNum = Number(amount); // This is PRODUCT cost only from frontend
          const product = await Products.findOne({ _id: new ObjectId(productId) });

          const actualBagSize = totalKgNum / bagCountNum;
          
          // Cost Logic
          const bagPriceFromOrder = order.bagPrice || 0;
          const lineTotalBagCost = bagCountNum * bagPriceFromOrder;
          
          const costPerKgWithoutBag = amountNum / totalKgNum;
          const costPerKgWithBag = (amountNum + lineTotalBagCost) / totalKgNum;

          normalizedItems.push({
            productId: product._id,
            productName: product.name,
            bagCount: bagCountNum,
            totalKg: totalKgNum,
            amount: amountNum, 
            lineTotalBagCost,
            costPerKgWithoutBag,
            costPerKgWithBag,
            bagSize: actualBagSize,
          });

          totalBillAmount += amountNum;
          totalKgAll += totalKgNum;
          totalBagsUsed += bagCountNum;
        }

        const companyDoc = await Companies.findOne({ _id: order.companyId });
        const advanceUsed = Math.min(companyDoc?.advanceBalance || 0, totalBillAmount);
        const remainingToPay = totalBillAmount - advanceUsed;

        let fund = null;
        if (remainingToPay > 0 && fundId) {
          fund = await Funds.findOne({ _id: new ObjectId(fundId) });
          if (fund.balance < remainingToPay) return res.status(400).send({ message: "Fund এ টাকা নেই" });
        }

        const newReturn = {
          orderId: order._id, company: order.company, companyId: order.companyId, date, items: normalizedItems,
          totalBillAmount, advanceUsed, remainingPaid: remainingToPay, totalKg: totalKgAll, totalBagsUsed,
          fundId: fund ? fund._id : null, fundName: fund ? fund.name : null, createdBy: req.user._id, createdAt: new Date(),
        };
        const returnResult = await FactoryReturns.insertOne(newReturn);

        for (const item of normalizedItems) {
          await Stock.updateOne(
            { productId: item.productId, bagSize: item.bagSize },
            { 
              $inc: { currentKg: item.totalKg, fullBags: item.bagCount }, 
              $set: { productName: item.productName, updatedAt: new Date(), lastReturnDate: date, costPerKgWithoutBag: item.costPerKgWithoutBag, costPerKgWithBag: item.costPerKgWithBag }, 
              $setOnInsert: { createdAt: new Date(), bagSize: item.bagSize } 
            },
            { upsert: true }
          );
        }

        await FactoryOrders.updateOne(
          { _id: order._id },
          { $inc: { returnedBags: totalBagsUsed }, $set: { status: (order.returnedBags + totalBagsUsed) >= order.bagCount ? "completed" : "partial" } }
        );

        if (advanceUsed > 0) await Companies.updateOne({ _id: order.companyId }, { $inc: { advanceBalance: -advanceUsed, totalBillPaid: advanceUsed } });
        if (remainingToPay > 0 && fund) {
          await Funds.updateOne({ _id: fund._id }, { $inc: { balance: -remainingToPay, totalOut: remainingToPay } });
          await Companies.updateOne({ _id: order.companyId }, { $inc: { totalBillPaid: remainingToPay } });
        }

        res.status(201).send(await FactoryReturns.findOne({ _id: returnResult.insertedId }));
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/factory-returns/:id", protect, async (req, res) => {
      res.status(200).send({ message: "Return Delete Option Disabled to protect data consistency. Contact Admin." });
    });

    /* ================= COMPANY LEDGER ================= */
   /* ================= COMPANY LEDGER ================= */
    app.get("/companies", protect, async (req, res) => {
      try {
        const companies = await Companies.find({}).sort({ name: 1 }).toArray();
        const orders = await FactoryOrders.find({ bagDue: { $gt: 0 } }).toArray();
        
        // ডাইনামিক ভাবে প্রতিটি কোম্পানির মোট বকেয়া (Due) বের করা
        const companiesWithDue = companies.map(c => {
          const cOrders = orders.filter(o => o.companyId?.toString() === c._id.toString() || o.company === c.name);
          const totalDue = cOrders.reduce((sum, o) => sum + (o.bagDue || 0), 0);
          return { ...c, totalDue };
        });

        res.status(200).send(companiesWithDue);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.post("/companies/:id/pay", protect, async (req, res) => {
      try {
        const companyId = new ObjectId(req.params.id);
        const { amount, fundId, note, date } = req.body;

        const amountNum = Number(amount);
        if (!amountNum || amountNum <= 0) return res.status(400).send({ message: "সঠিক Amount দিন" });

        const fund = await Funds.findOne({ _id: new ObjectId(fundId) });
        if (!fund || fund.balance < amountNum) return res.status(400).send({ message: "Fund এ যথেষ্ট টাকা নেই" });

        const company = await Companies.findOne({ _id: companyId });
        if (!company) return res.status(404).send({ message: "Company পাওয়া যায়নি" });

        // ফান্ড থেকে টাকা কাটা
        await Funds.updateOne(
          { _id: fund._id },
          { $inc: { balance: -amountNum, totalOut: amountNum }, $set: { updatedAt: new Date() } }
        );

        let remainingAmount = amountNum;

        // বকেয়া (bagDue) পরিশোধ করা
        const pendingOrders = await FactoryOrders.find({ 
            $or: [{ companyId: companyId }, { company: company.name }], 
            bagDue: { $gt: 0 } 
        }).sort({ date: 1 }).toArray();

        for (const order of pendingOrders) {
            if (remainingAmount <= 0) break;
            const payForThisOrder = Math.min(order.bagDue, remainingAmount);
            await FactoryOrders.updateOne(
                { _id: order._id },
                { $inc: { bagPaidAmount: payForThisOrder, bagDue: -payForThisOrder } }
            );
            remainingAmount -= payForThisOrder;
        }

        // যদি আরও টাকা বাঁচে, সেটা Advance হিসেবে জমা হবে
        if (remainingAmount > 0) {
            await Companies.updateOne(
                { _id: companyId },
                { $inc: { advanceBalance: remainingAmount, totalAdvanceGiven: remainingAmount }, $set: { updatedAt: new Date() } }
            );
        }

        // ট্রানজেকশন রেকর্ড
        await FundTransactions.insertOne({
          fundId: fund._id,
          fundName: fund.name,
          type: "factory_payment",
          direction: "out",
          amount: amountNum,
          note: note?.trim() || `Payment to ${company.name}`,
          date: date || new Date().toISOString().slice(0, 10),
          createdBy: req.user._id,
          createdAt: new Date(),
        });

        res.status(200).send({ message: "Payment successful" });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.get("/companies/:id/history", protect, async (req, res) => {
      try {
        const companyId = new ObjectId(req.params.id);
        const company = await Companies.findOne({ _id: companyId });
        const orders = await FactoryOrders.find({ companyId }).sort({ date: -1 }).toArray();
        const returns = await FactoryReturns.find({ companyId }).sort({ date: -1 }).toArray();
        
        const directPayments = await FundTransactions.find({ 
          type: "factory_payment", 
          note: { $regex: company.name, $options: "i" } 
        }).sort({ date: -1 }).toArray();

        const productMap = {};
        
        returns.forEach((ret) => {
          const totalPaidForReturn = (ret.advanceUsed || 0) + (ret.remainingPaid || 0);
          const totalBillForReturn = ret.totalBillAmount || 1; 
          const paidRatio = totalPaidForReturn / totalBillForReturn;

          ret.items.forEach((item) => {
            const key = item.productId.toString();
            if (!productMap[key]) productMap[key] = { productId: key, productName: item.productName, totalKg: 0, totalBags: 0, totalBill: 0, paid: 0 };
            
            productMap[key].totalKg += item.totalKg || 0;
            productMap[key].totalBags += item.bagCount || 0;
            productMap[key].totalBill += item.amount || 0;
            productMap[key].paid += (item.amount || 0) * paidRatio;
          });
        });
        
        const productBreakdown = Object.values(productMap).map((item) => ({ ...item, payable: item.totalBill - item.paid }));
        res.status(200).send({ orders, returns, directPayments, productBreakdown });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });
    /* ================= STOCK, CUSTOMERS, SALES (Unchanged basic ops for brevity) ================= */
    app.get("/stock", protect, async (req, res) => {
      const stock = await Stock.find({}).toArray();
      const products = await Products.find({}).toArray();
      const productMap = {}; products.forEach((p) => (productMap[p._id.toString()] = p));
      const formatted = stock.map((s) => {
        const product = productMap[s.productId.toString()];
        const bagSize = Number(s.bagSize) || Number(product?.bagSize) || 0;
        let fullBags = Number(s.fullBags) || 0;
        let brokenKg = s.currentKg || 0;
        if (bagSize > 0 && !s.fullBags) {
          fullBags = Math.floor(s.currentKg / bagSize);
          brokenKg = Math.round((s.currentKg - fullBags * bagSize) * 100) / 100;
        }
        return { ...s, bagSize, fullBags, brokenKg };
      });
      res.status(200).send(formatted);
    });

    app.get("/customers", protect, async (req, res) => {
      const customers = await Customers.find({}).sort({ name: 1 }).toArray();
      res.status(200).send(customers);
    });

    app.post("/customers", protect, async (req, res) => {
      const { name, phone, address } = req.body;
      const result = await Customers.insertOne({ name: name.trim(), phone, address, totalBilled: 0, totalPaid: 0, totalDue: 0, createdAt: new Date() });
      res.status(201).send(await Customers.findOne({ _id: result.insertedId }));
    });

    /* ================= CUSTOMERS (দোকান) ================= */
    app.get("/customers", protect, async (req, res) => {
      try {
        const { search = "" } = req.query;
        const query = {};
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } },
          ];
        }
        const customers = await Customers.find(query).sort({ name: 1 }).toArray();
        res.status(200).send(customers);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.post("/customers", protect, async (req, res) => {
      try {
        const { name, phone, address } = req.body;
        if (!name || !name.trim()) return res.status(400).send({ message: "দোকানের নাম দাও" });

        const trimmed = name.trim();
        function escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
        const existing = await Customers.findOne({ name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" } });
        if (existing) return res.status(400).send({ message: "এই নামে দোকান আগে থেকেই আছে" });

        const newCustomer = {
          name: trimmed,
          phone: phone?.trim() || "",
          address: address?.trim() || "",
          totalBilled: 0,
          totalPaid: 0,
          totalDue: 0,
          createdBy: req.user._id,
          createdAt: new Date(),
        };

        const result = await Customers.insertOne(newCustomer);
        res.status(201).send({ ...newCustomer, _id: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* ================= Customer এর Sale History ================= */
    app.get("/customers/:id/sales", protect, async (req, res) => {
      try {
        const customerId = new ObjectId(req.params.id);
        const sales = await Sales.find({ customerId }).sort({ date: -1, createdAt: -1 }).toArray();

        // Frontend-এর সাথে মিলিয়ে Data format করা হচ্ছে
        const formatted = sales.map((s) => ({
          _id: s._id,
          date: s.date,
          items: (s.items || []).map(item => ({
              productName: item.productName,
              quantityKg: item.kg,
              ratePerKg: item.kg > 0 ? item.subtotal / item.kg : 0,
              amount: item.subtotal,
          })),
          totalAmount: s.totalBill,
          paidAmount: s.paidAmount,
          dueAmount: s.due,
        }));

        const payments = await FundTransactions.find({ customerId }).sort({ date: -1, createdAt: -1 }).toArray();
        res.status(200).send({ sales: formatted, payments });
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* ================= বাকি আদায় (Payment Collection) ================= */
    app.post("/customers/:id/payment", protect, async (req, res) => {
      try {
        const customerId = new ObjectId(req.params.id);
        const { amount, fundId, note, date } = req.body;

        const amountNum = Number(amount);
        if (!amountNum || amountNum <= 0) return res.status(400).send({ message: "সঠিক Amount দাও" });

        const customer = await Customers.findOne({ _id: customerId });
        if (!customer) return res.status(404).send({ message: "Customer পাওয়া যায়নি" });

        if (amountNum > customer.totalDue) {
          return res.status(400).send({
            message: `বাকির চেয়ে বেশি টাকা দেওয়া যাবে না (বর্তমান বাকি: ৳${customer.totalDue.toLocaleString()})`,
          });
        }

        let fund = null;
        if (fundId) {
          fund = await Funds.findOne({ _id: new ObjectId(fundId) });
          if (!fund) return res.status(404).send({ message: "Fund পাওয়া যায়নি" });
        }

        await Customers.updateOne(
          { _id: customerId },
          {
            $inc: { totalDue: -amountNum, totalPaid: amountNum },
            $set: { updatedAt: new Date() },
          }
        );

        if (fund) {
          await Funds.updateOne(
            { _id: fund._id },
            { $inc: { balance: amountNum, totalIn: amountNum }, $set: { updatedAt: new Date() } }
          );
          await FundTransactions.insertOne({
            fundId: fund._id,
            fundName: fund.name,
            customerId,
            customerName: customer.name,
            type: "customer_payment",
            direction: "in",
            amount: amountNum,
            note: note?.trim() || `বাকি আদায় — ${customer.name}`,
            date: date || new Date().toISOString().slice(0, 10),
            createdBy: req.user._id,
            createdAt: new Date(),
          });
        }

        const updated = await Customers.findOne({ _id: customerId });
        res.status(200).send(updated);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    app.get("/sales", protect, async (req, res) => {
      res.status(200).send(await Sales.find({}).sort({ date: -1, createdAt: -1 }).toArray());
    });
    app.post("/sales", protect, async (req, res) => {
      try {
        const { date, customerId, productId, bagCount, ratePerBag, discount, paidAmount, fundId, bagSize: requestedBagSize, items } = req.body;

        if (Array.isArray(items) && items.length > 0) {
          let totalBagCount = 0;
          let totalDiscount = Number(discount) || 0;
          let totalPaid = Number(paidAmount) || 0;
          for (const item of items) {
            if (!item.productId || !item.bagCount || !item.bagSize || !item.ratePerBag) {
              return res.status(400).send({ message: "প্রতিটি Sale line সম্পূর্ণ পূরণ করো" });
            }
            totalBagCount += Number(item.bagCount);
          }
          const customer = await Customers.findOne({ _id: new ObjectId(customerId) });
          if (!customer) return res.status(404).send({ message: "Customer পাওয়া যায়নি" });
          const saleLines = [];
          let subtotalAll = 0;
          let costAll = 0;
          for (const item of items) {
            const product = await Products.findOne({ _id: new ObjectId(item.productId) });
            if (!product) return res.status(404).send({ message: "Product পাওয়া যায়নি" });
            const count = Number(item.bagCount);
            const size = Number(item.bagSize);
            const rate = Number(item.ratePerBag);
            const stockEntry = await Stock.findOne({ productId: product._id, bagSize: size, currentKg: { $gte: count * size } });
            const available = Number(stockEntry?.fullBags) || Math.floor((stockEntry?.currentKg || 0) / size);
            if (!stockEntry || available < count) return res.status(400).send({ message: `${product.name} এর ${size}kg বস্তা যথেষ্ট নেই` });
            const lineSubtotal = count * rate;
            saleLines.push({ productId: product._id, productName: product.name, bagCount: count, bagSize: size, kg: count * size, ratePerBag: rate, subtotal: lineSubtotal, purchasePriceAtSale: product.purchasePricePerKg || 0 });
            subtotalAll += lineSubtotal;
            costAll += count * size * (product.purchasePricePerKg || 0);
          }
          const totalBill = subtotalAll - totalDiscount;
          if (totalBill < 0 || totalPaid > totalBill) return res.status(400).send({ message: "Discount বা Paid Amount সঠিক দাও" });
          const due = totalBill - totalPaid;
          const cashFund = totalPaid > 0 ? await Funds.findOne({ name: "Cash in Hand" }) : null;
          const sale = { date, customerId: customer._id, customerName: customer.name, items: saleLines, productName: saleLines.map((line) => line.productName).join(", "), productId: saleLines[0].productId, bagCount: totalBagCount, bagSize: saleLines[0].bagSize, kg: saleLines.reduce((sum, line) => sum + line.kg, 0), ratePerBag: saleLines[0].ratePerBag, subtotal: subtotalAll, discount: totalDiscount, totalBill, paidAmount: totalPaid, due, totalProfit: totalBill - costAll, realizedProfit: totalBill ? (totalBill - costAll) * (totalPaid / totalBill) : 0, fundId: cashFund?._id || null, fundName: cashFund?.name || null, createdBy: req.user._id, createdAt: new Date() };
          const result = await Sales.insertOne(sale);
          for (const line of saleLines) await Stock.updateOne({ productId: line.productId, bagSize: line.bagSize }, { $inc: { currentKg: -line.kg, fullBags: -line.bagCount }, $set: { updatedAt: new Date() } });
          await Customers.updateOne({ _id: customer._id }, { $inc: { totalBilled: totalBill, totalPaid: totalPaid, totalDue: due }, $set: { updatedAt: new Date() } });
          if (totalPaid > 0 && cashFund) {
            await Funds.updateOne({ _id: cashFund._id }, { $inc: { balance: totalPaid, totalIn: totalPaid }, $set: { updatedAt: new Date() } });
            await FundTransactions.insertOne({ fundId: cashFund._id, fundName: cashFund.name, customerId: customer._id, customerName: customer.name, type: "sale_payment", direction: "in", amount: totalPaid, note: `Sale — ${customer.name}`, date, createdBy: req.user._id, createdAt: new Date() });
          }
          return res.status(201).send(await Sales.findOne({ _id: result.insertedId }));
        }

        if (!date || !customerId || !productId || !bagCount || !ratePerBag) {
          return res.status(400).send({ message: "সব ফিল্ড পূরণ করো" });
        }

        const bagCountNum = Number(bagCount);
        const ratePerBagNum = Number(ratePerBag);
        const discountNum = Number(discount) || 0;
        const paidNum = Number(paidAmount) || 0;

        if (bagCountNum <= 0 || ratePerBagNum <= 0) {
          return res.status(400).send({ message: "বস্তা সংখ্যা ও রেট ০ এর বেশি হতে হবে" });
        }
        if (discountNum < 0) {
          return res.status(400).send({ message: "Discount ঋণাত্মক হতে পারবে না" });
        }

        const customer = await Customers.findOne({ _id: new ObjectId(customerId) });
        if (!customer) return res.status(404).send({ message: "Customer পাওয়া যায়নি" });

        const product = await Products.findOne({ _id: new ObjectId(productId) });
        if (!product) return res.status(404).send({ message: "Product পাওয়া যায়নি" });

        const stockEntries = await Stock.find({ productId: product._id, currentKg: { $gt: 0 } }).sort({ lastReturnDate: 1, createdAt: 1 }).toArray();
        if (stockEntries.length === 0) {
          return res.status(400).send({
            message: "এই Product-এর Stock নেই",
          });
        }

        const stockEntry = stockEntries.find((entry) => Number(entry.bagSize) === requestedBagSize) || stockEntries[0];
        const bagSize = Number(requestedBagSize) || Number(stockEntry.bagSize) || Number(product.bagSize) || 0;
        const availableBags = Number(stockEntry.fullBags) || Math.floor((stockEntry.currentKg || 0) / bagSize);
        if (availableBags < bagCountNum) {
          return res.status(400).send({
            message: `এই ${bagSize}kg বস্তার Stock এ মাত্র ${availableBags}টা আছে`,
          });
        }
        const kgNum = bagCountNum * bagSize;

        const subtotal = bagCountNum * ratePerBagNum;
        const totalBill = subtotal - discountNum;
        if (totalBill < 0) {
          return res.status(400).send({ message: "Discount, মোট মূল্যের চেয়ে বেশি হতে পারবে না" });
        }

        const due = totalBill - paidNum;
        if (due < 0) {
          return res.status(400).send({ message: "Paid Amount, মোট বিলের চেয়ে বেশি হতে পারবে না" });
        }

        const purchasePricePerKg = product.purchasePricePerKg || 0;
        const totalProfit = totalBill - kgNum * purchasePricePerKg;

        let fund = null;
        if (paidNum > 0) {
          fund = await Funds.findOne({ name: "Cash in Hand" });
          if (!fund) return res.status(404).send({ message: "Cash in Hand fund পাওয়া যায়নি" });
        }

        const paidRatio = totalBill > 0 ? paidNum / totalBill : 0;
        const realizedProfit = totalProfit * paidRatio;

        const newSale = {
          date,
          customerId: customer._id,
          customerName: customer.name,
          productId: product._id,
          productName: product.name,
          stockBagSize: bagSize,
          bagCount: bagCountNum,
          bagSize,
          kg: kgNum,
          ratePerBag: ratePerBagNum,
          subtotal,
          discount: discountNum,
          totalBill,
          paidAmount: paidNum,
          due,
          purchasePriceAtSale: purchasePricePerKg,
          totalProfit,
          realizedProfit,
          fundId: fund ? fund._id : null,
          fundName: fund ? fund.name : null,
          createdBy: req.user._id,
          createdAt: new Date(),
        };

        const result = await Sales.insertOne(newSale);

        // Stock কমাও
        await Stock.updateOne(
          { _id: stockEntry._id },
          { $inc: { currentKg: -kgNum, fullBags: -bagCountNum }, $set: { updatedAt: new Date() } }
        );

        // Customer এর হিসাব আপডেট
        await Customers.updateOne(
          { _id: customer._id },
          {
            $inc: { totalBilled: totalBill, totalPaid: paidNum, totalDue: due },
            $set: { updatedAt: new Date() },
          }
        );

        if (paidNum > 0 && fund) {
          await Funds.updateOne(
            { _id: fund._id },
            { $inc: { balance: paidNum, totalIn: paidNum }, $set: { updatedAt: new Date() } }
          );
          await FundTransactions.insertOne({
            fundId: fund._id,
            fundName: fund.name,
            customerId: customer._id,
            customerName: customer.name,
            type: "sale_payment",
            direction: "in",
            amount: paidNum,
            note: `Sale — ${customer.name} (${product.name})`,
            date,
            createdBy: req.user._id,
            createdAt: new Date(),
          });
        }

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

    app.delete("/sales/:id", protect, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const sale = await Sales.findOne({ _id });
        if (!sale) return res.status(404).send({ message: "Sale পাওয়া যায়নি" });

        // Stock ফেরত দাও
        await Stock.updateOne(
          { productId: sale.productId, bagSize: sale.stockBagSize || sale.bagSize },
          { $inc: { currentKg: sale.kg, fullBags: sale.bagCount }, $set: { updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), productName: sale.productName, bagSize: sale.stockBagSize || sale.bagSize } },
          { upsert: true }
        );

        await Customers.updateOne(
          { _id: sale.customerId },
          {
            $inc: {
              totalBilled: -sale.totalBill,
              totalPaid: -sale.paidAmount,
              totalDue: -sale.due,
            },
            $set: { updatedAt: new Date() },
          }
        );

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

    /* ================= Start server ================= */
    app.get("/", (req, res) => res.send("Server is running..."));
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
  }
}

run().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});