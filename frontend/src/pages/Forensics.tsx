import { useState, useEffect } from 'react';
import { FileSearch, Upload, Activity, Server, ArrowRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useStore } from '../store/useStore';

export const Forensics = () => {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'completed' | 'failed'>('idle');
  const [results, setResults] = useState<any>(null);
  const token = useStore((state) => state.token);

  const handleUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('/api/v1/forensics/pcap/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const data = await res.json();
      if (res.ok) {
        setJobId(data.job_id);
        setStatus('analyzing');
      } else {
        setStatus('failed');
      }
    } catch (e) {
      setStatus('failed');
    }
  };

  useEffect(() => {
    let interval: any;
    if (status === 'analyzing' && jobId) {
      interval = setInterval(async () => {
        try {
          const res = await apiFetch(`/api/v1/forensics/pcap/${jobId}`);
          const data = await res.json();
          if (data.status === 'completed' || data.status === 'failed') {
            setStatus(data.status);
            setResults(data);
            clearInterval(interval);
          }
        } catch (e) {
          // keep trying
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [status, jobId]);

  return (
    <div className="space-y-6">
      <div className="bg-soc-card rounded-xl p-6 border border-gray-800 shadow-lg">
        <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
          <FileSearch className="text-soc-accent" />
          PCAP Digital Forensics
        </h2>
        
        <div className="border-2 border-dashed border-gray-700 rounded-xl p-12 text-center hover:border-soc-accent/50 transition-colors bg-black/20">
          <Upload className="w-12 h-12 text-soc-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Upload Packet Capture</h3>
          <p className="text-sm text-soc-muted mb-6">Support for .pcap and .pcapng files (Max 50MB for demo)</p>
          
          <input
            type="file"
            id="pcap-upload"
            className="hidden"
            accept=".pcap,.pcapng"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={status === 'uploading' || status === 'analyzing'}
          />
          
          <div className="flex flex-col items-center gap-4">
            <label
              htmlFor="pcap-upload"
              className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg cursor-pointer transition-colors"
            >
              Select File
            </label>
            
            {file && (
              <div className="flex items-center gap-4">
                <span className="text-soc-accent font-medium">{file.name}</span>
                <button
                  onClick={handleUpload}
                  className="bg-soc-accent hover:bg-soc-accent/90 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Analyze PCAP
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {(status === 'uploading' || status === 'analyzing') && (
        <div className="bg-soc-card rounded-xl p-8 border border-gray-800 text-center">
          <div className="inline-block p-4 bg-soc-accent/10 rounded-full mb-4">
            <Activity className="w-8 h-8 text-soc-accent animate-pulse" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            {status === 'uploading' ? 'Uploading File...' : 'Deep Packet Inspection in Progress'}
          </h3>
          <p className="text-soc-muted">Parsing protocols, extracting sessions, and identifying top talkers...</p>
        </div>
      )}

      {status === 'completed' && results?.stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-soc-card rounded-xl p-6 border border-gray-800 md:col-span-3 flex justify-between items-center">
             <div className="text-xl font-bold text-white">Analysis Complete</div>
             <div className="text-soc-accent font-mono bg-soc-accent/10 px-4 py-2 rounded-lg border border-soc-accent/20">
               {results.stats.total_packets} Packets Analyzed
             </div>
          </div>

          {/* Extracted IPs (IOCs) */}
          <div className="bg-soc-card rounded-xl p-6 border border-rose-900/50 shadow-[0_0_15px_rgba(225,29,72,0.05)] md:col-span-2">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Server className="text-rose-500" /> Extracted IPs (Potential IOCs)
            </h3>
            <div className="overflow-x-auto max-h-64 custom-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/40 sticky top-0">
                  <tr className="text-soc-muted border-b border-gray-800">
                    <th className="p-3 font-medium">IP Address</th>
                    <th className="p-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {results.stats.iocs.ips.map((ip: string, i: number) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-white/[0.02] group">
                      <td className="p-3 font-mono text-rose-300 font-medium">{ip}</td>
                      <td className="p-3 text-right">
                        <button className="opacity-0 group-hover:opacity-100 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
                          Block on pfSense
                        </button>
                      </td>
                    </tr>
                  ))}
                  {results.stats.iocs.ips.length === 0 && (
                    <tr><td colSpan={2} className="p-4 text-center text-slate-500">No IPs extracted.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* DNS Queries */}
          <div className="bg-soc-card rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-bold text-white mb-4">DNS Queries</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
              {results.stats.iocs.dns_queries.map((dns: string, idx: number) => (
                <div key={idx} className="bg-black/40 border border-gray-800 p-2.5 rounded-lg text-sm font-mono text-indigo-300 truncate hover:text-indigo-200 hover:border-indigo-500/30 transition-colors">
                  {dns}
                </div>
              ))}
              {results.stats.iocs.dns_queries.length === 0 && (
                <div className="text-center text-slate-500 py-4">No DNS queries found.</div>
              )}
            </div>
          </div>

          {/* HTTP Payloads */}
          <div className="bg-soc-card rounded-xl p-6 border border-gray-800 md:col-span-3">
            <h3 className="text-lg font-bold text-white mb-4">Suspicious HTTP Payloads (Cleartext)</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
              {results.stats.iocs.http_payloads.map((payload: string, idx: number) => (
                <div key={idx} className="bg-slate-900 border border-amber-900/30 p-3 rounded-lg text-sm font-mono text-amber-300/80 hover:text-amber-200 transition-colors break-all">
                  {payload}
                </div>
              ))}
              {results.stats.iocs.http_payloads.length === 0 && (
                <div className="text-center text-slate-500 py-4">No cleartext HTTP payloads extracted.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
