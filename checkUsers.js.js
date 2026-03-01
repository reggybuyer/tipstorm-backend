require("dotenv").config();
const mongoose = require("mongoose");

async function testConnection() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connection successful!");
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Collections in DB:", collections.map(c => c.name));
    process.exit(0);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

testConnection(); 
