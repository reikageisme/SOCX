import { useState, useEffect } from 'react';
import { Globe, Search, ShieldAlert, Crosshair, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

export const ThreatIntel = () => {
  const [ip, setIp] = useState('');
  const [feed, setFeed] = useState<any[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  
  const [searchResult, setSearchResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    fetchFeed();
  }, []);

  const fetchFeed = async () => {
    try {
      setLoadingFeed(true);
      const res = await apiFetch('/api/v1/intel/feed');
      if (res.ok) {
        const data = await res.json();
        setFeed(data);
      }
    } catch (err) {
      console.error('Failed to fetch intel feed', err);
    } finally {
      setLoadingFeed(false);
    }
  };

  const handleSearch = async () => {
    if (!ip) return;
    setIsSearching(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const res = await apiFetch(`/api/v1/intel/search?q=${encodeURIComponent(ip)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResult(data);
      } else {
        const err = await res.json();
        setSearchError(err.detail || 'Search failed');
      }
    } catch (err) {
      setSearchError('Network error during search');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
      <div className="flex items-center gap-3 mb-8">
        <Globe className="text-teal-400" size={28} />
        <h1 className="text-2xl font-bold text-white tracking-wide">Threat Intelligence Hub</h1>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-6 shrink-0">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
          <Search size={20} className="text-slate-400" />
          IOC Search
        </h2>
        <div className="flex gap-4 mb-4">
          <input 
            type="text" 
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search IP, Domain, or Hash..." 
            className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-teal-500/50"
          />
          <button 
            onClick={handleSearch}
            disabled={isSearching || !ip}
            className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-400 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {isSearching ? <Loader2 size={16} className="animate-spin" /> : null}
            Analyze
          </button>
        </div>

        {searchError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle size={16} /> {searchError}
          </div>
        )}

        {searchResult && (
          <div className="mt-4 p-4 bg-black/30 rounded-lg border border-slate-800">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
              <h3 className="text-white font-medium">Analysis for: <span className="text-teal-400 font-mono ml-2">{searchResult.ioc}</span></h3>
              {searchResult.found_in_cache ? (
                <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-400/10 px-2 py-1 rounded-full"><AlertCircle size={12}/> Known Malicious</span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full"><CheckCircle2 size={12}/> Not in Active Cache</span>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="text-slate-400 text-xs uppercase mb-1">OTX AlienVault</div>
                {searchResult.otx ? (
                   searchResult.otx.error ? (
                     <div className="text-slate-500">{searchResult.otx.error}</div>
                   ) : (
                     <div>
                       <div className="text-white">Pulses: <span className="text-rose-400 font-bold">{searchResult.otx.pulse_count}</span></div>
                     </div>
                   )
                ) : <div className="text-slate-500">Not searched</div>}
              </div>
              
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="text-slate-400 text-xs uppercase mb-1">ThreatFox</div>
                {searchResult.threatfox ? (
                  searchResult.threatfox.status === 'not_found' ? (
                     <div className="text-emerald-400">Clean</div>
                  ) : (
                    <div>
                       <div className="text-white truncate">Malware: <span className="text-rose-400">{searchResult.threatfox.malware || 'Unknown'}</span></div>
                       <div className="text-white">Confidence: {searchResult.threatfox.confidence}%</div>
                    </div>
                  )
                ) : <div className="text-slate-500">Not searched</div>}
              </div>

              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="text-slate-400 text-xs uppercase mb-1">Mock Analysis / Cache</div>
                {searchResult.mock_data ? (
                  <div>
                    <div className="text-amber-400 truncate">{searchResult.mock_data.message}</div>
                    <div className="text-white">Family: {searchResult.mock_data.malware_family}</div>
                  </div>
                ) : searchResult.cache_data ? (
                  <div>
                    <div className="text-rose-400 truncate">{searchResult.cache_data.malware_family}</div>
                    <div className="text-white">Reported By: {searchResult.cache_data.reported_by}</div>
                  </div>
                ) : <div className="text-slate-500">N/A</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/80">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert size={20} className="text-rose-400" />
              Active Threats Feed
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadingFeed ? (
              <div className="flex justify-center items-center h-full text-slate-500">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : feed.length === 0 ? (
              <div className="flex justify-center items-center h-full text-slate-500">
                No active threats in feed
              </div>
            ) : (
              feed.map((item, idx) => (
                <div key={idx} className="bg-slate-800/40 p-3 rounded-lg border border-slate-800 flex justify-between items-center hover:border-slate-700 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-rose-400 font-mono text-sm">{item.ioc}</span>
                    <span className="text-xs text-slate-500 uppercase">{item.reported_by}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-medium text-slate-300">{item.malware_family}</span>
                    <span className="text-xs text-slate-500">Conf: {item.confidence * 100}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/80">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Crosshair size={20} className="text-amber-400" />
              Known Bad Actors
            </h2>
          </div>
          <div className="flex-1 flex items-center justify-center text-slate-500 p-4">
            (Module coming soon in Phase 4)
          </div>
        </div>
      </div>
    </div>
  );
};
