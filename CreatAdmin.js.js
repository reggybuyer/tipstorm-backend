require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
  premium: { type: Boolean, default: false },
  approved: { type: Boolean, default: false },
  plan: { type: String, default: null },
  expiresAt: { type: Date, default: null },
});
const User = mongoose.model("User", userSchema);

async function createAdmin() {
  await mongoose.connect(process.env.MONGO_URI);
  const exists = await User.findOne({ email: "admin@test.com" });
  if (exists) {
    console.log("Admin already exists");
    return process.exit(0);
  }
  const hashed = bcrypt.hashSync("admin123", 10);
  await User.create({ email: "admin@test.com", password: hashed, role: "admin" });
  console.log("Admin created successfully");
  process.exit(0);
}

createAdmin().catch(err => console.error(err)); 
