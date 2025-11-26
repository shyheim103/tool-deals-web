// Import v2 scheduler
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require('firebase-admin');
const amazon = require('amazon-paapi');
const axios = require('axios');

// Set max instances to control costs
setGlobalOptions({ maxInstances: 1 });

admin.initializeApp();
const db = admin.firestore();

// --- CONFIGURATION ---
// IMPORTANT: Replace these with your actual keys/IDs directly
const APP_ID = 'default-app';
const MIN_DISCOUNT_PERCENT = 25;

// API KEYS (Hardcoded for simplicity)
const amazonParams = {
  AccessKey: 'AKPAVHB5S61763871673',
  SecretKey: 'NU7aCaY/Cxa654wLQki4VTUuGpqa6RuV+PMi03GO',
  PartnerTag: 'thingsthatrea-20', // e.g., tooldeals-20
  PartnerType: 'Associates',
  Marketplace: 'www.amazon.com'
};

const IMPACT_CONFIG = {
  AccountSID: 'IRUYAEiFA6CW1885322jxLbyaj6NkCYkE1',
  AuthToken: 'JvVxNnAHFDdHGyBnJP5wAy_jAj9K_pjZ',
  Campaigns: {
    'hd': '8154', 'acme': '11565', 'ace': '9988', 
    'tn': 'YOUR_TOOLNUT_ID'
  }
};

const CJ_CONFIG = {
  PersonalAccessToken: 'ofAvUhTCJdr_cQOULotcMXC7pw',
  CompanyID: '2944530',
  WebsiteID: '9162319',
  Advertisers: { 'zoro': '4683856', 'northern': '4236' }
};

const PEPPERJAM_CONFIG = {
  ApiKey: '9bf9611eb4bef35affc164da535b4b8ff4db7bb7385cf1a7fc85fabe33e85d0b',
  ProgramIds: { 'tsc': '7937' }
};

// --- HELPERS ---
function categorizeItem(title) {
  const t = title.toLowerCase();
  if (t.includes('battery') || t.includes('charger')) return 'batteries';
  if (t.includes('drill') || t.includes('driver')) return 'drills';
  if (t.includes('saw')) return 'saws';
  if (t.includes('mower') || t.includes('blower') || t.includes('trimmer')) return 'outdoor-power';
  if (t.includes('wrench') || t.includes('socket')) return 'hand-tools';
  return 'uncategorized';
}

function getDealsCollection() {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('deals');
}

// --- FETCHERS ---
// (You will need to copy/paste your full fetchAmazon, fetchImpact, fetchCJ, fetchPepperJam logic here again)
// I am keeping them abbreviated here to save space, but you must fill them in!

async function fetchAmazon() { /* ... paste fetchAmazon code ... */ }
async function fetchImpact() { /* ... paste fetchImpact code ... */ }
async function fetchCJ() { /* ... paste fetchCJ code ... */ }
async function fetchPepperJam() { /* ... paste fetchPepperJam code ... */ }

// --- THE SCHEDULED FUNCTION (V2) ---
// Runs every hour
exports.refreshdeals = onSchedule("every 60 minutes", async (event) => {
  console.log('⏰ Scheduled Bot Started...');
  
  await fetchAmazon();
  await fetchImpact();
  await fetchCJ();
  await fetchPepperJam();
  
  console.log('🏁 Scheduled Bot Finished.');
});