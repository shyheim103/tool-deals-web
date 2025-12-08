import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// THE VIP LIST: Keep these, delete everything else.
const KEEP_STORES = [
  'amz',      // Amazon
  'hd',       // Home Depot
  'lowes',    // Lowe's
  'acme',     // Acme Tools
  'ace',      // Ace Hardware
  'walmart'   // Walmart
];

async function purgeDatabase() {
  console.log("🧹 Starting Smart Purge...");
  console.log(`🛡️  Keeping deals from: ${KEEP_STORES.join(', ')}`);
  
  // Get ALL deals
  const snapshot = await db.collection('deals').get();
  
  if (snapshot.empty) {
    console.log("   Database is empty.");
    return;
  }

  console.log(`   Scanning ${snapshot.size} total deals...`);

  const batch = db.batch();
  let deleteCount = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const storeCode = data.store; // e.g. 'zoro', 'northern', 'amz'

    // If the store is NOT in our VIP list, delete it.
    if (!KEEP_STORES.includes(storeCode)) {
      // console.log(`   🗑️  Marking for deletion: ${data.title} (${storeCode})`); // Uncomment to see details
      batch.delete(doc.ref);
      deleteCount++;
    }
  });

  if (deleteCount > 0) {
    await batch.commit();
    console.log(`✅ SUCCESS: Deleted ${deleteCount} deals from unwanted stores.`);
  } else {
    console.log("✅ Database is clean! No unwanted deals found.");
  }
}

purgeDatabase();