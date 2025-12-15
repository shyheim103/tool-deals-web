import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getFirestore, collection, onSnapshot, query, doc, addDoc, deleteDoc, updateDoc, limit, orderBy, where, setDoc, getDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, User } from 'firebase/auth';
import { Search, ExternalLink, Loader2, AlertCircle, Filter, X, DollarSign, Zap, Trash2, PlusCircle, Mail, Send, Edit, CheckCircle } from 'lucide-react';

// --- CONFIGURATION ---
const getFirebaseConfig = () => {
  try {
    if ((globalThis as any).__firebase_config) return JSON.parse((globalThis as any).__firebase_config);
    return {
      apiKey: "AIzaSyD2439CzuRoCareQ0vPi0VXoXxqpUpPyfE",
      authDomain: "tool-deals.firebaseapp.com",
      projectId: "tool-deals",
      storageBucket: "tool-deals.firebasestorage.app",
      messagingSenderId: "730059424612",
      appId: "1:730059424612:web:09892614c1d0e4e8b83071",
      measurementId: "G-7D7K3F2PPW"
    };
  } catch (e) { return {}; }
};

const app = initializeApp(getFirebaseConfig());
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// --- CONSTANTS ---
const STORE_MAP: Record<string, string> = {
  'All Stores': 'all', 'Ace Hardware': 'ace', 'Acme Tools': 'acme', 'Amazon': 'amz',
  'Home Depot': 'hd', "Lowe's": 'lowes', 'Walmart': 'walmart'
};
const STORE_COLORS: Record<string, string> = {
  'zoro': 'bg-blue-600', 'amz': 'bg-yellow-500', 'acme': 'bg-red-500', 
  'hd': 'bg-orange-500', 'ace': 'bg-red-700', 'walmart': 'bg-[#0071DC]',
  'lowes': 'bg-[#004990]', 'northern': 'bg-blue-800'
};
const DEAL_TYPES = ['All Types', 'Glitch', 'BOGO', 'Free Gift', 'Bundle', 'Sale'];
const BRANDS = ['All Brands', 'Bosch', 'Craftsman', 'DeWalt', 'EGO', 'Flex', 'Gearwrench', 'Greenworks', 'Hart', 'Husky', 'Hyper Tough', 'Klein', 'Kobalt', 'Makita', 'Metabo HPT', 'Milwaukee', 'Ridgid', 'Ryobi', 'Skil'];
const CASH_BACK_APPS = [
  { name: 'Rakuten', url: 'YOUR_RAKUTEN_LINK', color: 'bg-purple-600', offer: 'Get $50 Bonus' },
  { name: 'TopCashback', url: 'YOUR_TOPCASHBACK_LINK', color: 'bg-red-600', offer: 'Get $40 Bonus' },
  { name: 'Capital One', url: 'YOUR_CAPONE_LINK', color: 'bg-blue-800', offer: 'Get $60 Bonus' },
  { name: 'RetailMeNot', url: 'YOUR_RETAILMENOT_LINK', color: 'bg-purple-800', offer: 'Cash Back' },
];

interface Deal {
  id: string; title: string; price: number; originalPrice: number; 
  store: string; category: string; dealType?: string; 
  url: string; image: string; timestamp: number;
  status?: string; // 'active' or 'draft'
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
  const [user, setUser] = useState<User | null>(null);
  const [feedDeals, setFeedDeals] = useState<Deal[]>([]);
  const [glitchDealsDB, setGlitchDealsDB] = useState<Deal[]>([]);
  const [draftDeals, setDraftDeals] = useState<Deal[]>([]); // FOR ADMIN

  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [featuredVideo, setFeaturedVideo] = useState<{videoId: string, title: string} | null>(null);

  // NEWSLETTER STATE
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

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

  // ADMIN STATE
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState('post'); // 'post' or 'drafts'
  
  // Admin Form
  const [adminTitle, setAdminTitle] = useState('');
  const [adminUrl, setAdminUrl] = useState('');
  const [adminStore, setAdminStore] = useState('lowes');
  const [adminType, setAdminType] = useState('Glitch');
  const [adminPrice, setAdminPrice] = useState<string>('0');
  const [adminOrigPrice, setAdminOrigPrice] = useState<string>('0');
  const [adminImage, setAdminImage] = useState('');

