import { createRequire } from 'module';
const require = createRequire(import.meta.url);

require('dotenv').config();

const admin = require('firebase-admin');
const amazon = require('amazon-paapi');
const axios = require('axios');
const serviceAccount = require('./service-account.json');

// --- CONFIGURATION ---
const APP_ID = 'production'; 
const MIN_DISCOUNT_PERCENT = 15; 

// YOUR CHANNEL ID
const YOUTUBE_CHANNEL_ID = 'UCsHob-KhV7vfi-MyoXBMhDg'; 

const amazonParams = {
  AccessKey: process.env.AMAZON_ACCESS_KEY, 
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG, 
  PartnerType: 'Associates',
  Marketplace: 'www.amazon.com' 
};

const IMPACT_CONFIG = {
  AccountSID: 'IRUYAEiFA6CW1885322jxLbyaj6NkCYkE1', 
  AuthToken: 'JvVxNnAHFDdHGyBnJP5wAy_jAj9K_pjZ',   
  Campaigns: {
    '8154': 'hd',         
    '11565': 'acme',      
    '9988': 'ace',        
    '12894': 'tn',
    '9383': 'walmart'
  }
};

const CJ_CONFIG = {
  PersonalAccessToken: 'ofAvUhTCJdr_cQOULotcMXC7pw', 
  CompanyID: '2944530', 
  WebsiteID: '9162319', 
  Advertisers: { 
    'zoro': '4683856'
  } 
};

const AWIN_CONFIG = {
  ApiToken: '48e8f16f-a6dc-4eb0-9c8f-8414a5f7e019',
  PublisherId: '2052477',
  Advertisers: {
    'ohio': '89545'
  }
};

// --- SMART SEARCH KEYWORDS ---
const SMART_KEYWORDS = [
  { term: 'DeWalt 20V Kit', stores: ['all'] },
  { term: 'DeWalt XR', stores: ['all'] },
  { term: 'DeWalt PowerStack', stores: ['all'] },
  { term: 'Milwaukee M18 Fuel', stores: ['all'] },
  { term: 'Milwaukee M12 Fuel', stores: ['all'] },
  { term: 'Milwaukee Packout', stores: ['all'] },
  { term: 'Makita 18V LXT', stores: ['all'] },
  { term: 'Makita 40V XGT', stores: ['all'] },
  { term: 'Flex 24V', stores: ['acme', 'ohio', 'lowes'] },
  { term: 'Flex Stacked Lithium', stores: ['acme', 'ohio', 'lowes'] },
  { term: 'Flex Circular Saw', stores: ['acme', 'ohio', 'lowes'] },
  { term: 'Flex Impact Driver', stores: ['acme', 'ohio', 'lowes'] },
  { term: 'Metabo HPT MultiVolt', stores: ['amz', 'acme', 'ohio', 'lowes'] },
  { term: 'Metabo HPT Nailer', stores: ['amz', 'acme', 'ohio', 'lowes'] },
  { term: 'Bosch 18v', stores: ['all'] },
  { term: 'Gearwrench Set', stores: ['all'] },
  { term: 'Klein Tools', stores: ['all'] },
  { term: 'Ridgid 18v', stores: ['hd', 'direct', 'ohio'] }, 
  { term: 'Ryobi 18v One+', stores: ['hd', 'direct'] },
  { term: 'Ryobi 40v', stores: ['hd', 'direct'] },
  { term: 'Husky Tool Chest', stores: ['hd'] }, 
  { term: 'Husky Mechanics Set', stores: ['hd'] },
  { term: 'Kobalt 24v', stores: ['lowes'] }, 
  { term: 'Greenworks 60v', stores: ['walmart', 'amz'] },
  { term: 'Greenworks 80v', stores: ['walmart', 'amz'] },
  { term: 'Hart 20v', stores: ['walmart'] },
  { term: 'Hart Storage', stores: ['walmart'] },
  { term: 'Hyper Tough 20v', stores: ['walmart'] },
  { term: 'EGO Power+', stores: ['amz', 'acme', 'ace', 'lowes'] },
  { term: 'Skil PwrCore', stores: ['amz', 'acme', 'walmart'] }
];

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// --- HELPER: DEAL TYPE TAGGER ---
function getDealType(title, description = '') {
  const t = (title + ' ' + description).toLowerCase();
  if (t.includes('buy one') || t.includes('get one') || t.includes('bogo')) return 'BOGO';
  if (t.includes('free tool') || t.includes('free bare tool') || t.includes('bonus tool')) return 'Free Gift';
  if (t.includes('free battery') || t.includes('bonus battery')) return 'Free Gift';
  if (t.includes('combo') || t.includes('kit') || t.includes('bundle') || t.includes('value')) return 'Bundle';
  if (t.includes('buy more') || t.includes('save more')) return 'Buy More Save More';
  return 'Sale'; 
}

