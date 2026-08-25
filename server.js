require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const lusha = require("./lusha");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DB_PATH = path.join(__dirname, "db.json");

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    return { contacts: [], companies: [], companySignals: [], contactSignals: [], lastSync: null };
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Config de recherche par défaut — à adapter à votre ICP
const DEFAULT_CONTACT_FILTERS = JSON.parse(
  process.env.CONTACT_FILTERS_JSON || "{}"
);
const DEFAULT_COMPANY_FILTERS = JSON.parse(
  process.env.COMPANY_FILTERS_JSON || "{}"
);

async function runSync() {
  console.log("[sync] démarrage...");
  console.log("[sync] recherche contacts...");
  const contacts = await lusha.searchContacts(DEFAULT_CONTACT_FILTERS, 25);
  console.log(`[sync] ${contacts.length} contacts ok`);
  console.log("[sync] recherche entreprises...");
  const companies = await lusha.searchCompanies(DEFAULT_COMPANY_FILTERS, 25);
  console.log(`[sync] ${companies.length} entreprises ok`);

  const companyIds = companies.map((c) => c.id).filter(Boolean);
  const contactIds = contacts.map((c) => c.id).filter(Boolean);

  // Signaux désactivés (endpoint instable / non activé sur le plan actuel)
  const companySignals = [];
  const contactSignals = [];

  const data = {
    contacts,
    companies,
    companySignals,
    contactSignals,
    lastSync: new Date().toISOString(),
  };
  writeDB(data);
  console.log(
    `[sync] ok — ${contacts.length} contacts, ${companies.length} entreprises, ${companySignals.length + contactSignals.length} signaux`
  );
  return data;
}

// Déclenche une sync manuelle
app.post("/api/sync", async (req, res) => {
  try {
    const data = await runSync();
    res.json({ ok: true, lastSync: data.lastSync });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.response?.data || err.message });
  }
});

// Renvoie les données brutes + agrégées pour le dashboard
app.get("/api/data", (req, res) => {
  const db = readDB();
  res.json(db);
});

app.get("/api/status", (req, res) => {
  const db = readDB();
  res.json({ lastSync: db.lastSync, hasApiKey: !!process.env.LUSHA_API_KEY });
});

// Sync automatique — planning configurable via CRON_SCHEDULE (défaut: tous les jours à 6h)
const schedule = process.env.CRON_SCHEDULE || "0 6 * * *";
if (process.env.LUSHA_API_KEY) {
  cron.schedule(schedule, () => {
    runSync().catch((e) => console.error("[cron] erreur sync:", e.message));
  });
  console.log(`[cron] sync automatique planifiée: "${schedule}"`);
} else {
  console.warn("[cron] LUSHA_API_KEY absente — sync automatique désactivée");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard sur http://localhost:${PORT}`));