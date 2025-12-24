import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const admin = require('firebase-admin');
const amazon = require('amazon-paapi');
const axios = require('axios');
const { ApifyClient } = require('apify-client'); 

const serviceAccount = require('./service-account.json');

// --- CONFIGURATION ---
const MIN_DISCOUNT_PERCENT = 15; 
const HIGH_DISCOUNT_ALERT_THRESHOLD = 50; 

// NETWORK IDS
const STORE_IDS = {
    ZORO: '4683856',         
    NORTHERN_TOOL: '1185635',
    OHIO_POWER: '78675'      
};

// API CLIENTS
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const apifyClient = new ApifyClient({ token: APIFY_TOKEN });

const amazonParams = {
  AccessKey: process.env.AMAZON_ACCESS_KEY, 
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG, 
  PartnerType: 'Associates',
  Marketplace: 'www.amazon.com' 
};

// SECURED IMPACT CONFIG
const IMPACT_CONFIG = {
  AccountSID: process.env.IMPACT_ACCOUNT_SID, 
  AuthToken: process.env.IMPACT_AUTH_TOKEN,   
  Campaigns: {
    '20845': 'hd',         
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
function getDealsCollection() { return db.collection('deals'); }

// --- HELPER: SAVE DEAL ---
async function saveSmartDeal(batch, docRef, data) {
  try {
    const docSnap = await docRef.get();
    if (!data.status) data.status = 'active'; 
    data.lastSeen = Date.now();

    if (!docSnap.exists) {
      data.timestamp = Date.now();
      batch.set(docRef, data, { merge: true });
    } else {
      const oldData = docSnap.data();
      // Only update if price changed or reactivating
      if (Math.abs(data.price - oldData.price) > 0.01) {
         if (oldData.status === 'expired') { data.status = 'active'; data.timestamp = Date.now(); }
         batch.set(docRef, data, { merge: true });
      } else {
         delete data.timestamp; // Don't bump timestamp if no change
         batch.set(docRef, data, { merge: true });
      }
    }
  } catch (err) { console.error("Save Error:", err); }
}

// --- 1. AMAZON ---
async function fetchAmazon() {
  console.log('📦 Fetching Amazon...');
  const batch = db.batch();
  if (!amazonParams.AccessKey) return;
  try {
      for (const k of SMART_KEYWORDS) {
        if (!k.stores.includes('all') && !k.stores.includes('amz')) continue;
        const data = await amazon.SearchItems(amazonParams, { Keywords: k.term, SearchIndex: 'All', ItemCount: 5, Resources: ['Images.Primary.Large', 'ItemInfo.Title', 'Offers.Listings.Price'] });
        if (data.SearchResult?.Items) {
            for (const item of data.SearchResult.Items) {
                if (!item.Offers?.Listings[0]?.Price) continue;
                const price = parseFloat(item.Offers.Listings[0].Price.Amount);
                const docRef = getDealsCollection().doc(`amz-${item.ASIN}`);
                await saveSmartDeal(batch, docRef, {
                    title: item.ItemInfo.Title.DisplayValue, price: price, originalPrice: price * 1.2, store: 'amz',
                    category: 'Power Tools', dealType: 'Sale', url: item.DetailPageURL, 
                    image: item.Images.Primary.Large.URL, hot: true, status: 'active'
                });
            }
        }
        await new Promise(r => setTimeout(r, 1500));
      }
      await batch.commit();
  } catch (e) { console.error("Amazon Error:", e.message); }
}

// --- 2. IMPACT (HD, Acme, Ace, Walmart) ---
async function fetchImpact() {
  console.log('🌍 Fetching Impact...');
  const batch = db.batch();
  if (!IMPACT_CONFIG.AccountSID) return;
  try {
    for (const k of SMART_KEYWORDS) {
        try {
            // ✅ BROAD SEARCH RESTORED (Acme & Ace will work again)
            const response = await axios.get(`https://api.impact.com/Mediapartners/${IMPACT_CONFIG.AccountSID}/Catalogs/ItemSearch`, {
              params: { Keyword: k.term, PageSize: 50 }, 
              auth: { username: IMPACT_CONFIG.AccountSID, password: IMPACT_CONFIG.AuthToken },
              headers: { 'Accept': 'application/json', 'IR-Version': '15' }
            });
            for (const item of response.data.Items || []) {
                
                // 🕵️ SPY: Prints "NEW CATALOG LIVE!" when ID 20845 finally appears
                if (item.CampaignId === '20845') {
                    console.log(`🚨 NEW CATALOG LIVE! ID=${item.CampaignId} | ${item.Url}`);
                }

                let storeCode = IMPACT_CONFIG.Campaigns[item.CampaignId];
                if (!storeCode) continue; // 🛡️ SAFETY: Ignores old 8154 deals automatically

                const price = parseFloat(item.CurrentPrice);
                const docRef = getDealsCollection().doc(`imp-${item.Id}`);
                await saveSmartDeal(batch, docRef, {
                    title: item.Name, price: price, originalPrice: parseFloat(item.OriginalPrice) || price,
                    store: storeCode, category: 'Power Tools', dealType: 'Sale', url: item.Url,
                    image: item.ImageUrl, hot: true, status: 'active'
                });
            }
        } catch (e) {}
    }
    await batch.commit();
  } catch (e) { console.error("Impact Error:", e.message); }
}

// --- 3. COMMISSION JUNCTION (Zoro, Northern Tool) ---
async function fetchCJ() {
    if (!process.env.CJ_DEVELOPER_KEY) return console.log("⚠️ Skipping CJ (No Key)");
    console.log('🔗 Fetching CJ (Zoro & Northern Tool)...');
    
    const stores = [
        { name: 'zoro', id: STORE_IDS.ZORO, limit: 3, strict: true }, 
        { name: 'northern', id: STORE_IDS.NORTHERN_TOOL, limit: 10, strict: false }
    ];

    const batch = db.batch();

    for (const store of stores) {
        for (const k of SMART_KEYWORDS) {
            if (!k.stores.includes('all') && !k.stores.includes(store.name)) continue;

            const searchTerm = store.strict ? `${k.term} Power Tool` : k.term; 
            try {
                const query = `
                {
                    products(companyId: "${process.env.CJ_COMPANY_ID}", partnerIds: ["${store.id}"], keywords: ["${searchTerm}"], limit: ${store.limit}) {
                        resultList {
                            id
                            title
                            price { amount }
                            salePrice { amount }
                            imageLink
                            linkCode(pid: "${process.env.CJ_WEBSITE_ID}") { clickUrl }
                        }
                    }
                }`;

                const response = await axios.post('https://ads.api.cj.com/query', { query }, {
                    headers: { 'Authorization': `Bearer ${process.env.CJ_DEVELOPER_KEY}` }
                });

                if (response.data.errors) { continue; }

                const items = response.data?.data?.products?.resultList || [];
                for (const item of items) {
                    const price = parseFloat(item.salePrice?.amount || item.price?.amount);
                    const orig = parseFloat(item.price?.amount || price);
                    const docRef = getDealsCollection().doc(`cj-${store.name}-${item.id}`);
                    await saveSmartDeal(batch, docRef, {
                        title: item.title, price: price, originalPrice: orig, store: store.name,
                        category: 'Power Tools', dealType: 'Sale', url: item.linkCode?.clickUrl || '',
                        image: item.imageLink, hot: true, status: 'active'
                    });
                }
            } catch (err) { console.error(`   x CJ Network Error (${store.name}): ${err.message}`); }
        }
    }
    await batch.commit();
}

// --- 4. TRACTOR SUPPLY (Apify - PERMISSIVE MODE) ---
async function fetchTractorSupply() {
    if (!APIFY_TOKEN) return console.log('⚠️ Skipping Tractor Supply (No APIFY_TOKEN)');
    console.log('🚜 Fetching Tractor Supply (Apify Scrape)...');
    
    const batch = db.batch();
    const keyTerms = ['DeWalt', 'Milwaukee', 'Tools']; 
    
    for (const term of keyTerms) {
        const query = `${term} price site:tractorsupply.com`;
        
        try {
            const run = await apifyClient.actor('apify/google-search-scraper').call({
                queries: query, resultsPerPage: 5, maxPagesPerQuery: 1, countryCode: "us",
            });
            const { items: pages } = await apifyClient.dataset(run.defaultDatasetId).listItems();

            for (const page of pages) {
                if (!page.organicResults) continue;
                for (const result of page.organicResults) {
                    if (!result.title.toLowerCase().includes(term.toLowerCase())) continue;
                    
                    let price = 0;
                    const priceMatch = (result.title + result.description).match(/\$\s?([0-9,]+(?:\.[0-9]{2})?)/);
                    if (priceMatch) {
                        price = parseFloat(priceMatch[1].replace(/,/g, ''));
                    }

                    const cleanId = (result.title.substring(0, 10) + price).replace(/[^a-zA-Z0-9]/g, '');
                    const docRef = getDealsCollection().doc(`ts-scrape-${cleanId}`);

                    console.log(`   + Saving Draft: ${result.title.substring(0, 30)}... ($${price})`);

                    await saveSmartDeal(batch, docRef, {
                        title: result.title,
                        price: price,
                        originalPrice: price > 0 ? price * 1.1 : 0, 
                        store: 'tractor-supply',
                        category: 'Outdoor', 
                        dealType: 'Sale',
                        url: result.url,
                        image: null, 
                        hot: true,
                        status: 'draft' 
                    });
                }
            }
        } catch (error) { console.error("TSC Scrape Error:", error.message); }
    }
    await batch.commit();
}

// --- 5. OHIO POWER TOOL (Apify Task - SMART PAGINATION) ---
async function fetchOhioPower() {
    if (!APIFY_TOKEN) return console.log('⚠️ Skipping Ohio Power (No APIFY_TOKEN)');
    
    const MY_AWIN_ID = '2052477'; 
    const MERCHANT_ID = '89545'; 

    const currentHour = new Date().getHours();
    if (currentHour !== 10) { 
       return console.log(`⏳ Skipping Ohio Power (Current hour is ${currentHour}, scheduled for 10)`); 
    }

    console.log('🔴 Fetching Ohio Power Tool (Smart Scrape)...');
    
    const batch = db.batch();

    const runInput = {
        "startUrls": [
            { "url": "https://www.ohiopowertool.com/price-drops" },
            { "url": "https://www.ohiopowertool.com/clearance" },
            { "url": "https://www.ohiopowertool.com/flash-sale" }
        ],
        "globs": [{ "glob": "https://www.ohiopowertool.com/*" }],
        "injectJQuery": true,
        "pageFunction": `async function pageFunction(context) {
            const { request, log, jQuery: $, waitFor, enqueueRequest } = context;
            
            // 1. WAIT FOR PRODUCTS
            let attempts = 0;
            while ($('.product-item').length === 0 && attempts < 5) {
                await new Promise(r => setTimeout(r, 1000));
                attempts++;
            }

            const results = [];
            $('.product-item').each((index, element) => {
                const el = $(element);
                const title = el.find('.product-item-link').text().trim();
                const url = el.find('.product-item-link').attr('href');
                const image = el.find('.product-image-photo').attr('src');
                
                let priceText = el.find('[data-price-type="finalPrice"] .price').first().text().trim();
                if (!priceText) priceText = el.find('.price-final_price .price').first().text().trim();
                const price = parseFloat(priceText.replace(/[$,]/g, '')) || 0;

                let originalPriceText = el.find('[data-price-type="oldPrice"] .price').first().text().trim();
                const originalPrice = parseFloat(originalPriceText.replace(/[$,]/g, '')) || price;

                if (price > 0 && url) { 
                     results.push({
                        title, price, originalPrice, url, image,
                        store: 'ohio-power', timestamp: Date.now(), available: true
                    });
                }
            });

            log.info(\`⚡ Found \${results.length} items on \${request.url}\`);

            // 2. PAGINATION
            if (results.length > 0) {
                const nextUrl = $('a.action.next').attr('href');
                if (nextUrl) {
                    await enqueueRequest({ url: nextUrl });
                }
            }

            return results;
        }`
    };

    try {
        const run = await apifyClient.actor('apify/web-scraper').call(runInput);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        console.log(`   + Found ${items.length} Ohio Power deals`);

        for (const item of items) {
            if (!item.url) continue;

            const slug = item.url.split('/').pop().replace(/[^a-zA-Z0-9]/g, '');
            const docRef = getDealsCollection().doc(`ohio-${slug}`);

            let finalUrl = item.url;
            if (MY_AWIN_ID) {
                 const encodedTarget = encodeURIComponent(item.url);
                 finalUrl = `https://www.awin1.com/cread.php?awinmid=${MERCHANT_ID}&awinaffid=${MY_AWIN_ID}&ued=${encodedTarget}`;
            }

            await saveSmartDeal(batch, docRef, {
                title: item.title,
                price: item.price,
                originalPrice: item.originalPrice,
                store: 'ohio-power',
                category: 'Power Tools',
                dealType: 'Sale',
                url: finalUrl,
                image: item.image,
                hot: true,
                status: 'active'
            });
        }
        await batch.commit();
    } catch (err) { console.error("Ohio Power Error:", err.message); }
}

// --- 6. LOWE'S (Apify) ---
async function fetchLowes() {
  if (!APIFY_TOKEN) return console.log('⚠️ Skipping Lowe\'s (No APIFY_TOKEN)'); 
  console.log('🔵 Fetching Lowe\'s...');
  const term = "DeWalt 20V Kit"; 
  const query = `${term} price site:lowes.com`;
  const batch = db.batch();

  try {
      const run = await apifyClient.actor('apify/google-search-scraper').call({
          queries: query, resultsPerPage: 10, maxPagesPerQuery: 1, countryCode: "us",
      });
      const { items: pages } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      
      for (const page of pages) {
          if (!page.organicResults) continue;
          for (const result of page.organicResults) {
              if (!result.title.includes('$')) continue;
              const priceMatch = result.title.match(/\$\s?([0-9,]+(?:\.[0-9]{2})?)/);
              if (!priceMatch) continue;
              const price = parseFloat(priceMatch[1].replace(/,/g, ''));
              
              const cleanId = (result.title.substring(0, 10) + price).replace(/[^a-zA-Z0-9]/g, '');
              const docRef = getDealsCollection().doc(`lowes-${cleanId}`);
              
              await saveSmartDeal(batch, docRef, {
                  title: result.title, price: price, originalPrice: price * 1.1,
                  store: 'lowes', category: 'Power Tools', dealType: 'Sale',
                  url: result.url, image: null, hot: true, status: 'draft'
              });
          }
      }
      await batch.commit();
  } catch (error) { console.error("Apify Error:", error.message); }
}

// --- 7. YOUTUBE AUTOMATION (RSS Feed) ---
async function fetchLatestVideo() {
    const CHANNEL_ID = 'UCsHob-KhV7vfi-MyoXBMhDg'; 

    console.log('📺 Checking for new YouTube videos...');
    try {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
        const response = await axios.get(rssUrl);
        const xml = response.data;

        const idMatch = xml.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
        const titleMatch = xml.match(/<title>(.*?)<\/title>/);

        if (idMatch && titleMatch) {
            const videoId = idMatch[1];
            const title = titleMatch[1];
            console.log(`   + Latest Video: ${title}`);

            await db.collection('settings').doc('featuredVideo').set({
                videoId: videoId, title: title, updatedAt: Date.now()
            });
        }
    } catch (e) { console.log('⚠️ YouTube Fetch Error:', e.message); }
}

// --- 8. CLEANUP WORKER (Expires dead deals) ---
async function cleanupExpiredDeals() {
    console.log('🧹 Running Cleanup Task...');
    const batch = db.batch();
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 Hours ago
    let expiredCount = 0;

    try {
        const snapshot = await getDealsCollection().where('status', '==', 'active').get();

        snapshot.forEach(doc => {
            const data = doc.data();
            // 🛡️ SAFETY CHECK: Only expire BOT deals.
            const isBotDeal = doc.id.startsWith('amz-') || doc.id.startsWith('imp-') || 
                              doc.id.startsWith('cj-') || doc.id.startsWith('ts-') || 
                              doc.id.startsWith('ohio-') || doc.id.startsWith('lowes-');

            if (isBotDeal && data.lastSeen < cutoff) {
                batch.update(doc.ref, { status: 'expired' });
                expiredCount++;
            }
        });

        if (expiredCount > 0) {
            await batch.commit();
            console.log(`🗑️ Expired ${expiredCount} dead deals.`);
        } else {
            console.log('✅ No dead deals found.');
        }
    } catch (err) { console.error("Cleanup Error:", err.message); }
}

// --- EMAIL WORKER ---
async function watchMailQueue() {
    if (!process.env.BREVO_API_KEY) return console.log('⚠️ Email Worker Skipped (No BREVO_API_KEY)');
    console.log('Dg Watching for Email Requests...');
    
    const mailRef = db.collection('mail_queue').where('status', '==', 'pending');
    mailRef.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const docId = change.doc.id;
                const data = change.doc.data();
                console.log(`📧 Processing Email Request: ${data.type}`);
                try {
                    if (data.type === 'test_preview') {
                        await sendBrevoEmail([ { email: data.recipient }], `[TEST] ${data.dealData.title}`, generateHtml(data.dealData));
                    } 
                    else if (data.type === 'single_blast') {
                        const subs = await getSubscribers();
                        await sendBrevoEmail(subs, `🔥 HOT DEAL: ${data.deal.title}`, generateHtml(data.deal));
                    } 
                    else if (data.type === 'batch_blast') {
                        const subs = await getSubscribers();
                        const subject = `🔥 Daily Roundup: ${data.deals.length} Deals`;
                        await sendBrevoEmail(subs, subject, generateBatchHtml(data.deals));
                    }
                    await db.collection('mail_queue').doc(docId).update({ status: 'sent', sentAt: Date.now() });
                    console.log(`✅ Email Sent & Doc Updated`);
                } catch (err) {
                    console.error("❌ Email Failed:", err.message);
                    await db.collection('mail_queue').doc(docId).update({ status: 'error', error: err.message });
                }
            }
        });
    });
}

