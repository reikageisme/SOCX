import React, { useEffect, useState, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { useStore } from '../store/useStore';
import { ShieldAlert, Server, Activity, Search, Clock, Terminal, ChevronRight, Zap } from 'lucide-react';

interface Asset {
  id: string;
  hostname: string;
  ip_address: string;
  os_version: string;
  criticality: string;
  owner: string;
  cves: string; // JSON string
}

const SECURITY_TOOLS = [
  { id: 'nmap', name: 'Nmap', desc: 'Network Discovery & Port Scanning', icon: '🔍' },
  { id: 'sqlmap', name: 'SQLMap', desc: 'Automatic SQL injection detection', icon: '💉' },
  { id: 'zap', name: 'OWASP ZAP', desc: 'Web Vulnerability Scanner', icon: '🕸️' },
  { id: 'burp', name: 'Burp Suite', desc: 'Professional Web Scanner', icon: '🦊' },
  { id: 'nuclei', name: 'Nuclei', desc: 'Fast vulnerability scanner', icon: '⚛️' },
  { id: 'nikto', name: 'Nikto', desc: 'Web server scanner', icon: '🌐' },
  { id: 'wpscan', name: 'WPScan', desc: 'WordPress vulnerability scanner', icon: '📝' },
  { id: 'dirb', name: 'DIRB', desc: 'Web content scanner', icon: '📁' },
  { id: 'gobuster', name: 'Gobuster', desc: 'Directory & DNS busting', icon: '👻' },
  { id: 'hydra', name: 'Hydra', desc: 'Network logon cracker', icon: '🐉' },
  { id: 'metasploit', name: 'Metasploit', desc: 'Penetration testing framework', icon: '🎯' },
  { id: 'openvas', name: 'OpenVAS', desc: 'Comprehensive vulnerability scanner', icon: '🛡️' },
  { id: 'masscan', name: 'Masscan', desc: 'Mass IP port scanner', icon: '🚀' },
  { id: 'amass', name: 'Amass', desc: 'In-depth Attack Surface Mapping', icon: '🗺️' },
  { id: 'sublist3r', name: 'Sublist3r', desc: 'Fast subdomains enumeration', icon: '📋' },
];

export const Assets = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const token = useStore((state) => state.token);
  
  // Command Center State
  const [cmdInput, setCmdInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [cmdHistory, setCmdHistory] = useState<{time: string, cmd: string, status: string}[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const res = await apiFetch('/api/v1/assets', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setAssets(data);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchAssets();
  }, [token]);

  const parseCVEs = (cvesStr: string) => {
    try {
      const parsed = JSON.parse(cvesStr);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  };

  const handleScan = async (asset: Asset, overrideTool?: string) => {
    const toolToUse = overrideTool || 'nmap';
    setScanningId(asset.id);
    try {
      const res = await apiFetch('/api/v1/pentest/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          target: asset.ip_address, 
          tool: toolToUse,
          arguments: '-F -O' 
        })
      });
      // Demo simulate
      setTimeout(() => {
        setScanningId(null);
      }, 3000);
    } catch {
      setScanningId(null);
    }
  };

  // --- Command Center Logic ---
  const filteredTools = SECURITY_TOOLS.filter(t => 
    cmdInput.startsWith('/') ? t.id.includes(cmdInput.substring(1).toLowerCase().split(' ')[0]) : false
  );

  const handleCmdKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) {
      if (e.key === 'Enter' && cmdInput.trim() !== '') {
        executeCommand();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion(prev => (prev < filteredTools.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // If the user already typed a command with a space (e.g. "/nmap aceda.id.vn"), execute it
      if (cmdInput.trim().split(' ').length > 1 && cmdInput.trim().split(' ')[1] !== '') {
        executeCommand();
      } else {
        // Otherwise, autocomplete the selected tool
        const tool = filteredTools[activeSuggestion];
        if (tool) {
          setCmdInput(`/${tool.id} `);
          setShowSuggestions(false);
        }
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleCmdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCmdInput(val);
    if (val.startsWith('/')) {
      setShowSuggestions(true);
      setActiveSuggestion(0);
    } else {
      setShowSuggestions(false);
    }
  };

  const executeCommand = async () => {
    const parts = cmdInput.trim().split(' ');
    const cmd = parts[0].substring(1); // remove '/'
    const target = parts[1];

    if (!cmd || !target) {
      setCmdHistory(prev => [{ time: new Date().toLocaleTimeString(), cmd: cmdInput, status: 'Error: Missing target' }, ...prev].slice(0, 5));
      return;
    }

    const toolExists = SECURITY_TOOLS.find(t => t.id === cmd);
    if (!toolExists) {
      setCmdHistory(prev => [{ time: new Date().toLocaleTimeString(), cmd: cmdInput, status: 'Error: Unknown tool' }, ...prev].slice(0, 5));
      return;
    }

    setCmdHistory(prev => [{ time: new Date().toLocaleTimeString(), cmd: cmdInput, status: 'Executing...' }, ...prev].slice(0, 5));
    setCmdInput('');
    setShowSuggestions(false);

    try {
      await apiFetch('/api/v1/pentest/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ target: target, tool: cmd })
      });
      
      setCmdHistory(prev => {
        const newHist = [...prev];
        newHist[0].status = 'Success (Check Discord)';
        return newHist;
      });
    } catch {
      setCmdHistory(prev => {
        const newHist = [...prev];
        newHist[0].status = 'Failed to execute';
        return newHist;
      });
    }
  };

  return (
    <div className="p-6 h-full flex flex-col space-y-6 animate-fade-in text-white">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-inter bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">Asset Inventory & Command Center</h1>
      </div>

      {/* Advanced Command Center */}
      <div className="bg-slate-900/80 rounded-2xl border border-teal-500/30 p-4 shadow-[0_0_15px_rgba(20,184,166,0.15)] flex flex-col gap-3 relative z-20">
        <div className="flex items-center gap-2 text-teal-400 font-mono text-sm mb-1">
          <Terminal size={16} /> ACS Security Terminal
        </div>
        
        <div className="relative">
          <div className="flex items-center bg-black/50 border border-slate-700 rounded-lg p-1 focus-within:border-teal-500/50 focus-within:shadow-[0_0_10px_rgba(20,184,166,0.2)] transition-all">
            <span className="text-teal-500 font-mono pl-3 pr-2 font-bold select-none">root@acs:~#</span>
            <input 
              ref={inputRef}
              type="text"
              value={cmdInput}
              onChange={handleCmdChange}
              onKeyDown={handleCmdKeyDown}
              placeholder={useStore.getState().userRole === 'auditor' ? "Terminal disabled for auditors" : "Type / to see available tools (e.g., /nmap aceda.id.vn)"}
              disabled={useStore.getState().userRole === 'auditor'}
              className="flex-1 bg-transparent border-none text-slate-200 font-mono py-2 px-2 focus:outline-none placeholder:text-slate-600 disabled:opacity-50"
              autoComplete="off"
              spellCheck="false"
            />
            <button 
              onClick={executeCommand}
              disabled={useStore.getState().userRole === 'auditor'}
              className="bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 p-2 rounded-md transition-colors border border-teal-500/30 mr-1 disabled:opacity-50"
            >
              <Zap size={18} />
            </button>
          </div>

          {/* Autocomplete Dropdown */}
          {showSuggestions && cmdInput.startsWith('/') && filteredTools.length > 0 && (
            <div className="absolute top-full left-0 mt-2 w-full max-w-2xl bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-2 bg-slate-900/80 text-xs text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-700">
                Available Tools ({filteredTools.length})
              </div>
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {filteredTools.map((tool, idx) => (
                  <div 
                    key={tool.id}
                    onClick={() => {
                      setCmdInput(`/${tool.id} `);
                      setShowSuggestions(false);
                      inputRef.current?.focus();
                    }}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-slate-700/50 last:border-none transition-colors ${
                      activeSuggestion === idx ? 'bg-teal-900/40 border-l-2 border-l-teal-500' : 'hover:bg-slate-700/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <span className="text-2xl">{tool.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-teal-300 font-bold">/{tool.id}</span>
                        <span className="text-slate-200 font-medium">{tool.name}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{tool.desc}</div>
                    </div>
                    {activeSuggestion === idx && <span className="text-xs font-mono text-teal-500 bg-teal-500/10 px-2 py-1 rounded">Enter ↵</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Command History mini-log */}
        {cmdHistory.length > 0 && (
          <div className="bg-black/40 rounded-lg p-2 font-mono text-xs border border-slate-800">
            {cmdHistory.map((h, i) => (
              <div key={i} className={`flex items-center gap-2 py-1 ${i === 0 ? 'text-slate-300 opacity-100' : 'text-slate-500 opacity-60'}`}>
                <span className="text-slate-600">[{h.time}]</span>
                <ChevronRight size={12} className="text-teal-700" />
                <span className="text-teal-400">{h.cmd}</span>
                <span className="text-slate-600">-</span>
                <span className={`${h.status.includes('Success') ? 'text-emerald-400' : h.status.includes('Error') || h.status.includes('Failed') ? 'text-rose-400' : 'text-amber-400 animate-pulse'}`}>
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900/50 rounded-2xl border border-slate-700 flex flex-col flex-1 backdrop-blur-md overflow-hidden z-10">
        <div className="overflow-auto flex-1 p-0">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900/80 text-slate-400 text-sm uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="p-4 font-medium"><Server size={16} className="inline mr-2" /> Hostname</th>
                <th className="p-4 font-medium">IP Address</th>
                <th className="p-4 font-medium">OS Version</th>
                <th className="p-4 font-medium"><Activity size={16} className="inline mr-2" /> Criticality</th>
                <th className="p-4 font-medium"><ShieldAlert size={16} className="inline mr-2 text-rose-500" /> Vulnerabilities (CVEs)</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-slate-300">
              {assets.map(asset => {
                const cves = parseCVEs(asset.cves);
                return (
                  <tr key={asset.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="p-4 whitespace-nowrap font-medium text-indigo-300">{asset.hostname}</td>
                    <td className="p-4 whitespace-nowrap text-sm font-mono text-slate-400">{asset.ip_address}</td>
                    <td className="p-4 whitespace-nowrap text-slate-300">{asset.os_version || 'N/A'}</td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase border ${
                        asset.criticality === 'high' ? 'bg-rose-500/20 text-rose-400 border-rose-500/50' : 
                        asset.criticality === 'medium' ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 
                        'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {asset.criticality}
                      </span>
                    </td>
                    <td className="p-4">
                      {cves.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {cves.map((cve: string) => (
                            <span key={cve} className="px-2 py-0.5 rounded text-xs font-mono bg-rose-900/50 text-rose-300 border border-rose-800/50">
                              {cve}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-sm">No known CVEs</span>
                      )}
                    </td>
                    <td className="p-4">
                      <button 
                        onClick={() => handleScan(asset)}
                        disabled={scanningId === asset.id || useStore.getState().userRole === 'auditor'}
                        className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        {scanningId === asset.id ? <Clock size={14} className="animate-spin" /> : <Search size={14} />}
                        {scanningId === asset.id ? 'Scanning...' : 'Scan'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {assets.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">No assets found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