// --- HELPER: CATEGORIZATION ---
function categorizeItem(title) {
  const t = title.toLowerCase();
  if (t.includes('battery') || t.includes('charger') || t.includes('power pack')) return 'Batteries';
  if (t.includes('drill') || t.includes('driver') || t.includes('impact')) return 'Power Tools';
  if (t.includes('saw') || t.includes('grinder') || t.includes('sander')) return 'Power Tools';
  if (t.includes('nailer') || t.includes('stapler') || t.includes('combo')) return 'Power Tools';
  if (t.includes('vacuum') || t.includes('vac')) return 'Power Tools';
  if (t.includes('light') || t.includes('lamp') || t.includes('flood') || t.includes('spot')) return 'Lighting';
  if (t.includes('socket') || t.includes('ratchet') || t.includes('wrench')) return 'Hand Tools';
  if (t.includes('plier') || t.includes('screwdriver') || t.includes('hammer') || t.includes('mallet')) return 'Hand Tools';
  if (t.includes('tape') && t.includes('measure') || t.includes('level') || t.includes('square')) return 'Hand Tools';
  if (t.includes('mower') || t.includes('lawn')) return 'Outdoor';
  if (t.includes('blower') || t.includes('leaf')) return 'Outdoor';
  if (t.includes('trimmer') || t.includes('edger') || t.includes('weed') || t.includes('wacker')) return 'Outdoor';
  if (t.includes('chainsaw') || t.includes('chain saw') || t.includes('pruner')) return 'Outdoor';
  if (t.includes('washer') && t.includes('pressure')) return 'Outdoor';
  if (t.includes('sprayer')) return 'Outdoor';
  if (t.includes('box') || t.includes('storage') || t.includes('cabinet') || t.includes('chest')) return 'Storage';
  if (t.includes('bag') || t.includes('tote') || t.includes('bucket') || t.includes('organizer')) return 'Storage';
  if (t.includes('jacket') || t.includes('hoodie') || t.includes('gloves') || t.includes('heated')) return 'Apparel';
  if (t.includes('boot') || t.includes('shoe') || t.includes('glasses') || t.includes('helmet')) return 'Apparel';
  return 'Other';
}

function getDealsCollection() {
  return db.collection('deals');
}

