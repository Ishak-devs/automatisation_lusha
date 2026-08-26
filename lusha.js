// lusha.js — wrapper autour de l'API REST Lusha v3
// Doc: https://docs.lusha.com/apis/openapi

const axios = require("axios");

const BASE_URL = "https://api.lusha.com/v3";

function client() {
  const apiKey = process.env.LUSHA_API_KEY;
  if (!apiKey) throw new Error("LUSHA_API_KEY manquante dans .env");
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      api_key: apiKey,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });
}

// Recherche + enrichissement de contacts selon des filtres ICP
// contactFilters ex: { jobTitles: ["CEO","CTO"], seniorityIds: [4,5] }
async function searchContacts(contactFilters = {}, limit = 25) {
  const api = client();
  const search = await api.post("/contacts/prospecting", {
    pagination: { page: 0, size: limit },
    filters: {
      contacts: { include: contactFilters },
    },
  });
  const ids = (search.data?.results || [])
    .map((c) => c.id)
    .filter(Boolean);
  if (!ids.length) return [];
  const enrich = await api.post("/contacts/enrich", {
    ids,
    reveal: ["emails", "phones"],
  });
  return enrich.data?.results || [];
}

// Recherche + enrichissement d'entreprises
// companyFilters ex: { locations: [{country:"France"}], sizes: [{min:50,max:500}] }
async function searchCompanies(companyFilters = {}, limit = 25) {
  const api = client();
  const search = await api.post("/companies/prospecting", {
    pagination: { page: 0, size: limit },
    filters: {
      companies: { include: companyFilters },
    },
  });
  const ids = (search.data?.results || [])
    .map((c) => c.id)
    .filter(Boolean);
  if (!ids.length) return [];
  const enrich = await api.post("/companies/enrich", { ids });
  return enrich.data?.results || [];
}

// Signaux d'activité sur des entreprises (hiring, news, headcount...)
async function getCompanySignals(companyIds = [], signalTypes = ["allSignals"]) {
  if (!companyIds.length) return [];
  const api = client();
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const res = await api.post("/companies/signals", {
    ids: companyIds,
    signalTypes,
    startDate: sixMonthsAgo,
  });
  return res.data?.results || [];
}

// Signaux sur des contacts (promotion, changement d'entreprise)
async function getContactSignals(contactIds = [], signalTypes = ["allSignals"]) {
  if (!contactIds.length) return [];
  const api = client();
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const res = await api.post("/contacts/signals", {
    ids: contactIds,
    signalTypes,
    startDate: sixMonthsAgo,
  });
  return res.data?.results || [];
}

function ownerBody() {
  const email = process.env.LUSHA_OWNER_EMAIL;
  if (!email) throw new Error("LUSHA_OWNER_EMAIL manquante dans .env (requis pour l'API Tables)");
  return { owner: { email } };
}

// Liste les tables (Workspace) de contacts sauvegardées par l'équipe
async function listContactTables() {
  const api = client();
  const res = await api.post("/contacts/tables/list", ownerBody());
  return res.data?.results || res.data?.tables || [];
}

// Liste les tables (Workspace) d'entreprises sauvegardées par l'équipe
async function listCompanyTables() {
  const api = client();
  const res = await api.post("/companies/tables/list", ownerBody());
  return res.data?.results || res.data?.tables || [];
}

// Lit toutes les lignes (avec colonnes) d'une table de contacts
async function getContactsFromTable(tableId, size = 100) {
  const api = client();
  const res = await api.post("/contacts/tables/entities/get", {
    tableId,
    pagination: { page: 0, size },
    ...ownerBody(),
  });
  return res.data?.results || res.data?.entities || [];
}

// Lit toutes les lignes (avec colonnes) d'une table d'entreprises
async function getCompaniesFromTable(tableId, size = 100) {
  const api = client();
  const res = await api.post("/companies/tables/entities/get", {
    tableId,
    pagination: { page: 0, size },
    ...ownerBody(),
  });
  return res.data?.results || res.data?.entities || [];
}

module.exports = {
  searchContacts,
  searchCompanies,
  getCompanySignals,
  getContactSignals,
  listContactTables,
  listCompanyTables,
  getContactsFromTable,
  getCompaniesFromTable,
};