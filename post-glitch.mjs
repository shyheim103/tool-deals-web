import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

// --- 1. EDIT THIS SECTION FOR EACH GLITCH ---
const GLITCH_DATA = {
  title: "🔥 FLEX 24V GLITCH - Massive Discounts on Kits & Saws",
  price: 0, // Put 0 if it varies
  originalPrice: 0, // Put 0 if unknown
  store: 'lowes', // Use: 'lowes', 'hd', 'amz', etc.
  url: "https://shoplowes.me/4rmgi7h", // Your Affiliate Link
  // A reliable default image. Replace with a product image link if you have one.
  image: "https://placehold.co/600x400/red/white?text=GLITCH+DEAL&font=roboto", 
  dealType: "Glitch" 
};
// --------------------------------------------

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function postGlitch() {
  console.log(`🚀 Posting Glitch: ${GLITCH_DATA.title}...`);
  
  // Create a unique ID based on time
  const id = `manual-${Date.now()}`;
  
  await db.collection('deals').doc(id).set({
    title: GLITCH_DATA.title,
    price: GLITCH_DATA.price,
    originalPrice: GLITCH_DATA.originalPrice,
    store: GLITCH_DATA.store,
    category: 'Power Tools',
    dealType: GLITCH_DATA.dealType,
    url: GLITCH_DATA.url,
    image: GLITCH_DATA.image,
    timestamp: Date.now(),
    hot: true
  });

  console.log("✅ Glitch is LIVE on the database!");
  console.log("👉 Go refresh your website.");
}

postGlitch();