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
    const AllUser = db.collection("AllUser");
    const Products = db.collection("Products");
    const Categories = db.collection("Categories");

    /* ================= Helper: auto product code ================= */
    async function generateProductCode() {
      const count = await Products.countDocuments();
      return `PRD-${String(count + 1).padStart(4, "0")}`;
    }

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

        // token cookie তে set হচ্ছে, JSON body তে আর যাচ্ছে না
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

        // এখানে নতুন check
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

        // এখানে নতুন check
        if (!user.isActive) {
          res.clearCookie("token", cookieOptions); // cookie clear করে দাও যাতে বারবার request না যায়
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

    /* ================= GET all products (search + filter — সব backend থেকে) ================= */
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

    /* ================= GET single product ================= */
    app.get("/products/:id", protect, async (req, res) => {
      try {
        const product = await Products.findOne({ _id: new ObjectId(req.params.id) });
        if (!product) return res.status(404).send({ message: "Product পাওয়া যায়নি" });
        res.status(200).send(product);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* ================= CREATE product ================= */
    app.post("/products", protect, async (req, res) => {
  try {
    const { name, category, brand, unit, bagWeightKg, salePricePerKg, status } = req.body;

    if (!name || !category || !unit) {
      return res.status(400).send({ message: "Name, Category, Unit আবশ্যক" });
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
      unit,
      bagWeightKg: Number(bagWeightKg) || 0,
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

    /* ================= UPDATE product ================= */
   app.patch("/products/:id", protect, async (req, res) => {
  try {
    const _id = new ObjectId(req.params.id);
    const updates = { ...req.body, updatedAt: new Date() };

    delete updates._id;
    delete updates.code;
    delete updates.createdAt;
    delete updates.createdBy;

    ["bagWeightKg", "salePricePerKg"].forEach((f) => {
      if (updates[f] !== undefined) updates[f] = Number(updates[f]) || 0;
    });

    const existing = await Products.findOne({ _id });
    if (!existing) return res.status(404).send({ message: "Product পাওয়া যায়নি" });

    await Products.updateOne({ _id }, { $set: updates });
    const updated = await Products.findOne({ _id });
    res.status(200).send(updated);
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

    /* ================= DELETE product ================= */
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

    /* ================= Helper: escape regex ================= */
    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    /* ================= GET all categories ================= */
    app.get("/categories", protect, async (req, res) => {
      try {
        const categories = await Categories.find({}).sort({ name: 1 }).toArray();
        res.status(200).send(categories);
      } catch (err) {
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    /* ================= CREATE category ================= */
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

    /* ================= DELETE category ================= */
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