// lusha.js — wrapper autour de l'API REST Lusha v3
// Doc: https://docs.lusha.com

const axios = require("axios");

const BASE_URL = "https://api.lusha.com/v3";

function client() {
  const apiKey = process.env.LUSHA_API_KEY;
  if (!apiKey) throw new Error("LUSHA_API_KEY manquante dans .env");
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "api_key": apiKey,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });
}

// Recherche + enrichissement de contacts selon des filtres ICP
// filters ex: { jobTitles: ["CEO","CTO"], seniority: ["director","vp","c_suite"] }
async function searchContacts(filters = {}, limit = 25) {
  const api = client();
  const search = await api.post("/prospecting/contact/search", {
    filters,
    pages: { page: 0, size: limit },
  });
  const ids = (search.data?.results || search.data?.contacts || [])
    .map((c) => c.contactId || c.id)
    .filter(Boolean);
  if (!ids.length) return [];
  const enrich = await api.post("/prospecting/contact/enrich", {
    contactIds: ids,
  });
  return enrich.data?.contacts || enrich.data?.results || [];
}

// Recherche + enrichissement d'entreprises
async function searchCompanies(filters = {}, limit = 25) {
  const api = client();
  const search = await api.post("/prospecting/company/search", {
    filters,
    pages: { page: 0, size: limit },
  });
  const ids = (search.data?.results || search.data?.companies || [])
    .map((c) => c.companyId || c.id)
    .filter(Boolean);
  if (!ids.length) return [];
  const enrich = await api.post("/prospecting/company/enrich", {
    companyIds: ids,
  });
  return enrich.data?.companies || enrich.data?.results || [];
}

// Signaux d'activité sur des entreprises (hiring, news, headcount...)
async function getCompanySignals(companyIds = [], signalTypes = ["allSignals"]) {
  if (!companyIds.length) return [];
  const api = client();
  const res = await api.post("/signals/company/search", {
    companyIds,
    signalTypes,
  });
  return res.data?.results || res.data?.signals || [];
}

// Signaux sur des contacts (promotion, changement d'entreprise)
async function getContactSignals(contactIds = [], signalTypes = ["allSignals"]) {
  if (!contactIds.length) return [];
  const api = client();
  const res = await api.post("/signals/contact/search", {
    contactIds,
    signalTypes,
  });
  return res.data?.results || res.data?.signals || [];
}

module.exports = {
  searchContacts,
  searchCompanies,
  getCompanySignals,
  getContactSignals,
};
