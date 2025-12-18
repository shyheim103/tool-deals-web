import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const admin = require('firebase-admin');
const amazon = require('amazon-paapi');
const axios = require('axios');
const { ApifyClient } = require('apify-client'); 

const serviceAccount = require('./service-account.json');

// --- CONFIGURATION ---
const APP_ID = 'production'; 
const MIN_DISCOUNT_PERCENT = 15; 
// const YOUTUBE_CHANNEL_ID = 'UCsHob-KhV7vfi-MyoXBMhDg'; // Not currently used

// SECURE TOKEN LOAD
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const apifyClient = new ApifyClient({ token: APIFY_TOKEN });

// AMAZON CONFIG
const amazonParams = {
  AccessKey: process.env.AMAZON_ACCESS_KEY, 
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG, 
  PartnerType: 'Associates',
  Marketplace: 'www.amazon.com' 
};

// IMPACT CONFIG
const IMPACT_CONFIG = {
  AccountSID: 'IRUYAEiFA6CW1885322jxLbyaj6NkCYkE1', 
  AuthToken: 'JvVxNnAHFDdHGyBnJP5wAy_jAj9K_pjZ',   
  Campaigns: {
    '8154': 'hd',         
    '11565': 'acme',      
    '9988': 'ace',        
    '9383': 'walmart'
  }
};

// --- SMART SEARCH KEYWORDS ---
const SMART_KEYWORDS = [
  // THE BIG 3
  { term: 'DeWalt', stores: ['all'] },
  { term: 'Milwaukee', stores: ['all'] },
  { term: 'Makita', stores: ['all'] },
  
  // PRO BRANDS
  { term: 'Flex 24V', stores: ['acme', 'lowes'] },
  { term: 'Metabo HPT', stores: ['amz', 'acme', 'lowes'] },
  { term: 'Kobalt 24v', stores: ['lowes'] }, 
  { term: 'Metabo', stores: ['amz', 'acme'] },
  { term: 'Werner', stores: ['all'] },
  { term: 'Gearwrench', stores: ['all'] },
  { term: 'Toughbuilt', stores: ['lowes'] },
  { term: 'Ryobi', stores: ['amz', 'hd'] },
  { term: 'Ridgid', stores: ['amz', 'hd'] },
  { term: 'Dremel', stores: ['all'] },
  { term: 'Kreg', stores: ['all'] },
  { term: 'Kaiweets', stores: ['amz'] },
  { term: 'Toolant', stores: ['amz'] },

  // OUTDOOR / OTHER
  { term: 'EGO', stores: ['amz', 'acme', 'ace', 'lowes'] },
  { term: 'Skil', stores: ['amz', 'acme', 'walmart', 'lowes'] }
];

// FIREBASE INIT
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

function getDealsCollection() {
  return db.collection('deals');
}

