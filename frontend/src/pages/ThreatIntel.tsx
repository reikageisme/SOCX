import { useState } from 'react';
import { Globe, Search, ShieldAlert, Crosshair } from 'lucide-react';

export const ThreatIntel = () => {
  const [ip, setIp] = useState('');
  
  return (
    <div className="p-8 max-w-7xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
      <div className="flex items-center gap-3 mb-8">
        <Globe className="text-teal-400" size={28} />
        <h1 className="text-2xl font-bold text-white tracking-wide">Threat Intelligence Hub</h1>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
          <Search size={20} className="text-slate-400" />
          IOC Search
        </h2>
        <div className="flex gap-4">
          <input 
            type="text" 
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="Search IP, Domain, or Hash..." 
            className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-teal-500/50"
          />
          <button className="bg-teal-600 hover:bg-teal-500 text-white px-6 py-2 rounded-lg font-medium transition-colors">
            Analyze
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <ShieldAlert size={20} className="text-rose-400" />
            Active Threats Feed (OTX / ThreatFox)
          </h2>
          <div className="flex-1 flex items-center justify-center text-slate-500 bg-black/20 rounded-lg border border-slate-800/50">
            Feed data will appear here
          </div>
        </div>
        
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <Crosshair size={20} className="text-amber-400" />
            Known Bad Actors
          </h2>
          <div className="flex-1 flex items-center justify-center text-slate-500 bg-black/20 rounded-lg border border-slate-800/50">
            Bad actors list will appear here
          </div>
        </div>
      </div>
    </div>
  );
};
