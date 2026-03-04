require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const SECRET = process.env.JWT_SECRET || "supersecretkey";

/* ================= CORS ================= */
app.use(cors({
  origin: [
     "https://tipstorm-frontend.vercel.app",
     "http://localhost:3000"
     ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

app.use(express.json());

/* ================= DATABASE ================= */
// using MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

/* ================= SCHEMAS ================= */
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: String,
  role: { type: String, default: "user" },
  premium: { type: Boolean, default: false },
  plan: { type: String, default: "free" },
  expiresAt: { type: Date, default: null },
});

const slipSchema = new mongoose.Schema({
  date: String,
  access: String,
  totalOdds: Number,
  games: [
    {
      home: String,
      away: String,
      odd: Number,
      type: String,
      line: String,
      result: { type: String, default: "pending" },
    },
  ],
});

const requestSchema = new mongoose.Schema({
  email: String,
  plan: String,
  message: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Slip = mongoose.model("Slip", slipSchema);
const SubscriptionRequest = mongoose.model("SubscriptionRequest", requestSchema);

/* ================= AUTO EXPIRE PREMIUM ================= */
app.use(async (req, res, next) => {
  try {
    const now = new Date();
    await User.updateMany(
      { premium: true, expiresAt: { $lt: now } },
      { premium: false, plan: "free", expiresAt: null }
    );
  } catch {}
  next();
});

/* ================= ADMIN AUTH ================= */
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).json({ success: false });

  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ success: false });
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ success: false });
  }
}

/* ================= REGISTER ================= */
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ success: false });

    const hashed = bcrypt.hashSync(password, 10);
    await User.create({ email, password: hashed });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: false });

    const match = bcrypt.compareSync(password, user.password);
    if (!match) return res.json({ success: false });

    const token = jwt.sign({ id: user._id, role: user.role }, SECRET, {
      expiresIn: "7d",
    });

    res.json({
      success: true,
      token,
      user: {
        email: user.email,
        role: user.role,
        plan: user.plan,
        premium: user.premium,
        expiresAt: user.expiresAt,
      },
    });
  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================= PROFILE ================= */
app.get("/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false });

    const decoded = jwt.verify(token, SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ success: false });

    res.json({
      success: true,
      user: {
        email: user.email,
        role: user.role,
        plan: user.plan,
        premium: user.premium,
        expiresAt: user.expiresAt,
      },
    });
  } catch {
    res.status(401).json({ success: false });
  }
});

/* ================= SUBSCRIPTION REQUEST ================= */
app.post("/request-subscription", async (req, res) => {
  try {
    const { email, plan, message } = req.body;
    await SubscriptionRequest.create({ email, plan, message });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================= ADMIN ROUTES ================= */
app.get("/all-users", verifyAdmin, async (req, res) => {
  const users = await User.find();
  res.json({ success: true, users });
});

app.get("/subscription-requests", verifyAdmin, async (req, res) => {
  const requests = await SubscriptionRequest.find();
  res.json({ success: true, requests });
});

app.post("/approve-request", verifyAdmin, async (req, res) => {
  const { requestId } = req.body;
  const reqDoc = await SubscriptionRequest.findById(requestId);
  if (!reqDoc) return res.status(404).json({ success: false });

  const user = await User.findOne({ email: reqDoc.email });
  if (user) {
    let duration = 30;
    if (reqDoc.plan === "weekly") duration = 7;
    if (reqDoc.plan === "monthly") duration = 30;
    if (reqDoc.plan === "vip") duration = 30;

    user.plan = reqDoc.plan;
    user.premium = true;
    user.expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
    await user.save();
  }

  reqDoc.status = "approved";
  await reqDoc.save();
  res.json({ success: true });
});

/* ================= SLIPS CREATE ================= */
app.post("/slips", verifyAdmin, async (req, res) => {
  const { date, games, access } = req.body;
  if (!games?.length) return res.status(400).json({ success: false });

  const totalOdds = games.reduce((acc, g) => acc * (parseFloat(g.odd) || 1), 1);
  if (totalOdds < 2) return res.status(400).json({ success: false });

  const slip = await Slip.create({ date, access, totalOdds, games });
  res.json({ success: true, slip });
});

/* ================= SLIPS GET ================= */
app.get("/slips", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const total = await Slip.countDocuments();
  const slips = await Slip.find()
    .sort({ date: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    slips: slips || [],
    pages: Math.ceil(total / limit),
  });
});

/* ================= EDIT SLIP ================= */
app.put("/slips/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { date, access, games } = req.body;

  const slip = await Slip.findById(id);
  if (!slip) return res.status(404).json({ success: false });

  const totalOdds = games.reduce((acc, g) => acc * (parseFloat(g.odd) || 1), 1);
  slip.date = date;
  slip.access = access;
  slip.totalOdds = totalOdds;
  slip.games = games;

  await slip.save();
  res.json({ success: true, slip });
});

/* ================= DELETE SLIP ================= */
app.delete("/slips/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const slip = await Slip.findById(id);
  if (!slip) return res.status(404).json({ success: false });

  await Slip.findByIdAndDelete(id);
  res.json({ success: true });
});

/* ================= RESULT UPDATE ================= */
app.post("/slip-result", verifyAdmin, async (req, res) => {
  const { slipId, gameIndex, result } = req.body;
  const slip = await Slip.findById(slipId);
  if (!slip) return res.status(404).json({ success: false });

  slip.games[gameIndex].result = result;
  await slip.save();
  res.json({ success: true });
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 
