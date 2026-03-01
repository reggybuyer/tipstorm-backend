// migratePasswords.js
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const USERS_FILE = path.join(__dirname, "users.json");

// Load users
if (!fs.existsSync(USERS_FILE)) {
  console.log("users.json not found!");
  process.exit(1);
}

let users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
let updated = false;

// Hash plain-text passwords
Object.keys(users).forEach(email => {
  const user = users[email];
  if (!user.password.startsWith("$2")) {
    user.password = bcrypt.hashSync(user.password, 10);
    updated = true;
    console.log(`Password hashed for: ${email}`);
  }
});

if (updated) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  console.log("All plain-text passwords migrated successfully!");
} else {
  console.log("No passwords needed migration.");
} 
