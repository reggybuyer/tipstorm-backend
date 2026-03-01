require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

const userSchema = new mongoose.Schema({
  email: String,
  role: String,
  approved: Boolean,
  plan: String
});

const User = mongoose.model("User", userSchema);

// Find only admins
User.find({ role: "admin" }).then(admins => {
  console.log("Admins in DB:");
  admins.forEach(admin => console.log(admin.email));
  mongoose.connection.close();
}); 
