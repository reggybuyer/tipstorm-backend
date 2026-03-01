const axios = require("axios");

const backendUrl = "https://tipstorm-web-app.onrender.com"; // your backend URL
const adminEmail = "admin@test.com"; // replace with your admin email

async function testAddSlip() {
  const slip = {
    date: new Date().toISOString().split("T")[0],
    games: [
      { home: "Team A", away: "Team B", odd: 1.5, overUnder: "Over 2.5" },
    ],
    premium: true,
  };

  try {
    const res = await axios.post(`${backendUrl}/add-slip`, { adminEmail, slip });
    console.log("Slip added successfully:", res.data);
  } catch (err) {
    console.error("Failed to add slip:", err.response?.data || err.message);
  }
}

testAddSlip(); 