// --- HELPER: SEND GLITCH ALERT (VIA BREVO) ---
async function sendGlitchAlert(deal) {
  if (!process.env.BREVO_API_KEY) {
      console.log("⚠️ Skipping Email Alert: No BREVO_API_KEY found.");
      return;
  }

  console.log(`📧 Sending Glitch Alert via Brevo for: ${deal.title}`);
  
  try {
    // 1. Get all subscribers
    const snapshot = await db.collection('subscribers').get();
    if (snapshot.empty) {
        console.log("   x No subscribers found.");
        return;
    }

    // Brevo expects recipients in format: [{email: "a@b.com"}, {email: "c@d.com"}]
    // We send to BCC to hide emails from each other
    const recipients = snapshot.docs.map(doc => ({ email: doc.data().email || doc.id }));

    // 2. Prepare Data
    const data = {
        sender: { name: "Tool Deals Glitch Bot", email: "dealfinder@tooldealsdaily.com" },
        to: [{ email: "dealfinder@tooldealsdaily.com" }], // Main "To" (can be you)
        bcc: recipients, // Everyone else in BCC
        subject: `🔥 GLITCH DETECTED: ${deal.title}`,
        htmlContent: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h1 style="color: #dc2626;">🔥 GLITCH ALERT!</h1>
          <p>The bot just found a potential price error or fire sale.</p>
          
          <div style="border: 2px solid #eab308; padding: 15px; border-radius: 8px; background: #fffbeb;">
            <h2 style="margin-top: 0;">${deal.title}</h2>
            <p style="font-size: 18px;">
              <strong>Price:</strong> <span style="color: #dc2626;">$${deal.price}</span> 
              <span style="text-decoration: line-through; color: #666;">($${deal.originalPrice})</span>
            </p>
            <a href="${deal.url}" style="background-color: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">👉 GRAB IT NOW</a>
          </div>

          <p style="margin-top: 20px; font-size: 12px; color: #888;">
            *Act fast! Glitches can expire in minutes.<br>
            <a href="https://tooldealsdaily.com">View all deals</a>
          </p>
        </div>`
    };

    // 3. Send via Brevo API
    await axios.post('https://api.brevo.com/v3/smtp/email', data, {
        headers: {
            'accept': 'application/json',
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json'
        }
    });

    console.log(`✅ Brevo: Alert sent to ${recipients.length} subscribers.`);

  } catch (err) {
    console.error("❌ Brevo Email Error:", err.response?.data || err.message);
  }
}

// --- HELPER: SMART SAVE ---
async function saveSmartDeal(batch, docRef, data) {
  try {
    const docSnap = await docRef.get();
    
    // Default status to 'active' if not specified
    if (!data.status) data.status = 'active'; 

    data.lastSeen = Date.now();

    if (!docSnap.exists) {
      data.timestamp = Date.now();
      batch.set(docRef, data, { merge: true });

      // *** TRIGGER GLITCH ALERT FOR NEW ITEMS ***
      if (data.dealType === 'Glitch' || (data.title && data.title.toLowerCase().includes('glitch'))) {
          // Send alert asynchronously (don't await, so bot keeps running)
          sendGlitchAlert(data); 
      }

    } else {
      const oldData = docSnap.data();
      const oldPrice = parseFloat(oldData.price) || 0;
      const newPrice = parseFloat(data.price) || 0;

      // Protect custom images/data from being overwritten by nulls
      if (!data.image && oldData.image) delete data.image;

      // Update if price changed
      if (Math.abs(newPrice - oldPrice) > 0.01) {
         data.timestamp = Date.now();
         batch.set(docRef, data, { merge: true });
         
         // Optional: Alert on significant price drops for existing items?
         // For now, let's keep alerts only for NEW glitches to avoid spam.
         
      } else {
         delete data.timestamp; // Don't bump timestamp if price is same
         batch.set(docRef, data, { merge: true });
      }
    }
  } catch (err) {
    console.error("Smart Save Error:", err);
  }
}

// --- CATEGORIZATION & TYPE ---
function getDealType(title, description = '') {
  const t = (title + ' ' + description).toLowerCase();
  if (t.includes('buy one') || t.includes('get one') || t.includes('bogo')) return 'BOGO';
  if (t.includes('free tool') || t.includes('bonus tool')) return 'Free Gift';
  if (t.includes('combo') || t.includes('kit') || t.includes('bundle')) return 'Bundle';
  // Note: We don't auto-tag 'Glitch' here to be safe. 
  // You usually want to manually tag glitches via Admin, 
  // OR add specific logic (e.g. > 70% off) if you trust the data.
  return 'Sale'; 
}

function categorizeItem(title) {
  const t = title.toLowerCase();
  if (t.includes('battery') || t.includes('charger')) return 'Batteries';
  if (t.includes('bit set') || t.includes('blade')) return 'Accessories';
  if (t.includes('tool box') || t.includes('storage') || t.includes('organizer')) return 'Storage';
  if (t.includes('mower') || t.includes('blower') || t.includes('trimmer') || t.includes('chainsaw')) return 'Outdoor';
  if (t.includes('drill') || t.includes('driver') || t.includes('saw') || t.includes('impact') || t.includes('nailer')) return 'Power Tools';
  if (t.includes('socket') || t.includes('wrench') || t.includes('hammer')) return 'Hand Tools';
  return 'Other';
}

// --- FETCH FUNCTIONS ---

// 1. AMAZON
async function fetchAmazon() {
  console.log('📦 Fetching Amazon API...');
  const batch = db.batch();
  let count = 0;
  if (!amazonParams.AccessKey) return;
  try {
      for (const k of SMART_KEYWORDS) {
        if (!k.stores.includes('all') && !k.stores.includes('amz')) continue;
        const data = await amazon.SearchItems(amazonParams, {
            Keywords: k.term, SearchIndex: 'All', ItemCount: 10,
            Resources: ['Images.Primary.Large', 'ItemInfo.Title', 'Offers.Listings.Price', 'Offers.Listings.Availability.Type']
        });
        if (data.SearchResult?.Items) {
            for (const item of data.SearchResult.Items) {
              if (!item.Offers?.Listings[0]?.Price) continue;
              const price = parseFloat(item.Offers.Listings[0].Price.Amount);
              const originalPrice = price * 1.2; 
              const title = item.ItemInfo.Title.DisplayValue;
              const discount = ((originalPrice - price) / originalPrice) * 100;
              if (discount < MIN_DISCOUNT_PERCENT) continue;

              const docRef = getDealsCollection().doc(`amz-${item.ASIN}`);
              await saveSmartDeal(batch, docRef, {
                title: title, price: price, originalPrice: originalPrice, store: 'amz',
                category: categorizeItem(title), dealType: getDealType(title),
                url: item.DetailPageURL, image: item.Images.Primary.Large.URL,
                hot: true, status: 'active' 
              });
              count++;
            }
        }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (count > 0) await batch.commit();
      console.log(`✅ Amazon: Updated ${count} deals.`);
  } catch (e) { console.error("Amazon Error:", e.message); }
}

// 2. IMPACT (Home Depot, Acme, Ace)
async function fetchImpact() {
  console.log('🌍 Fetching Impact...');
  const batch = db.batch();
  let count = 0;
  try {
    for (const k of SMART_KEYWORDS) {
        const allowedStores = ['hd', 'acme', 'ace', 'walmart'];
        if (!k.stores.includes('all') && !k.stores.some(s => allowedStores.includes(s))) continue;
        
        try {
            const response = await axios.get(`https://api.impact.com/Mediapartners/${IMPACT_CONFIG.AccountSID}/Catalogs/ItemSearch`, {
              params: { Keyword: k.term, PageSize: 100 },
              auth: { username: IMPACT_CONFIG.AccountSID, password: IMPACT_CONFIG.AuthToken },
              headers: { 'Accept': 'application/json', 'IR-Version': '15' }
            });
            const items = response.data.Items || [];
            for (const item of items) {
              let storeCode = IMPACT_CONFIG.Campaigns[item.CampaignId];
              if (!storeCode) continue; 
              if (String(item.Stock).includes('out') || item.Stock === '0') continue;

              const price = parseFloat(item.CurrentPrice);
              let originalPrice = parseFloat(item.OriginalPrice) || price;
              if (((originalPrice - price) / originalPrice) * 100 < MIN_DISCOUNT_PERCENT) continue;

              const docRef = getDealsCollection().doc(`imp-${item.Id}`);
              await saveSmartDeal(batch, docRef, {
                title: item.Name, price: price, originalPrice: originalPrice, store: storeCode, 
                category: categorizeItem(item.Name), dealType: getDealType(item.Name),
                url: item.Url, image: item.ImageUrl, hot: true, status: 'active'
              });
              count++;
            }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 500));
    }
    if (count > 0) await batch.commit();
    console.log(`✅ Impact: Updated ${count} deals.`);
  } catch (e) { console.error("Impact Error:", e.message); }
}

