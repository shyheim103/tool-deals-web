import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const admin = require('firebase-admin');
const { Resend } = require('resend');
const serviceAccount = require('./service-account.json');

// --- CONFIG ---
const RESEND_API_KEY = process.env.RESEND_API_KEY; 
const SITE_URL = 'https://tooldealsdaily.com';

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
const resend = new Resend(RESEND_API_KEY);

async function getBestDeals() {
  console.log("🔍 Scanning for this week's top deals...");
  
  // 1. Get Top 3 Active Glitches
  const glitchSnapshot = await db.collection('deals')
    .where('dealType', '==', 'Glitch')
    .orderBy('timestamp', 'desc')
    .limit(3)
    .get();

  const glitches = glitchSnapshot.docs.map(doc => doc.data());

  // 2. Get Top 3 Deepest Discounts
  const saleSnapshot = await db.collection('deals')
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();

  let sales = saleSnapshot.docs.map(doc => {
    const d = doc.data();
    if (d.dealType === 'Glitch') return null; 
    const discount = ((d.originalPrice - d.price) / d.originalPrice) * 100;
    return { ...d, discount };
  }).filter(d => d !== null && d.discount > 0);

  sales.sort((a, b) => b.discount - a.discount);
  const topSales = sales.slice(0, 3);

  return { glitches, topSales };
}

function generateEmailHtml(glitches, topSales) {
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc;">
      <div style="background-color: #0f172a; padding: 25px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Tool<span style="color: #facc15;">Deals</span> Weekly</h1>
      </div>
      <div style="padding: 20px;">
        <p style="font-size: 16px; color: #334155; text-align: center; margin-bottom: 30px;">
          Here are the absolute best deals the bot found this week.
        </p>
  `;

  // GLITCH SECTION
  if (glitches.length > 0) {
    html += `<h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px; margin-bottom: 20px;">🔥 Active Glitches & Errors</h2>`;
    glitches.forEach(deal => {
      html += `
        <div style="background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 15px;">
            <img src="${deal.image}" alt="${deal.title}" style="max-width: 200px; max-height: 200px; width: 100%; height: auto; object-fit: contain;" />
          </div>
          
          <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #0f172a; line-height: 1.4;">${deal.title}</h3>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
            <div>
              <span style="font-size: 24px; font-weight: bold; color: #dc2626;">$${deal.price}</span>
              <span style="text-decoration: line-through; color: #94a3b8; margin-left: 8px; font-size: 14px;">$${deal.originalPrice}</span>
            </div>
            <a href="${deal.url}" style="background-color: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">VIEW GLITCH</a>
          </div>
        </div>
      `;
    });
  }

  // TOP DISCOUNTS SECTION
  if (topSales.length > 0) {
    html += `<h2 style="color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-top: 40px; margin-bottom: 20px;">💰 Biggest Price Drops</h2>`;
    topSales.forEach(deal => {
      html += `
        <div style="background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 15px;">
             <img src="${deal.image}" alt="${deal.title}" style="max-width: 200px; max-height: 200px; width: 100%; height: auto; object-fit: contain;" />
          </div>

          <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #0f172a; line-height: 1.4;">${deal.title}</h3>
          <p style="margin: 0 0 10px 0; color: #16a34a; font-weight: bold; font-size: 14px;">${Math.round(deal.discount)}% OFF</p>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
            <div>
              <span style="font-size: 24px; font-weight: bold; color: #0f172a;">$${deal.price}</span>
              <span style="text-decoration: line-through; color: #94a3b8; margin-left: 8px; font-size: 14px;">$${deal.originalPrice}</span>
            </div>
            <a href="${deal.url}" style="background-color: #0f172a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">VIEW DEAL</a>
          </div>
        </div>
      `;
    });
  }

  html += `
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <a href="${SITE_URL}" style="display: inline-block; background-color: #facc15; color: #0f172a; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold;">See All 500+ Deals on ToolDealsDaily.com</a>
          <p style="margin-top: 20px; color: #94a3b8; font-size: 12px;">You are receiving this because you signed up for glitch alerts.</p>
        </div>
      </div>
    </div>
  `;
  return html;
}

async function sendNewsletter() {
  try {
    const { glitches, topSales } = await getBestDeals();
    
    const snapshot = await db.collection('subscribers').get();
    if (snapshot.empty) {
      console.log("No subscribers found.");
      return;
    }

    const emails = snapshot.docs.map(doc => doc.id);
    const emailHtml = generateEmailHtml(glitches, topSales);

    console.log(`📧 Sending to ${emails.length} subscribers...`);

    let successCount = 0;
    let failCount = 0;

    for (const email of emails) {
        const { data, error } = await resend.emails.send({
          from: 'Tool Deals <updates@tooldealsdaily.com>',
          to: email,
          subject: `🔥 Weekly Glitch Report: ${glitches.length} Active Errors Found`,
          html: emailHtml
        });

        if (error) {
          console.error(`❌ Failed to send to ${email}:`, error);
          failCount++;
        } else {
          console.log(`✅ Sent to ${email}`);
          successCount++;
        }
    }

    console.log(`🏁 Done. Success: ${successCount}, Failed: ${failCount}`);
    
  } catch (error) {
    console.error("❌ Critical Error:", error);
    process.exit(1);
  }
}

sendNewsletter();