// --- EMAIL HELPERS ---
async function getSubscribers() {
    const snap = await db.collection('subscribers').get();
    return snap.docs.map(d => ({ email: d.data().email || d.id })).filter(e => e.email.includes('@'));
}

async function sendBrevoEmail(recipients, subject, htmlContent) {
    const body = {
        sender: { name: "Tool Deals Bot", email: "dealfinder@tooldealsdaily.com" },
        to: [{ email: "dealfinder@tooldealsdaily.com" }],
        bcc: recipients,
        subject: subject,
        htmlContent: htmlContent
    };
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error("Brevo Error");
}
function generateHtml(deal) { return `<h1>${deal.title}</h1><p>Price: $${deal.price}</p><a href="${deal.url}">View Deal</a>`; }
function generateBatchHtml(deals) { return `<h1>Daily Roundup</h1>` + deals.map(d => `<div><h3>${d.title}</h3><p>$${d.price}</p><a href="${d.url}">Link</a></div>`).join(''); }

async function run() {
  watchMailQueue();

  await fetchLatestVideo();
  await fetchAmazon();
  await fetchImpact(); 
  await fetchCJ();        
  await fetchTractorSupply(); 
  await fetchOhioPower();
  await fetchLowes(); 

  await cleanupExpiredDeals(); // 🧹 RUNS LAST

  console.log("🏁 All updates complete. Bot is now listening for emails...");
}

run();