// 3. LOWE'S (Via Google Search "Backdoor") -> DRAFTS
async function fetchLowes() {
  if (!APIFY_TOKEN) { 
      console.log('⚠️ Skipping Lowe\'s (No APIFY_TOKEN in .env)'); 
      return; 
  }
  console.log('🔵 Fetching Lowe\'s deals via Google Search...');
  
  // Pick 3 random keywords
  const lowesKeywords = SMART_KEYWORDS
    .filter(k => k.stores.includes('all') || k.stores.includes('lowes'))
    .map(k => k.term)
    .sort(() => 0.5 - Math.random()).slice(0, 3);

  for (const term of lowesKeywords) {
    const query = `${term} price site:lowes.com`;
    console.log(`   > Scanning: "${query}"`);
    
    let batch = db.batch(); 
    let count = 0;

    try {
      // Run the Official Google Search Scraper
      const run = await apifyClient.actor('apify/google-search-scraper').call({
          queries: query,       
          resultsPerPage: 20,   
          maxPagesPerQuery: 1,  
          countryCode: "us",
      });

      const { items: pages } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      
      for (const page of pages) {
          if (!page.organicResults) continue;

          for (const result of page.organicResults) {
              const title = result.title;
              const url = result.url;
              if (!title || !url) continue;

              // Price Detection Logic
              let priceString = null;
              if (result.richSnippet?.attributes) {
                  for (const attr of result.richSnippet.attributes) {
                      if (attr.name && attr.name.toLowerCase().includes('price')) {
                          priceString = attr.value;
                      }
                  }
              }
              if (!priceString && result.description) {
                  const match = result.description.match(/\$\s?[0-9,]+(?:\.[0-9]{2})?/);
                  if (match) priceString = match[0];
              }
              if (!priceString && title) {
                  const match = title.match(/\$\s?[0-9,]+(?:\.[0-9]{2})?/);
                  if (match) priceString = match[0];
              }

              if (!priceString) continue;

              const price = parseFloat(priceString.replace(/[^0-9.]/g, ''));
              let originalPrice = price;
              if (result.description) {
                  const wasMatch = result.description.match(/(?:was|list|reg)\.?\s?\$?([0-9,]+)/i);
                  if (wasMatch && wasMatch[1]) {
                      const wasPrice = parseFloat(wasMatch[1].replace(/,/g, ''));
                      if (wasPrice > price) originalPrice = wasPrice;
                  }
              }

              if (price < 10) continue; 

              const cleanId = (title.substring(0, 15) + price).replace(/[^a-zA-Z0-9]/g, ''); 
              const docRef = getDealsCollection().doc(`lowes-${cleanId}`);

              await saveSmartDeal(batch, docRef, {
                  title: title, 
                  price: price, 
                  originalPrice: originalPrice, 
                  store: 'lowes',
                  category: categorizeItem(title), 
                  dealType: getDealType(title),
                  url: url, 
                  image: null, 
                  hot: true, 
                  status: 'draft' 
              });
              count++;
          }
      }

      if (count > 0) {
          await batch.commit();
          console.log(`     ✅ Saved ${count} drafts for "${term}"`);
      } else {
          console.log(`     x No price data found for "${term}"`);
      }

    } catch (error) { 
        console.error(`     Apify Error for "${term}":`, error.message); 
    }
  }
}

async function run() {
  await fetchAmazon();
  await fetchImpact(); 
  await fetchLowes(); 
  console.log("🏁 All updates complete.");
}

run();