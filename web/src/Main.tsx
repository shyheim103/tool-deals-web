import React, { useState, useEffect } from 'react';
import { 
  collection, getDocs, addDoc, deleteDoc, doc, updateDoc, 
  query, orderBy, limit, setDoc, where, getDoc 
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth'; 
import { db, auth } from './firebase'; 
import { 
  Search, ExternalLink, Loader2, AlertCircle, Filter, X, 
  DollarSign, Zap, Trash2, Mail, Send, Edit, Clock, ShoppingCart, MinusCircle, UserCheck 
} from 'lucide-react';

// --- CONFIGURATION ---
const STORE_MAP: Record<string, string> = {
  'All Stores': 'all', 'Ace Hardware': 'ace', 'Acme Tools': 'acme', 'Amazon': 'amz',
  'Home Depot': 'hd', "Lowe's": 'lowes', 'Walmart': 'walmart'
};

const STORE_COLORS: Record<string, string> = {
  'zoro': 'bg-blue-600', 'amz': 'bg-yellow-500', 'acme': 'bg-red-500', 
  'hd': 'bg-orange-500', 'ace': 'bg-red-700', 'walmart': 'bg-[#0071DC]',
  'lowes': 'bg-[#004990]', 'northern': 'bg-blue-800'
};

const DEAL_TYPES = ['All Types', 'Glitch', 'Daily Deal', 'BOGO', 'Free Gift', 'Bundle', 'Sale'];
const BRANDS = ['All Brands', 'Bosch', 'Craftsman', 'DeWalt', 'EGO', 'Flex', 'Gearwrench', 'Greenworks', 'Hart', 'Husky', 'Hyper Tough', 'Klein', 'Kobalt', 'Makita', 'Metabo HPT', 'Milwaukee', 'Ridgid', 'Ryobi', 'Skil'];

const CASH_BACK_APPS = [
  { name: 'Rakuten', url: 'https://www.rakuten.com/r/CHRISH3992?eeid=45830', color: 'bg-purple-600', offer: 'Get $50 Bonus' },
  { name: 'TopCashback', url: 'https://www.topcashback.com/ref/tool%20deals', color: 'bg-red-600', offer: 'Get $15 Bonus' },
  { name: 'Capital One', url: 'capitaloneshopping.com/r/29c6b616-3e4a-4951-9cdf-f3991d7bb2cc', color: 'bg-blue-800', offer: 'Get $80 Bonus!' },
  { name: 'RetailMeNot', url: 'www.retailmenot.com', color: 'bg-purple-800', offer: 'Cash Back' },
];

interface Deal {
  id?: string; title: string; price: number; originalPrice: number;
  url: string; image: string; category: string; dealType: string;
  store: string; hot: boolean; timestamp: number; status?: string; 
}

function getTimeAgo(timestamp: number) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Main() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [glitchDeals, setGlitchDeals] = useState<Deal[]>([]);
  const [draftDeals, setDraftDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [featuredVideo, setFeaturedVideo] = useState<{videoId: string, title: string} | null>(null);

  // FILTERS
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeStore, setActiveStore] = useState('All Stores');
  const [activeBrand, setActiveBrand] = useState('All Brands');
  const [activeDealType, setActiveDealType] = useState('All Types');
  const [searchQuery, setSearchQuery] = useState('');
  const [minPrice, setMinPrice] = useState<number | ''>('');
  const [maxPrice, setMaxPrice] = useState<number | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const [dealLimit, setDealLimit] = useState(50);

  // NEWSLETTER
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  // ADMIN STATE
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState('post'); 
  
  // FORM STATE
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [url, setUrl] = useState('');
  const [image, setImage] = useState('');
  const [category, setCategory] = useState('Power Tools');
  const [dealType, setDealType] = useState('Sale'); 
  const [store, setStore] = useState('amz');
  const [addToBatch, setAddToBatch] = useState(false); 
  
  // NEW: TEST EMAIL STATE
  const [testEmailAddress, setTestEmailAddress] = useState('dealfinder@tooldealsdaily.com');

  // EMAIL BATCH STATE
  const [emailBatch, setEmailBatch] = useState<Deal[]>([]);

  // DRAFT EDITING
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftAffiliateLink, setDraftAffiliateLink] = useState('');
  const [draftImage, setDraftImage] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [draftOriginalPrice, setDraftOriginalPrice] = useState('');

  // --- AUTO LOGIN ---
  useEffect(() => {
    signInAnonymously(auth).catch((error) => console.error("Auth Error:", error));
  }, []);

  // --- INIT ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') setIsAdmin(true);
    fetchVideo();
  }, []);

  // --- AUTO-CHECK BATCH FOR URGENT DEALS ---
  useEffect(() => {
    if (dealType === 'Glitch' || dealType === 'Daily Deal') {
        setAddToBatch(true);
    } else {
        setAddToBatch(false);
    }
  }, [dealType]);

  const fetchVideo = async () => {
    try {
      const docRef = doc(db, 'settings', 'featuredVideo');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) { setFeaturedVideo(docSnap.data() as any); }
    } catch (e) { console.log("No video config found"); }
  };

  // --- FETCH DEALS ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let effectiveLimit = dealLimit;
        if (searchQuery.trim().length > 0) effectiveLimit = 500;
        
        let constraints: any[] = [orderBy('timestamp', 'desc'), limit(effectiveLimit)];
        if (activeStore !== 'All Stores') constraints.push(where('store', '==', STORE_MAP[activeStore]));
        if (activeCategory !== 'All') constraints.push(where('category', '==', activeCategory));
        
        const q = query(collection(db, 'deals'), ...constraints);
        const snapshot = await getDocs(q);
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Deal[];
        
        setDeals(items.filter(d => d.status !== 'draft'));

        const qGlitch = query(collection(db, 'deals'), where('dealType', '==', 'Glitch'), where('status', '==', 'active'), orderBy('timestamp', 'desc'), limit(20));
        const snapGlitch = await getDocs(qGlitch);
        setGlitchDeals(snapGlitch.docs.map(d => ({ id: d.id, ...d.data() } as Deal)));

        if (isAdmin) {
            const qDrafts = query(collection(db, 'deals'), where('status', '==', 'draft'), orderBy('timestamp', 'desc'));
            const snapDrafts = await getDocs(qDrafts);
            setDraftDeals(snapDrafts.docs.map(d => ({ id: d.id, ...d.data() } as Deal)));
        }

      } catch (error) { console.error("Error fetching deals:", error); }
      setLoading(false);
    };
    fetchData();
  }, [dealLimit, activeStore, activeCategory, searchQuery, isAdmin]);

  // --- HELPER: CONSTRUCT EMAIL BODY ---
  const getEmailPayload = (recipients: any[], subject: string, html: string) => {
      return {
          sender: { name: "Tool Deals Bot", email: "dealfinder@tooldealsdaily.com" },
          to: [{ email: "dealfinder@tooldealsdaily.com" }], 
          bcc: recipients, 
          subject: subject,
          htmlContent: html
      };
  };

  // --- ACTION: SEND TEST PREVIEW (Current Form Data) ---
  const sendTestPreview = async () => {
    if (!testEmailAddress) return alert("Please enter a test email address!");
    const API_KEY = process.env.REACT_APP_BREVO_API_KEY || "";
    if (!API_KEY) return alert("❌ API KEY MISSING! Check .env file.");

    try {
        const dealData = { title, price: parseFloat(price) || 0, originalPrice: parseFloat(originalPrice) || 0, url, store, image };
        
        const subjectLine = `[TEST] ${dealType}: ${title}`;
        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h1 style="color: #ca8a04;">🧪 TEST EMAIL PREVIEW</h1>
              <div style="border: 2px solid #ca8a04; padding: 15px; border-radius: 8px; background: #fffbeb; text-align: center;">
                ${dealData.image ? `<img src="${dealData.image}" style="max-width: 100%; max-height: 250px; margin-bottom: 15px; object-fit: contain;" />` : ''}
                <h2 style="margin-top: 0; text-align: left;">${dealData.title}</h2>
                <p style="font-size: 18px; text-align: left;">
                  <strong>Price:</strong> <span style="color: #dc2626;">$${dealData.price}</span> 
                  <span style="text-decoration: line-through; color: #666;">($${dealData.originalPrice})</span>
                </p>
                <p style="text-align: left;">Store: ${dealData.store}</p>
                <div style="text-align: left; margin-top: 15px;">
                    <a href="${dealData.url}" style="background-color: #ca8a04; color: black; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">👉 VIEW DEAL</a>
                </div>
              </div>
            </div>`;

        const body = getEmailPayload([{ email: testEmailAddress }], subjectLine, html);

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'accept': 'application/json', 'api-key': API_KEY, 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || "Brevo Rejected Request");
        }
        alert(`✅ Test Email Sent to ${testEmailAddress}`);
    } catch (e: any) { alert("❌ TEST FAILED: " + e.message); }
  };

  // --- ACTION: SEND BATCH EMAIL ---
  const sendBatchEmail = async () => {
    if (emailBatch.length === 0) return alert("Batch is empty!");
    if (!window.confirm("Are you sure you want to blast this batch to ALL subscribers?")) return;
    
    const API_KEY = process.env.REACT_APP_BREVO_API_KEY || ""; 
    try {
        const snapshot = await getDocs(collection(db, 'subscribers'));
        
        // --- SANITIZATION LOGIC ---
        const recipients = snapshot.docs
            .map(doc => {
                const data = doc.data();
                const rawEmail = data.email || doc.id;
                if (rawEmail && typeof rawEmail === 'string' && rawEmail.includes('@') && rawEmail.includes('.')) {
                    return { email: rawEmail.trim() };
                }
                return null;
            })
            .filter(r => r !== null);

        if (recipients.length === 0) return alert("No VALID subscribers found!");

        const firstTitle = emailBatch[0].title.split(' ').slice(0, 4).join(' ');
        const countText = emailBatch.length > 1 ? ` + ${emailBatch.length - 1} more deals` : '';
        const subjectLine = `🔥 Daily Roundup: ${firstTitle}...${countText}`;

        const itemsHtml = emailBatch.map(item => `
            <div style="border-bottom: 1px solid #eee; padding: 15px 0; display: flex; flex-direction: column; align-items: center;">
                ${item.image ? `<img src="${item.image}" style="max-width: 100%; max-height: 180px; margin-bottom: 15px; object-fit: contain;" />` : ''}
                <div style="width: 100%; text-align: left;">
                    <h3 style="margin: 0 0 5px 0;">${item.title}</h3>
                    <p style="margin: 0 0 10px 0;">
                        <strong style="color: #dc2626; font-size: 16px;">$${item.price}</strong> 
                        <span style="text-decoration: line-through; color: #888;">$${item.originalPrice}</span>
                        <span style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; margin-left: 10px;">${item.store}</span>
                    </p>
                    <a href="${item.url}" style="background-color: #ca8a04; color: black; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px; display: inline-block;">View Deal</a>
                </div>
            </div>
        `).join('');

        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #ca8a04; text-align: center;">🔥 Daily Deal Roundup</h1>
              <div style="border: 2px solid #ca8a04; padding: 20px; border-radius: 8px; background: #fff;">${itemsHtml}</div>
              <p style="text-align: center; margin-top: 30px; font-size: 12px; color: #888;">
                 <a href="https://tooldealsdaily.com">View all deals on website</a>
              </p>
            </div>`;

        const body = getEmailPayload(recipients, subjectLine, html);

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'accept': 'application/json', 'api-key': API_KEY, 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }

        alert(`✅ Roundup Sent to ${recipients.length} subscribers!`);
        setEmailBatch([]); 
    } catch (e: any) { alert("❌ BATCH FAILED: " + e.message); }
  };

  // --- ACTION: HANDLE POST DEAL (With Option to Blast Immediately) ---
  const handlePostDeal = async (e: React.FormEvent, shouldBlast: boolean) => {
    e.preventDefault();
    if (!title || !price || !url) return alert("Missing Fields!");
    if (shouldBlast && !window.confirm("WARNING: You are about to email ALL subscribers about this single deal. Proceed?")) return;

    const newDeal: any = {
      title, price: parseFloat(price), originalPrice: parseFloat(originalPrice) || parseFloat(price),
      url, image: image || "https://placehold.co/600x400/red/white?text=HOT+DEAL&font=roboto", 
      category, dealType, store, hot: true, timestamp: Date.now(), status: 'active'
    };

    try {
      const docRef = await addDoc(collection(db, 'deals'), newDeal);
      
      if (addToBatch) {
          setEmailBatch(prev => [...prev, { ...newDeal, id: docRef.id }]);
          alert("Deal Posted & Added to Batch! 🛒");
          setTitle(''); setPrice(''); setOriginalPrice(''); setUrl(''); setImage(''); setAddToBatch(false);
          return;
      }

      if (shouldBlast) {
          const snapshot = await getDocs(collection(db, 'subscribers'));
          // --- SANITIZATION LOGIC ---
          const recipients = snapshot.docs
            .map(doc => {
                const data = doc.data();
                const rawEmail = data.email || doc.id;
                if (rawEmail && typeof rawEmail === 'string' && rawEmail.includes('@') && rawEmail.includes('.')) {
                    return { email: rawEmail.trim() };
                }
                return null;
            })
            .filter(r => r !== null);

          if (recipients.length === 0) {
              alert("Deal Posted, but NO EMAILS SENT (No valid subscribers found).");
              window.location.reload();
              return;
          }
          
          const subjectLine = `🔥 HOT DEAL: ${newDeal.title}`;
          const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h1 style="color: #dc2626;">🔥 HOT DEAL ALERT</h1>
              <div style="border: 2px solid #dc2626; padding: 15px; border-radius: 8px; background: #fffbeb; text-align: center;">
                <img src="${newDeal.image}" style="max-width: 100%; max-height: 300px; margin-bottom: 20px; object-fit: contain;" />
                <h2 style="margin-top: 0; text-align: left;">${newDeal.title}</h2>
                <p style="font-size: 18px; text-align: left;">
                  <strong>Price:</strong> <span style="color: #dc2626;">$${newDeal.price}</span> 
                  <span style="text-decoration: line-through; color: #666;">($${newDeal.originalPrice})</span>
                </p>
                <div style="text-align: left; margin-top: 15px;">
                    <a href="${newDeal.url}" style="background-color: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">👉 VIEW DEAL</a>
                </div>
              </div>
            </div>`;
          
          const API_KEY = process.env.REACT_APP_BREVO_API_KEY || "";
          const response = await fetch('https://api.brevo.com/v3/smtp/email', {
             method: 'POST',
             headers: { 'accept': 'application/json', 'api-key': API_KEY, 'content-type': 'application/json' },
             body: JSON.stringify(getEmailPayload(recipients, subjectLine, html))
          });
          
          if (!response.ok) throw new Error("Brevo Error");
          alert(`✅ Deal Posted & Emailed to ${recipients.length} people!`);
      } else {
          alert("✅ Deal Posted!");
      }

      window.location.reload(); 
    } catch (error: any) { 
        alert("Error: " + error.message);
    }
  };

  const handlePublishDraft = async (deal: Deal) => {
    if (!draftAffiliateLink) return alert("Paste affiliate link first!");
    try {
        await updateDoc(doc(db, 'deals', deal.id!), {
            url: draftAffiliateLink,
            image: draftImage || deal.image,
            price: draftPrice ? parseFloat(draftPrice) : deal.price,
            originalPrice: draftOriginalPrice ? parseFloat(draftOriginalPrice) : deal.originalPrice,
            status: 'active', timestamp: Date.now()
        });
        setEditingDraftId(null); setDraftAffiliateLink(''); setDraftImage(''); setDraftPrice(''); setDraftOriginalPrice('');
        window.location.reload();
    } catch (err) { alert("Error publishing: " + err); }
  };

  const handleDelete = async (id: string) => {
    if(!window.confirm("Delete this deal?")) return;
    await deleteDoc(doc(db, 'deals', id));
    window.location.reload();
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return alert("Enter valid email");
    try {
      await setDoc(doc(db, 'subscribers', email), { email, joinedAt: Date.now() });
      setSubscribed(true); setEmail(''); setTimeout(() => setSubscribed(false), 5000);
    } catch (err) {}
  };

  const filteredDeals = deals.filter(deal => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (deal.title?.toLowerCase() || '').includes(searchLower) || (deal.store?.toLowerCase() || '').includes(searchLower);
    if (!matchesSearch) return false;
    if (activeStore !== 'All Stores' && deal.store !== STORE_MAP[activeStore]) return false;
    if (activeCategory !== 'All' && deal.category !== activeCategory) return false;
    if (activeBrand !== 'All Brands' && !deal.title.toLowerCase().includes(activeBrand.toLowerCase())) return false;
    if (activeDealType !== 'All Types') {
       if (activeDealType === 'Sale') { if (deal.dealType && deal.dealType !== 'Sale') return false; } 
       else { if (deal.dealType !== activeDealType) return false; }
    }
    if (minPrice !== '' && deal.price < Number(minPrice)) return false;
    if (maxPrice !== '' && deal.price > Number(maxPrice)) return false;
    return true;
  });

  const storeList = ['All Stores', ...Object.keys(STORE_MAP).filter(s => s !== 'All Stores').sort()];
  const sortedAdminStores = Object.entries(STORE_MAP).filter(([n, c]) => c !== 'all').sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <img src="/logo.png" alt="ToolDeals" className="h-10 w-10 rounded-full object-cover border border-gray-200" />
            <span className="text-xl font-bold tracking-tight text-gray-900 hidden sm:block">Tool<span className="text-yellow-500">Deals</span></span>
          </div>
          <div className="flex-1 max-w-2xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search tools..." className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-full focus:ring-2 focus:ring-yellow-400 outline-none transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className="lg:hidden p-2 bg-gray-100 rounded-full hover:bg-gray-200">{showFilters ? <X className="w-5 h-5" /> : <Filter className="w-5 h-5" />}</button>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-slate-800 text-white p-6 border-b-4 border-yellow-500">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Zap className="text-yellow-400" /> Admin Manager</h2>
                <div className="flex bg-slate-700 rounded-lg p-1">
                    <button onClick={() => setAdminTab('post')} className={`px-4 py-1 rounded transition-colors ${adminTab === 'post' ? 'bg-slate-600 font-bold' : 'text-slate-400 hover:text-white'}`}>Post New</button>
                    <button onClick={() => setAdminTab('drafts')} className={`px-4 py-1 rounded flex items-center gap-2 transition-colors ${adminTab === 'drafts' ? 'bg-slate-600 font-bold' : 'text-slate-400 hover:text-white'}`}>
                        Review Drafts {draftDeals.length > 0 && <span className="bg-red-500 text-white text-xs px-2 rounded-full animate-pulse">{draftDeals.length}</span>}
                    </button>
                </div>
            </div>

            {/* --- TEST EMAIL INPUT --- */}
            <div className="bg-slate-900 border border-slate-600 p-3 rounded mb-4 flex items-center gap-3">
                <UserCheck className="text-slate-400" />
                <label className="text-slate-400 text-xs">Test Email:</label>
                <input 
                    value={testEmailAddress} 
                    onChange={e => setTestEmailAddress(e.target.value)} 
                    className="bg-slate-800 text-white px-2 py-1 rounded border border-slate-600 text-sm flex-1"
                />
            </div>

            {/* --- EMAIL BATCH CART --- */}
            {emailBatch.length > 0 && (
                <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-yellow-400 flex items-center gap-2"><ShoppingCart /> Ready to Blast ({emailBatch.length})</h3>
                        <div className="flex gap-2">
                            <button onClick={() => sendTestPreview()} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-2 rounded flex items-center gap-2">
                                🧪 Send Test to Me
                            </button>
                            <button onClick={() => sendBatchEmail()} className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-2 rounded flex items-center gap-2">
                                <Send className="w-4 h-4" /> Send to ALL 🚀
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {emailBatch.map((item, idx) => (
                            <div key={idx} className="bg-slate-900 border border-slate-600 rounded px-3 py-1 flex items-center gap-2 text-xs">
                                <span className="text-white truncate max-w-[150px]">{item.title}</span>
                                <button onClick={() => setEmailBatch(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-200"><MinusCircle className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {adminTab === 'post' ? (
              <form onSubmit={e => handlePostDeal(e, false)} className="space-y-4 bg-slate-700 p-4 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-xs text-slate-400 mb-1">Deal Title</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-yellow-500 outline-none" placeholder="Title..." value={title} onChange={e => setTitle(e.target.value)} /></div>
                    <div><label className="block text-xs text-slate-400 mb-1">Affiliate Link</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-yellow-500 outline-none" placeholder="URL..." value={url} onChange={e => setUrl(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label className="block text-xs text-slate-400 mb-1">Sale Price</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-yellow-500 outline-none" type="number" placeholder="99.00" value={price} onChange={e => setPrice(e.target.value)} /></div>
                    <div><label className="block text-xs text-slate-400 mb-1">Original Price</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-yellow-500 outline-none" type="number" placeholder="199.00" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)} /></div>
                    <div><label className="block text-xs text-slate-400 mb-1">Image URL</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-yellow-500 outline-none" placeholder="Image..." value={image} onChange={e => setImage(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Store</label>
                        <select className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-yellow-500 outline-none" value={store} onChange={e => setStore(e.target.value)}>
                            {sortedAdminStores.map(([n, c]) => <option key={c} value={c}>{n}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Deal Type</label>
                        <select className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-yellow-500 outline-none" value={dealType} onChange={e => setDealType(e.target.value)}>
                            <option value="Sale">🏷️ Regular Sale</option>
                            <option value="Daily Deal">🚨 Daily Deal (24h)</option>
                            <option value="Glitch">🔥 Glitch / Error</option>
                            <option value="BOGO">🎁 BOGO / Free Gift</option>
                            <option value="Clearance">📉 Clearance</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-600 h-[42px]">
                        <input type="checkbox" id="emailChk" checked={addToBatch} onChange={e => setAddToBatch(e.target.checked)} className="w-5 h-5 text-yellow-500 rounded cursor-pointer" />
                        <label htmlFor="emailChk" className="text-yellow-400 font-bold text-sm cursor-pointer select-none">Add to Email Batch? 🛒</label>
                    </div>
                </div>

                {/* --- NEW BUTTON ROW --- */}
                <div className="flex gap-2 pt-2">
                    <button 
                        type="button" 
                        onClick={() => sendTestPreview()} 
                        className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-4 rounded text-sm flex-1 flex items-center justify-center gap-2"
                    >
                        🧪 Send Test Preview
                    </button>

                    <button 
                        type="submit" 
                        className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded text-lg flex-[2] shadow-lg hover:shadow-xl transition-all"
                    >
                        POST DEAL
                    </button>

                    {!addToBatch && (
                         <button 
                            type="button" 
                            onClick={(e) => handlePostDeal(e, true)} 
                            className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded text-sm flex-1 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
                         >
                            🔥 Post & Blast to ALL
                         </button>
                    )}
                </div>
              </form>
            ) : (
               <div className="bg-slate-700 p-4 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto">
                 {draftDeals.map(draft => (
                    <div key={draft.id} className="bg-slate-900 p-4 rounded border border-slate-600 flex flex-col gap-3">
                        <div className="flex gap-3">
                            <img src={draft.image} className="w-16 h-16 object-contain bg-white rounded" />
                            <div className="flex-1">
                                <h4 className="font-bold text-sm line-clamp-2">{draft.title}</h4>
                                <span className="text-yellow-400 font-bold">${draft.price}</span>
                            </div>
                        </div>
                        {editingDraftId === draft.id ? (
                            <div className="space-y-2">
                                <input className="w-full p-2 text-black text-xs rounded" placeholder="Affiliate Link" value={draftAffiliateLink} onChange={e=>setDraftAffiliateLink(e.target.value)} />
                                <input className="w-full p-2 text-black text-xs rounded" placeholder="Edit Price" value={draftPrice} onChange={e=>setDraftPrice(e.target.value)} />
                                <div className="flex gap-2">
                                    <button onClick={() => handlePublishDraft(draft)} className="flex-1 bg-green-600 text-xs py-1 rounded">Publish</button>
                                    <button onClick={() => setEditingDraftId(null)} className="flex-1 bg-gray-600 text-xs py-1 rounded">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-2 mt-auto">
                                <a href={draft.url} target="_blank" className="text-xs text-blue-400">Source</a>
                                <button onClick={() => { setEditingDraftId(draft.id!); setDraftAffiliateLink(''); setDraftImage(draft.image); setDraftPrice(String(draft.price)); setDraftOriginalPrice(String(draft.originalPrice)); }} className="flex-1 bg-yellow-500 text-black text-xs py-1 rounded font-bold"><Edit className="w-3 h-3 inline" /> Edit</button>
                                <button onClick={() => handleDelete(draft.id!)} className="bg-red-900 text-white p-1 rounded"><Trash2 className="w-3 h-3" /></button>
                            </div>
                        )}
                    </div>
                 ))}
               </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-8 flex-1 w-full">
        {/* SIDEBAR */}
        <aside className={`lg:w-64 flex-shrink-0 space-y-8 ${showFilters ? 'block' : 'hidden lg:block'}`}>
          <div><h3 className="font-bold text-gray-900 mb-3">Deal Type</h3><div className="flex flex-col gap-2">{DEAL_TYPES.map(type => (<label key={type} className="flex items-center gap-2 cursor-pointer group"><div className={`w-4 h-4 rounded-full border flex items-center justify-center ${activeDealType === type ? 'border-yellow-500 bg-yellow-500' : 'border-gray-300 bg-white'}`}>{activeDealType === type && <div className="w-1.5 h-1.5 bg-white rounded-full" />}</div><input type="radio" name="dealType" className="hidden" checked={activeDealType === type} onChange={() => setActiveDealType(type)} /><span className="text-sm text-gray-700">{type}</span></label>))}</div></div>
          <div><h3 className="font-bold text-gray-900 mb-3">Price Range</h3><div className="flex items-center gap-2"><input type="number" placeholder="Min" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" value={minPrice} onChange={(e) => setMinPrice(e.target.value ? Number(e.target.value) : '')} /><span className="text-gray-400">-</span><input type="number" placeholder="Max" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : '')} /></div></div>
          <div><h3 className="font-bold text-gray-900 mb-3">Brand</h3><select value={activeBrand} onChange={(e) => setActiveBrand(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm cursor-pointer">{BRANDS.map(brand => (<option key={brand} value={brand}>{brand}</option>))}</select></div>
        </aside>

        <div className="flex-1">
          {/* GLITCHES */}
          {glitchDeals.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4 bg-red-600 text-white p-3 rounded-lg shadow-md animate-pulse">
                <Zap className="w-6 h-6 fill-yellow-400 text-yellow-400" />
                <h2 className="text-lg font-extrabold uppercase tracking-wider">Active Glitches & Fire Sales</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {glitchDeals.map(deal => (
                  <div key={deal.id} className="bg-white border-2 border-red-500 rounded-xl p-4 flex items-center gap-4 shadow-lg hover:shadow-xl transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Glitch</div>
                    {isAdmin && <button onClick={(e) => { e.preventDefault(); handleDelete(deal.id!); }} className="absolute bottom-2 right-2 bg-slate-800 text-white p-2 rounded hover:bg-red-600 z-50"><Trash2 className="w-4 h-4" /></button>}
                    <a href={deal.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 w-full">
                        <img src={deal.image} alt={deal.title} className="w-24 h-24 object-contain" onError={(e: any) => {e.target.src = 'https://placehold.co/400x400/red/white?text=GLITCH+DEAL&font=roboto'}} />
                        <div>
                        <h3 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-red-600 transition-colors">{deal.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded font-bold uppercase">{deal.store}</span>
                            <span className="flex items-center gap-1 bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded font-bold uppercase animate-pulse">🔥 Live Now</span>
                        </div>
                        <div className="mt-2 font-bold text-red-600 flex items-center gap-1">Check Price <ExternalLink className="w-4 h-4" /></div>
                        </div>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EMAIL SUBSCRIBE */}
          <div className="bg-slate-900 rounded-xl p-6 mb-8 text-center md:text-left flex flex-col md:flex-row items-center gap-6 shadow-xl border border-slate-700">
             <div className="flex-1">
                <h3 className="text-white font-bold text-xl flex items-center justify-center md:justify-start gap-2"><Mail className="text-yellow-400 w-6 h-6" /> Get Glitch Alerts Instantly</h3>
                <p className="text-slate-400 text-sm mt-1">Don't miss the next price error. We'll email you the second a new glitch or fire sale drops.</p>
             </div>
             <form onSubmit={handleSubscribe} className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
                {subscribed ? <div className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 w-full md:w-80">✅ You're on the list!</div> : (
                   <>
                     <input type="email" placeholder="Enter your email..." className="px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-yellow-400 w-full md:w-64" value={email} onChange={(e) => setEmail(e.target.value)} />
                     <button type="submit" className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors">Subscribe <Send className="w-4 h-4" /></button>
                   </>
                )}
             </form>
          </div>

          {/* FEATURED VIDEO */}
          {featuredVideo && (
            <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg mb-8">
              <div className="flex flex-col md:flex-row">
                <div className="p-6 flex flex-col justify-center md:w-1/3"><span className="text-yellow-400 font-bold text-xs uppercase tracking-wider mb-2">Latest Update</span><h2 className="text-white text-xl font-bold mb-3 line-clamp-2">{featuredVideo.title}</h2><p className="text-slate-300 text-sm mb-4">Watch my latest breakdown of the best deals available right now.</p><a href={`https://www.youtube.com/watch?v=${featuredVideo.videoId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white font-bold hover:text-yellow-400 transition-colors">Watch on YouTube <ExternalLink className="w-4 h-4" /></a></div>
                <div className="md:w-2/3 bg-black relative aspect-video md:aspect-auto"><iframe className="absolute inset-0 w-full h-full" src={`https://www.youtube.com/embed/${featuredVideo.videoId}`} title="Tool Deals Video" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe></div>
              </div>
            </div>
          )}

          {/* CASH BACK APPS */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-8">
            <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5 text-yellow-600" />
                <h3 className="font-bold text-yellow-900 text-sm uppercase tracking-wide">Stack Your Savings (Free Cash Back)</h3>
            </div>
            <p className="text-sm text-yellow-800 mb-4">Don't forget to save even more with these FREE cash back sites/extensions. Sign up to get bonuses!</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CASH_BACK_APPS.map((app) => (
                <a key={app.name} href={app.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center bg-white border border-yellow-200 p-3 rounded-lg hover:shadow-md transition-all group">
                  <span className={`text-xs font-bold text-white px-2 py-0.5 rounded mb-1 ${app.color}`}>{app.name}</span>
                  <span className="text-[10px] font-medium text-gray-500 group-hover:text-gray-700">{app.offer}</span>
                </a>
              ))}
            </div>
          </div>

          {/* DEALS LIST */}
          <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-100 pb-4">
            {storeList.map(storeName => (
               <button key={storeName} onClick={() => setActiveStore(storeName)} className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${activeStore === storeName ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-gray-200 hover:border-slate-300'}`}>{storeName}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
            {['All', 'Power Tools', 'Hand Tools', 'Outdoor', 'Accessories', 'Storage'].map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all border ${activeCategory === cat ? 'bg-yellow-400 text-slate-900 border-yellow-400 shadow-md' : 'bg-white text-slate-500 border-gray-200 hover:border-gray-300'}`}>{cat}</button>
            ))}
          </div>
          
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-yellow-400" /></div>
          ) : filteredDeals.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300"><AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-gray-500">No deals found matching your filters.</p><button onClick={() => {setActiveCategory('All'); setActiveBrand('All Brands'); setActiveStore('All Stores'); setMinPrice(''); setMaxPrice(''); setSearchQuery('')}} className="mt-4 text-yellow-600 font-bold text-sm hover:underline">Clear all filters</button></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
                {filteredDeals.map((deal) => (
                  <div key={deal.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all group flex flex-col relative h-full">
                    <div className="relative h-48 p-4 flex items-center justify-center bg-white border-b border-gray-100">
                      <span className={`absolute top-3 left-3 z-10 ${STORE_COLORS[deal.store] || 'bg-gray-600'} text-white text-[10px] font-bold px-2 py-1 rounded uppercase shadow-sm`}>{deal.store}</span>
                      <span className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm text-gray-500 text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-gray-100 flex items-center gap-1">🕒 {getTimeAgo(deal.timestamp)}</span>
                      {deal.dealType && deal.dealType !== 'Sale' && <span className={`absolute bottom-3 left-3 z-10 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm ${deal.dealType === 'Daily Deal' ? 'bg-blue-600' : 'bg-red-600'}`}>{deal.dealType}</span>}
                      {isAdmin && <button onClick={(e) => { e.preventDefault(); handleDelete(deal.id!); }} className="absolute bottom-2 right-2 bg-slate-800 text-white p-2 rounded hover:bg-red-600 z-50"><Trash2 className="w-4 h-4" /></button>}
                      <img src={deal.image} alt={deal.title} className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300" onError={(e: any) => {e.target.src = 'https://placehold.co/400x400?text=No+Image'}} />
                    </div>
                    <div className="p-4 flex flex-col flex-1 bg-white">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 line-clamp-2 mb-2 text-sm h-10 leading-tight" title={deal.title}>{deal.title}</h3>
                      </div>
                      <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-400 line-through">${Number(deal.originalPrice).toFixed(2)}</span>
                          <span className="text-2xl font-bold text-gray-900">${Number(deal.price).toFixed(2)}</span>
                        </div>
                        <a href={deal.url} target="_blank" rel="noopener noreferrer" className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">View <ExternalLink className="w-3 h-3" /></a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {!searchQuery && (
                <div className="flex justify-center pb-12">
                    <button onClick={() => setDealLimit(prev => prev + 50)} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 px-8 rounded-full shadow-sm transition-all flex items-center gap-2">
                     Load More Deals
                    </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <p className="text-xs text-gray-500">ToolDealsDaily.com is a participant in the Amazon Services LLC Associates Program...</p>
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Tool Deals Daily. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}