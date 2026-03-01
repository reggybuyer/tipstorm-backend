const mongoose = require("mongoose");

const uri = "mongodb+srv://vincentmunyao203_db_user:AoYV3fXqpRfy0Y16@tipstorm.hh0ehyg.mongodb.net/tipstorm?retryWrites=true&w=majority&appName=tipstorm";

mongoose.connect(uri)
  .then(async () => {
    console.log("MongoDB connected");

    const User = mongoose.model("User", new mongoose.Schema({
      email: String,
      role: String,
      plan: String,
      premium: Boolean,
      approved: Boolean,
    }));

    const users = await User.find();
    console.log(users);

    mongoose.connection.close();
  })
  .catch(err => console.error(err)); 