  // Draft Editing State
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftAffiliateLink, setDraftAffiliateLink] = useState('');
  const [draftImage, setDraftImage] = useState(''); // <--- IMAGE URL STATE
  const [draftPrice, setDraftPrice] = useState(''); // <--- PRICE EDIT STATE
  const [draftOriginalPrice, setDraftOriginalPrice] = useState(''); // <--- ORIG PRICE EDIT STATE

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = (globalThis as any).__initial_auth_token;
        if (token) await signInWithCustomToken(auth, token);
        else await signInAnonymously(auth);
      } catch (err: any) { console.error(err); }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    logEvent(analytics, 'page_view');
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') setIsAdmin(true);
  }, []);

  // --- FETCH 1: ACTIVE DEALS (Where status != 'draft') ---
  useEffect(() => {
    let effectiveLimit = dealLimit;
    const isSearchMode = searchQuery.trim().length > 0;
    if (isSearchMode) { effectiveLimit = 500; if (!isSearching) setIsSearching(true); } 
    else { setIsSearching(false); }

    if (effectiveLimit === 50 && !isSearchMode) setLoading(true);
    else setIsLoadingMore(true);

    let constraints: any[] = [orderBy('timestamp', 'desc'), limit(effectiveLimit)];

    if (activeStore !== 'All Stores') constraints.push(where('store', '==', STORE_MAP[activeStore]));
    if (activeCategory !== 'All') constraints.push(where('category', '==', activeCategory));

    const q = query(collection(db, 'deals'), ...constraints);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Deal[];
      // Client-side filter for 'draft' status to be safe (if index missing)
      const activeItems = items.filter(d => d.status !== 'draft');
      setFeedDeals(activeItems);
      setLoading(false);
      setIsLoadingMore(false);
    });
    return () => unsubscribe();
  }, [user, dealLimit, activeStore, activeCategory, searchQuery]);

  // --- FETCH 2: GLITCH FEED ---
  useEffect(() => {
    const q = query(collection(db, 'deals'), where('dealType', '==', 'Glitch'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Deal[];
      setGlitchDealsDB(items.filter(d => d.status !== 'draft').sort((a, b) => b.timestamp - a.timestamp));
    });
    return () => unsubscribe();
  }, [user]);

  // --- FETCH 3: DRAFTS (Admin Only) ---
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'deals'), where('status', '==', 'draft'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Deal[];
      setDraftDeals(items);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const docRef = doc(db, 'settings', 'featuredVideo');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) { setFeaturedVideo(docSnap.data() as any); }
      } catch (e) { console.log("No video config found"); }
    };
    fetchVideo();
  }, []);

  // --- ADMIN ACTIONS ---
  const handleAddDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!adminTitle || !adminUrl) return alert("Fill in title and URL");
    let finalImage = adminImage;
    if (!finalImage) finalImage = "https://placehold.co/600x400/red/white?text=HOT+DEAL&font=roboto";
    const newDeal = {
      title: adminType === 'Glitch' ? `🔥 ${adminTitle}` : adminTitle,
      price: parseFloat(adminPrice) || 0,
      originalPrice: parseFloat(adminOrigPrice) || 0,
      store: adminStore, category: 'Power Tools', dealType: adminType,
      url: adminUrl, image: finalImage,
      timestamp: Date.now(), hot: true, status: 'active'
    };
    try {
        await addDoc(collection(db, 'deals'), newDeal);
        alert(`${adminType} Posted!`);
        setAdminTitle(''); setAdminUrl(''); setAdminPrice('0'); setAdminOrigPrice('0'); setAdminImage('');
    } catch (err) { alert("Error posting: " + err); }
  };

  const handlePublishDraft = async (deal: Deal) => {
    if (!draftAffiliateLink) return alert("Paste your affiliate link first!");
    try {
        await updateDoc(doc(db, 'deals', deal.id), {
            url: draftAffiliateLink,
            image: draftImage || deal.image,
            // Use manual price if provided, else keep existing
            price: draftPrice ? parseFloat(draftPrice) : deal.price,
            originalPrice: draftOriginalPrice ? parseFloat(draftOriginalPrice) : deal.originalPrice,
            status: 'active', // Make it visible
            timestamp: Date.now() // Bump to top
        });
        setEditingDraftId(null);
        setDraftAffiliateLink('');
        setDraftImage(''); 
        setDraftPrice('');
        setDraftOriginalPrice('');
    } catch (err) { alert("Error publishing: " + err); }
  };

  const handleDeleteDeal = async (id: string) => {
    if(window.confirm("Delete this deal?")) await deleteDoc(doc(db, 'deals', id));
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return alert("Please enter a valid email.");
    try {
      await setDoc(doc(db, 'subscribers', email), { email: email, joinedAt: Date.now() });
      setSubscribed(true); setEmail(''); setTimeout(() => setSubscribed(false), 5000);
    } catch (err) {}
  };

  // --- SEPARATE FILTER LOGIC ---
  const glitchDeals = glitchDealsDB; 

  const regularDeals = feedDeals.filter(deal => {
    if (deal.dealType === 'Glitch') return false;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (deal.title?.toLowerCase() || '').includes(searchLower) || (deal.store?.toLowerCase() || '').includes(searchLower);
    if (!matchesSearch) return false;
    if (activeStore !== 'All Stores' && deal.store?.toLowerCase() !== STORE_MAP[activeStore]) return false;
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

  const sortedAdminStores = Object.entries(STORE_MAP).filter(([n, c]) => c !== 'all').sort((a, b) => a[0].localeCompare(b[0]));
  const storeList = ['All Stores', ...Object.keys(STORE_MAP).filter(s => s !== 'All Stores').sort()];

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

            {adminTab === 'post' ? (
              <form onSubmit={handleAddDeal} className="space-y-4 bg-slate-700 p-4 rounded-lg">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1"><label className="block text-xs text-gray-400 mb-1">Deal Title</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-white" placeholder="Flex 24V Kit..." value={adminTitle} onChange={e => setAdminTitle(e.target.value)} /></div>
                    <div className="flex-1"><label className="block text-xs text-gray-400 mb-1">Affiliate URL</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-white" placeholder="https://..." value={adminUrl} onChange={e => setAdminUrl(e.target.value)} /></div>
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="w-32"><label className="block text-xs text-gray-400 mb-1">Sale Price</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-white" type="number" value={adminPrice} onChange={e => setAdminPrice(e.target.value)} /></div>
                    <div className="w-32"><label className="block text-xs text-gray-400 mb-1">Orig. Price</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-white" type="number" value={adminOrigPrice} onChange={e => setAdminOrigPrice(e.target.value)} /></div>
                    <div className="flex-1"><label className="block text-xs text-gray-400 mb-1">Image URL</label><input className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-white" placeholder="https://image.lowes.com/..." value={adminImage} onChange={e => setAdminImage(e.target.value)} /></div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="w-full md:w-1/3"><label className="block text-xs text-gray-400 mb-1">Store</label><select className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-white" value={adminStore} onChange={e => setAdminStore(e.target.value)}>{sortedAdminStores.map(([name, code]) => (<option key={code} value={code}>{name}</option>))}</select></div>
                    <div className="w-full md:w-1/3"><label className="block text-xs text-gray-400 mb-1">Type</label><select className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-white" value={adminType} onChange={e => setAdminType(e.target.value)}><option value="Glitch">🔥 Glitch (Pinned Top)</option><option value="Sale">🏷️ Regular Sale</option><option value="BOGO">🎁 BOGO</option></select></div>
                    <button type="submit" className="w-full md:w-1/3 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded flex items-center justify-center gap-2"><PlusCircle className="w-4 h-4" /> Post Deal</button>
                </div>
              </form>
            ) : (
              <div className="bg-slate-700 p-4 rounded-lg grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                {draftDeals.length === 0 ? <div className="col-span-full text-center py-10 text-slate-400 italic">No pending drafts from bot.</div> : draftDeals.map(draft => (
                    <div key={draft.id} className="bg-slate-900 p-4 rounded border border-slate-600 flex flex-col gap-3 shadow-lg">
                        <div className="flex gap-3">
                            <img src={draft.image} className="w-20 h-20 object-contain bg-white rounded border border-gray-200" />
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-sm text-white line-clamp-2 leading-tight mb-1" title={draft.title}>{draft.title}</h4>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-yellow-400 font-bold text-lg">${draft.price}</span>
                                    {draft.originalPrice > draft.price && <span className="text-slate-500 text-xs line-through">${draft.originalPrice}</span>}
                                </div>
                                <div className="text-xs text-slate-400 mt-1 capitalize">{draft.category}</div>
                            </div>
                        </div>
                        
                        {editingDraftId === draft.id ? (
                            <div className="space-y-2 mt-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                <input className="w-full p-2 text-black text-sm rounded border-2 border-yellow-400 focus:outline-none" placeholder="Paste Affiliate Link..." value={draftAffiliateLink} onChange={e=>setDraftAffiliateLink(e.target.value)} autoFocus />
                                
                                {/* --- UPDATED: PRICE EDIT INPUTS --- */}
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-[10px] text-gray-400 uppercase font-bold">Sale Price</label>
                                        <input type="number" className="w-full p-2 text-black text-sm rounded border border-slate-600 bg-slate-800 text-white" value={draftPrice} onChange={e=>setDraftPrice(e.target.value)} />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] text-gray-400 uppercase font-bold">Orig Price</label>
                                        <input type="number" className="w-full p-2 text-black text-sm rounded border border-slate-600 bg-slate-800 text-white" value={draftOriginalPrice} onChange={e=>setDraftOriginalPrice(e.target.value)} />
                                    </div>
                                </div>

                                {/* --- IMAGE INPUT --- */}
                                <input 
                                    className="w-full p-2 text-black text-sm rounded border border-slate-600 focus:outline-none bg-slate-800 text-white placeholder-slate-400" 
                                    placeholder="Image URL (Optional)..." 
                                    value={draftImage} 
                                    onChange={e=>setDraftImage(e.target.value)} 
                                />

                                <div className="flex gap-2">
                                    <button onClick={() => handlePublishDraft(draft)} className="flex-1 bg-green-600 hover:bg-green-500 py-1.5 rounded text-sm font-bold text-white transition-colors">Publish</button>
                                    <button onClick={() => setEditingDraftId(null)} className="px-4 bg-gray-600 hover:bg-gray-500 py-1.5 rounded text-sm text-white transition-colors">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-2 mt-auto pt-2 border-t border-slate-800">
                                <a href={draft.url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs text-blue-400 font-bold flex items-center justify-center transition-colors">Source</a>
                                <button onClick={() => {
                                    setEditingDraftId(draft.id); 
                                    setDraftAffiliateLink(''); 
                                    setDraftImage(draft.image || ''); 
                                    setDraftPrice(String(draft.price)); // <--- PRE-FILL PRICE
                                    setDraftOriginalPrice(String(draft.originalPrice)); // <--- PRE-FILL ORIG PRICE
                                }} className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-slate-900 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition-colors"><Edit className="w-3 h-3" /> Add Link</button>
                                <button onClick={() => handleDeleteDeal(draft.id)} className="bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white p-1.5 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-8 flex-1 w-full">
        <aside className={`lg:w-64 flex-shrink-0 space-y-8 ${showFilters ? 'block' : 'hidden lg:block'}`}>
          <div><h3 className="font-bold text-gray-900 mb-3">Deal Type</h3><div className="flex flex-col gap-2">{DEAL_TYPES.map(type => (<label key={type} className="flex items-center gap-2 cursor-pointer group"><div className={`w-4 h-4 rounded-full border flex items-center justify-center ${activeDealType === type ? 'border-yellow-500 bg-yellow-500' : 'border-gray-300 bg-white'}`}>{activeDealType === type && <div className="w-1.5 h-1.5 bg-white rounded-full" />}</div><input type="radio" name="dealType" className="hidden" checked={activeDealType === type} onChange={() => setActiveDealType(type)} /><span className="text-sm text-gray-700">{type}</span></label>))}</div></div>
          <div><h3 className="font-bold text-gray-900 mb-3">Price Range</h3><div className="flex items-center gap-2"><input type="number" placeholder="Min" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" value={minPrice} onChange={(e) => setMinPrice(e.target.value ? Number(e.target.value) : '')} /><span className="text-gray-400">-</span><input type="number" placeholder="Max" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : '')} /></div></div>
          <div><h3 className="font-bold text-gray-900 mb-3">Brand</h3><select value={activeBrand} onChange={(e) => setActiveBrand(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm cursor-pointer">{BRANDS.map(brand => (<option key={brand} value={brand}>{brand}</option>))}</select></div>
        </aside>

        <div className="flex-1">
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
                    {isAdmin && <button onClick={(e) => { e.preventDefault(); handleDeleteDeal(deal.id); }} className="absolute bottom-2 right-2 bg-slate-800 text-white p-2 rounded hover:bg-red-600 z-50"><Trash2 className="w-4 h-4" /></button>}
                    <a href={deal.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 w-full">
                        <img src={deal.image} alt={deal.title} className="w-24 h-24 object-contain" onError={(e: any) => {e.target.src = 'https://placehold.co/600x400/red/white?text=GLITCH+DEAL&font=roboto'}} />
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

          {featuredVideo && (
            <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg mb-8">
              <div className="flex flex-col md:flex-row">
                <div className="p-6 flex flex-col justify-center md:w-1/3"><span className="text-yellow-400 font-bold text-xs uppercase tracking-wider mb-2">Latest Update</span><h2 className="text-white text-xl font-bold mb-3 line-clamp-2">{featuredVideo.title}</h2><p className="text-slate-300 text-sm mb-4">Watch my latest breakdown of the best deals available right now.</p><a href={`https://www.youtube.com/watch?v=${featuredVideo.videoId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white font-bold hover:text-yellow-400 transition-colors">Watch on YouTube <ExternalLink className="w-4 h-4" /></a></div>
                <div className="md:w-2/3 bg-black relative aspect-video md:aspect-auto"><iframe className="absolute inset-0 w-full h-full" src={`https://www.youtube.com/embed/${featuredVideo.videoId}`} title="Tool Deals Video" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe></div>
              </div>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-8">
            <div className="flex items-center gap-2 mb-3"><DollarSign className="w-5 h-5 text-yellow-600" /><h3 className="font-bold text-yellow-900 text-sm uppercase tracking-wide">Stack Your Savings (Free Cash Back)</h3></div>
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
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">{activeCategory === 'All' ? "Today's Deals" : `${activeCategory} Deals`}</h2>
            <span className="text-sm font-medium text-gray-500">{regularDeals.length} results</span>
          </div>
          
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-yellow-400" /></div>
          ) : regularDeals.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300"><AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-gray-500">No deals found matching your filters.</p><button onClick={() => {setActiveCategory('All'); setActiveBrand('All Brands'); setActiveStore('All Stores'); setMinPrice(''); setMaxPrice(''); setSearchQuery('')}} className="mt-4 text-yellow-600 font-bold text-sm hover:underline">Clear all filters</button></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
                {regularDeals.map((deal) => (
                  <div key={deal.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all group flex flex-col relative h-full">
                    <div className="relative h-48 p-4 flex items-center justify-center bg-white border-b border-gray-100">
                      <span className={`absolute top-3 left-3 z-10 ${STORE_COLORS[deal.store] || 'bg-gray-600'} text-white text-[10px] font-bold px-2 py-1 rounded uppercase shadow-sm`}>{deal.store}</span>
                      <span className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm text-gray-500 text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-gray-100 flex items-center gap-1">🕒 {getTimeAgo(deal.timestamp)}</span>
                      {deal.dealType && deal.dealType !== 'Sale' && <span className="absolute bottom-3 left-3 z-10 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm">{deal.dealType}</span>}
                      {isAdmin && <button onClick={(e) => { e.preventDefault(); handleDeleteDeal(deal.id); }} className="absolute bottom-2 right-2 bg-slate-800 text-white p-2 rounded hover:bg-red-600 z-50"><Trash2 className="w-4 h-4" /></button>}
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
              
              {!isSearching && (
                <div className="flex justify-center pb-12">
                    <button 
                    onClick={() => setDealLimit(prev => prev + 50)} 
                    disabled={isLoadingMore}
                    className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 px-8 rounded-full shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                    {isLoadingMore ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</> : 'Load More Deals'}
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
          <p className="text-xs text-gray-500">We also participate in affiliate programs with Home Depot, Acme Tools, Walmart, and others...</p>
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Tool Deals Daily. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}