// --- 3. AMAZON FETCH ---
async function fetchAmazon() {
  console.log('📦 Fetching Amazon API...');
  const batch = db.batch();
  let count = 0;
  if (!amazonParams.AccessKey) { console.log("⚠️ Skipping Amazon"); return; }
  try {
      for (const k of SMART_KEYWORDS) {
        if (!k.stores.includes('all') && !k.stores.includes('amz')) continue;
        try {
          const data = await amazon.SearchItems(amazonParams, {
            Keywords: k.term, SearchIndex: 'All', ItemCount: 5,
            Resources: ['Images.Primary.Large', 'ItemInfo.Title', 'Offers.Listings.Price']
          });
          if (data.SearchResult?.Items) {
            for (const item of data.SearchResult.Items) {
              if (!item.Offers?.Listings[0]?.Price) continue;
              const price = parseFloat(item.Offers.Listings[0].Price.Amount);
              const originalPrice = price * 1.2; 
              const title = item.ItemInfo.Title.DisplayValue;
              const dealType = getDealType(title);
              const discount = ((originalPrice - price) / originalPrice) * 100;
              
              if (dealType === 'Sale' && discount < MIN_DISCOUNT_PERCENT) continue;

              const docRef = getDealsCollection().doc(`amz-${item.ASIN}`);
              batch.set(docRef, {
                title: title, price: price, originalPrice: originalPrice, store: 'amz',
                category: categorizeItem(title), dealType: dealType,
                url: item.DetailPageURL, image: item.Images.Primary.Large.URL,
                timestamp: Date.now(), hot: true
              }, { merge: true });
              count++;
            }
          }
        } catch (err) { }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (count > 0) await batch.commit();
      console.log(`✅ Amazon: Updated ${count} deals.`);
  } catch (e) { console.error("Amazon Error:", e.message); }
}

// --- 4. IMPACT FETCH ---
async function fetchImpact() {
  console.log('🌍 Fetching Impact...');
  const batch = db.batch();
  let count = 0;
  try {
    for (const k of SMART_KEYWORDS) {
        const allowedStores = ['hd', 'acme', 'ace', 'walmart'];
        const isRelevant = k.stores.includes('all') || k.stores.some(s => allowedStores.includes(s));
        if (!isRelevant) continue; 
        try {
            const response = await axios.get(`https://api.impact.com/Mediapartners/${IMPACT_CONFIG.AccountSID}/Catalogs/ItemSearch`, {
              params: { Keyword: k.term, PageSize: 200 },
              auth: { username: IMPACT_CONFIG.AccountSID, password: IMPACT_CONFIG.AuthToken },
              headers: { 'Accept': 'application/json', 'IR-Version': '15' }
            });
            const items = response.data.Items || [];
            for (const item of items) {
              let storeCode = IMPACT_CONFIG.Campaigns[item.CampaignId];
              if (!storeCode) continue; 
              if (k.term === 'Husky' && storeCode !== 'hd') continue;

              const price = parseFloat(item.CurrentPrice);
              let originalPrice = parseFloat(item.OriginalPrice);
              if (!originalPrice || isNaN(originalPrice)) originalPrice = price;

              const dealType = getDealType(item.Name, item.Description);
              const discount = ((originalPrice - price) / originalPrice) * 100;

              if (dealType === 'Sale' && discount < MIN_DISCOUNT_PERCENT) continue;

              const docRef = getDealsCollection().doc(`imp-${item.Id}`);
              batch.set(docRef, {
                title: item.Name, price: price, originalPrice: originalPrice, store: storeCode, 
                category: categorizeItem(item.Name), dealType: dealType,
                url: item.Url, image: item.ImageUrl, timestamp: Date.now(), hot: true
              }, { merge: true });
              count++;
            }
        } catch (innerErr) { }
        await new Promise(r => setTimeout(r, 500));
    }
    if (count > 0) await batch.commit();
    console.log(`✅ Impact: Updated ${count} deals.`);
  } catch (e) { console.error("Impact Error:", e.message); }
}

// --- 5. CJ FETCH ---
async function fetchCJ() {
  console.log('🚀 Fetching CJ (Zoro)...');
  const batch = db.batch();
  let count = 0;
  
  const query = `query products($companyId: ID!, $partnerIds: [ID!], $keywords: [String!], $websiteId: ID!) {
      products(companyId: $companyId, partnerIds: $partnerIds, keywords: $keywords, limit: 100) {
        resultList { id title description price { amount } salePrice { amount } imageLink linkCode(pid: $websiteId) { clickUrl } advertiserId advertiserName }
      }
    }`;

  try {
    const advertiserIds = Object.values(CJ_CONFIG.Advertisers);
    const chunkSize = 5;
    for (let i = 0; i < SMART_KEYWORDS.length; i += chunkSize) {
        const chunkObjs = SMART_KEYWORDS.slice(i, i + chunkSize);
        const chunkTerms = chunkObjs
            .filter(k => k.stores.includes('all') || k.stores.includes('zoro'))
            .map(k => k.term);
        if (chunkTerms.length === 0) continue;

        try {
            const response = await axios.post('https://ads.api.cj.com/query', {
              query: query,
              variables: { companyId: CJ_CONFIG.CompanyID, websiteId: CJ_CONFIG.WebsiteID, partnerIds: advertiserIds, keywords: chunkTerms }
            }, { headers: { 'Authorization': `Bearer ${CJ_CONFIG.PersonalAccessToken}` } });
            
            const items = response.data.data?.products?.resultList || [];
            for (const item of items) {
              if (!item.linkCode?.clickUrl) continue; 
              if (item.advertiserId !== '4683856') continue; 

              let price = parseFloat(item.price.amount);
              let salePrice = item.salePrice?.amount ? parseFloat(item.salePrice.amount) : price;
              
              const discount = ((price - salePrice) / price) * 100;
              const dealType = getDealType(item.title, item.description);
              
              if (dealType === 'Sale' && discount < MIN_DISCOUNT_PERCENT) continue;

              const docRef = getDealsCollection().doc(`cj-${item.id}`);
              batch.set(docRef, {
                title: item.title, price: salePrice, originalPrice: price, store: 'zoro',
                category: categorizeItem(item.title), dealType: dealType,
                url: item.linkCode.clickUrl, image: item.imageLink,
                timestamp: Date.now(), hot: true
              }, { merge: true });
              count++;
            }
        } catch (chunkErr) { }
    }
    if (count > 0) await batch.commit();
    console.log(`✅ CJ: Updated ${count} deals.`);
  } catch (error) { console.error("CJ Error:", error.message); }
}

// --- 6. AWIN FETCH ---
async function fetchAwin() {
  console.log('🔧 Fetching Awin...');
  const batch = db.batch();
  let count = 0;
  try {
    for (const k of SMART_KEYWORDS) {
        if (!k.stores.includes('all') && !k.stores.includes('ohio')) continue;
        try {
            const response = await axios.get(`https://api.awin.com/publishers/${AWIN_CONFIG.PublisherId}/product-search`, {
              headers: { 'Authorization': `Bearer ${AWIN_CONFIG.ApiToken}` },
              params: { q: k.term, merchantId: AWIN_CONFIG.Advertisers.ohio, limit: 20 }
            });
            const items = response.data.products || [];
            for (const item of items) {
              const price = parseFloat(item.price);
              let originalPrice = item.rrp_price ? parseFloat(item.rrp_price) : price;
              if (originalPrice <= price) originalPrice = price * 1.5;
              
              const discount = ((originalPrice - price) / originalPrice) * 100;
              const dealType = getDealType(item.product_name, item.description);
              
              if (dealType === 'Sale' && discount < MIN_DISCOUNT_PERCENT) continue;

              const docRef = getDealsCollection().doc(`ohio-${item.product_id}`);
              batch.set(docRef, {
                title: item.product_name, price: price, originalPrice: originalPrice, store: 'ohio',
                category: categorizeItem(item.product_name), dealType: dealType,
                url: item.aw_deep_link, image: item.aw_image_url, timestamp: Date.now(), hot: true
              }, { merge: true });
              count++;
            }
        } catch (innerErr) { }
        await new Promise(r => setTimeout(r, 1000));
    }
    if (count > 0) await batch.commit();
    console.log(`✅ Awin: Updated ${count} deals.`);
  } catch (e) { console.error("Awin Error:", e.message); }
}

// --- 7. YOUTUBE FETCH (RSS) ---
async function fetchYouTube() {
  console.log('📺 Checking for new YouTube video...');
  
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
    const response = await axios.get(rssUrl);
    const xml = response.data;

    // Simple regex to grab the first (latest) video entry
    const videoIdMatch = xml.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
    const titleMatch = xml.match(/<media:title>(.*?)<\/media:title>/);

    if (videoIdMatch && titleMatch) {
      const videoId = videoIdMatch[1];
      const title = titleMatch[1];
      
      console.log(`   > Found Video: ${title} (${videoId})`);

      // Save to 'settings' collection
      await db.collection('settings').doc('featuredVideo').set({
        videoId: videoId,
        title: title,
        updatedAt: Date.now()
      });
      console.log('✅ YouTube: Featured video updated.');
    }
  } catch (e) {
    console.error("YouTube Error:", e.message);
  }
}

async function run() {
  await fetchAmazon();
  await fetchImpact(); 
  await fetchCJ();    
  await fetchAwin();
  await fetchYouTube();
  console.log("🏁 All updates complete.");
}

run();