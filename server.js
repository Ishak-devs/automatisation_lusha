require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" })); // le CSV parsé peut être volumineux
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor/chart.umd.js",
  express.static(path.join(__dirname, "node_modules/chart.js/dist/chart.umd.js"))
);

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

// Sauvegarde un rapport d'usage parsé (envoyé par le front après import CSV)
app.post("/api/usage-report", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(400).json({ ok: false, error: "Supabase non configuré (SUPABASE_URL / SUPABASE_ANON_KEY manquants)." });
    }
    const { stats, users, months } = req.body;
    if (!stats || !users) {
      return res.status(400).json({ ok: false, error: "Payload invalide." });
    }
    const { data, error } = await supabase
      .from("usage_reports")
      .insert({
        ref_month: stats.refMonth,
        comp_month: stats.compMonth,
        months,
        stats,
        users,
        imported_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, report: data });
  } catch (err) {
    console.error("[usage-report save] erreur:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Renvoie le dernier rapport importé (le plus récent), pour que tout le monde voie la même chose
app.get("/api/usage-report", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(400).json({ ok: false, error: "Supabase non configuré." });
    }
    const { data, error } = await supabase
      .from("usage_reports")
      .select("*")
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json({ ok: true, report: data });
  } catch (err) {
    console.error("[usage-report get] erreur:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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