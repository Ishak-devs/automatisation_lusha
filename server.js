require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const lusha = require("./lusha");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor/chart.umd.js",
  express.static(path.join(__dirname, "node_modules/chart.js/dist/chart.umd.js"))
);

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

// Génère une analyse IA (vigilance + axes d'amélioration) sur les données actuelles
app.post("/api/insights", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({
        ok: false,
        error: "ANTHROPIC_API_KEY manquante dans .env",
      });
    }
    const db = readDB();
    if (!db.contacts?.length && !db.companies?.length) {
      return res.status(400).json({ ok: false, error: "Aucune donnée à analyser — lancez une sync d'abord." });
    }

    // Résumé compact des données (pas besoin d'envoyer les 25 fiches complètes)
    const summary = {
      totalContacts: db.contacts?.length || 0,
      totalCompanies: db.companies?.length || 0,
      senioritySample: (db.contacts || []).map((c) => c.jobTitle?.seniority || c.jobTitle?.title).filter(Boolean),
      departmentSample: (db.contacts || []).flatMap((c) => c.jobTitle?.departments || []),
      industrySample: (db.companies || []).map((c) => c.industry).filter(Boolean),
      companySizeSample: (db.companies || []).map((c) => c.employeeCount).filter(Boolean),
      countrySample: (db.contacts || []).map((c) => c.location?.country).filter(Boolean),
    };

    const prompt = `Tu es un analyste commercial qui examine un extrait de données de prospection B2B (issues de Lusha).
Voici un résumé des données actuelles :
${JSON.stringify(summary, null, 2)}

Rédige une courte analyse en français, en deux parties, avec ces titres exacts :
## Points de vigilance
## Axes d'amélioration

Chaque partie : 2 à 4 puces courtes et concrètes (pas de généralités creuses), basées uniquement sur ce qui ressort des données ci-dessus (ex: manque de décideurs, secteur trop dispersé, taille d'entreprise peu cohérente avec un ICP, etc). Pas de préambule, pas de conclusion, juste les deux sections.`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-5",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const text = response.data?.content?.map((b) => b.text || "").join("\n") || "";
    res.json({ ok: true, text, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[insights] erreur:", err.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.response?.data?.error?.message || err.message });
  }
});

app.get("/api/status", (req, res) => {
  const db = readDB();
  res.json({ lastSync: db.lastSync, hasApiKey: !!process.env.LUSHA_API_KEY });
});

// Sync automatique — deux plannings : hebdomadaire et mensuel
const weeklySchedule = process.env.CRON_SCHEDULE_WEEKLY || "0 6 * * 1"; // tous les lundis 6h
const monthlySchedule = process.env.CRON_SCHEDULE_MONTHLY || "0 6 1 * *"; // le 1er du mois 6h

if (process.env.LUSHA_API_KEY) {
  cron.schedule(weeklySchedule, () => {
    console.log("[cron] déclenchement sync hebdomadaire");
    runSync().catch((e) => console.error("[cron] erreur sync hebdo:", e.message));
  });
  cron.schedule(monthlySchedule, () => {
    console.log("[cron] déclenchement sync mensuelle");
    runSync().catch((e) => console.error("[cron] erreur sync mensuelle:", e.message));
  });
  console.log(`[cron] sync hebdomadaire planifiée: "${weeklySchedule}"`);
  console.log(`[cron] sync mensuelle planifiée: "${monthlySchedule}"`);
} else {
  console.warn("[cron] LUSHA_API_KEY absente — sync automatique désactivée");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard sur http://localhost:${PORT}`));