import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, query } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, User } from 'firebase/auth';
import { Search, ExternalLink, Loader2, AlertCircle, Filter, X } from 'lucide-react';

// --- CONFIGURATION ---
const getFirebaseConfig = () => {
  try {
    if ((globalThis as any).__firebase_config) {
      return JSON.parse((globalThis as any).__firebase_config);
    }
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

// --- CONSTANTS ---
const STORE_MAP: Record<string, string> = {
  'All Stores': 'all',
  'Ace Hardware': 'ace',
  'Acme Tools': 'acme',
  'Amazon': 'amz',
  'Home Depot': 'hd',
  'Walmart': 'walmart',
  'Zoro': 'zoro'
};

const BRANDS = [
  'All Brands', 'Bosch', 'Craftsman', 'DeWalt', 'EGO', 'Flex', 'Gearwrench', 'Greenworks', 'Hart', 'Husky', 'Hyper Tough', 'Klein', 'Kobalt', 'Makita', 'Metabo HPT', 'Milwaukee', 'Ridgid', 'Ryobi', 'Skil'
];

const DEAL_TYPES = ['All Types', 'BOGO', 'Free Gift', 'Bundle', 'Sale'];

const STORE_COLORS: Record<string, string> = {
  'zoro': 'bg-blue-600', 'amz': 'bg-yellow-500', 'acme': 'bg-red-500', 
  'hd': 'bg-orange-500', 'ace': 'bg-red-700', 'walmart': 'bg-[#0071DC]', 'ohio': 'bg-red-700'
};

interface Deal {
  id: string; title: string; price: number; originalPrice: number; 
  store: string; category: string; dealType?: string; 
  url: string; image: string; timestamp: number;
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
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeStore, setActiveStore] = useState('All Stores');
  const [activeBrand, setActiveBrand] = useState('All Brands');
  const [activeDealType, setActiveDealType] = useState('All Types');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [minPrice, setMinPrice] = useState<number | ''>('');
  const [maxPrice, setMaxPrice] = useState<number | ''>('');
  const [showFilters, setShowFilters] = useState(false);

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
    const q = query(collection(db, 'deals'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Deal[];
      items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setDeals(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const filteredDeals = deals.filter(deal => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (deal.title?.toLowerCase() || '').includes(searchLower) || (deal.store?.toLowerCase() || '').includes(searchLower);
    if (!matchesSearch) return false;

    if (activeCategory !== 'All' && deal.category !== activeCategory) return false;
    if (activeStore !== 'All Stores' && deal.store?.toLowerCase() !== STORE_MAP[activeStore]) return false;
    if (activeBrand !== 'All Brands' && !deal.title.toLowerCase().includes(activeBrand.toLowerCase())) return false;
    
    if (activeDealType !== 'All Types') {
       if (activeDealType === 'Sale') {
          if (deal.dealType && deal.dealType !== 'Sale') return false;
       } else {
          if (deal.dealType !== activeDealType) return false;
       }
    }

    if (minPrice !== '' && deal.price < Number(minPrice)) return false;
    if (maxPrice !== '' && deal.price > Number(maxPrice)) return false;

    return true;
  });

  const storeList = ['All Stores', ...Object.keys(STORE_MAP).filter(s => s !== 'All Stores').sort()];
  
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <img src="/logo.png" alt="ToolDeals" className="h-10 w-10 rounded-full object-cover border border-gray-200" />
            <span className="text-xl font-bold tracking-tight text-gray-900 hidden sm:block">
              Tool<span className="text-yellow-500">Deals</span>
            </span>
          </div>
          <div className="flex-1 max-w-2xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search tools..." className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-full focus:ring-2 focus:ring-yellow-400 outline-none transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className="lg:hidden p-2 bg-gray-100 rounded-full hover:bg-gray-200">
            {showFilters ? <X className="w-5 h-5" /> : <Filter className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-8 flex-1 w-full">
        <aside className={`lg:w-64 flex-shrink-0 space-y-8 ${showFilters ? 'block' : 'hidden lg:block'}`}>
          <div>
            <h3 className="font-bold text-gray-900 mb-3">Deal Type</h3>
            <div className="flex flex-col gap-2">
               {DEAL_TYPES.map(type => (
                 <label key={type} className="flex items-center gap-2 cursor-pointer group">
                   <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${activeDealType === type ? 'border-yellow-500 bg-yellow-500' : 'border-gray-300 bg-white'}`}>
                     {activeDealType === type && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                   </div>
                   <input type="radio" name="dealType" className="hidden" checked={activeDealType === type} onChange={() => setActiveDealType(type)} />
                   <span className="text-sm text-gray-700">{type}</span>
                 </label>
               ))}
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-3">Price Range</h3>
            <div className="flex items-center gap-2">
              <input type="number" placeholder="Min" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" value={minPrice} onChange={(e) => setMinPrice(e.target.value ? Number(e.target.value) : '')} />
              <span className="text-gray-400">-</span>
              <input type="number" placeholder="Max" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : '')} />
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-3">Brand</h3>
            <select value={activeBrand} onChange={(e) => setActiveBrand(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm cursor-pointer">
              {BRANDS.map(brand => (<option key={brand} value={brand}>{brand}</option>))}
            </select>
          </div>
        </aside>

        <div className="flex-1">
          <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-100 pb-4">
            {storeList.map(storeName => (
               <button key={storeName} onClick={() => setActiveStore(storeName)} className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${activeStore === storeName ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-gray-200 hover:border-slate-300'}`}>
                 {storeName}
               </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
            {['All', 'Power Tools', 'Hand Tools', 'Outdoor', 'Accessories', 'Storage'].map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all border ${activeCategory === cat ? 'bg-yellow-400 text-slate-900 border-yellow-400 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                {cat}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">{activeCategory === 'All' ? "Today's Deals" : `${activeCategory} Deals`}</h2>
            <span className="text-sm font-medium text-gray-500">{filteredDeals.length} results</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-yellow-400" /></div>
          ) : filteredDeals.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
              <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No deals found matching your filters.</p>
              <button onClick={() => {setActiveCategory('All'); setActiveBrand('All Brands'); setActiveStore('All Stores'); setMinPrice(''); setMaxPrice(''); setSearchQuery('')}} className="mt-4 text-yellow-600 font-bold text-sm hover:underline">Clear all filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredDeals.map((deal) => (
                <div key={deal.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all group flex flex-col relative h-full">
                  <div className="relative h-48 p-4 flex items-center justify-center bg-white border-b border-gray-100">
                    <span className={`absolute top-3 left-3 z-10 ${STORE_COLORS[deal.store] || 'bg-gray-600'} text-white text-[10px] font-bold px-2 py-1 rounded uppercase shadow-sm`}>
                      {deal.store}
                    </span>
                    <span className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm text-gray-500 text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-gray-100 flex items-center gap-1">
                      🕒 {getTimeAgo(deal.timestamp)}
                    </span>
                    {deal.dealType && deal.dealType !== 'Sale' && (
                        <span className="absolute bottom-3 left-3 z-10 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm">
                          {deal.dealType}
                        </span>
                    )}
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
                       <a href={deal.url} target="_blank" rel="noopener noreferrer" className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
                         View <ExternalLink className="w-3 h-3" />
                       </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* --- AFFILIATE DISCLOSURE FOOTER --- */}
      <footer className="bg-white border-t border-gray-200 mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <p className="text-xs text-gray-500">
            ToolDealsDaily.com is a participant in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites to earn advertising fees by advertising and linking to Amazon.com.
          </p>
          <p className="text-xs text-gray-500">
            We also participate in affiliate programs with Home Depot, Acme Tools, Walmart, and others. We may earn a commission when you click links and make a purchase. This helps support our work at no additional cost to you.
          </p>
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Tool Deals Daily. All rights reserved. Prices and availability subject to change.
          </p>
        </div>
      </footer>
    </div>
  );
}