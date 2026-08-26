require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor/chart.umd.js",
  express.static(path.join(__dirname, "node_modules/chart.js/dist/chart.umd.js"))
);

// Usage/crédits du compte Lusha — utilisé par la section "Points de vigilance" du dashboard
app.get("/api/usage", async (req, res) => {
  try {
    const apiKey = process.env.LUSHA_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ ok: false, error: "LUSHA_API_KEY manquante dans .env" });
    }
    const response = await axios.get("https://api.lusha.com/account/usage", {
      headers: { api_key: apiKey, "Content-Type": "application/json" },
      timeout: 20000,
    });
    res.json({ ok: true, usage: response.data });
  } catch (err) {
    console.error("[usage] erreur:", err.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.response?.data?.message || err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard sur http://localhost:${PORT}`));