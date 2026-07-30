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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-soc-card rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-bold text-white mb-4">Top Talkers (IPs)</h3>
            <div className="space-y-4">
              {Object.entries(results.stats.top_ips).map(([ip, count]: [string, any], idx) => (
                <div key={ip} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-soc-muted font-mono w-4">{idx + 1}.</span>
                    <Server className="w-4 h-4 text-soc-accent" />
                    <span className="text-gray-300 font-mono">{ip}</span>
                  </div>
                  <span className="bg-black/50 px-3 py-1 rounded-full text-sm text-soc-muted">
                    {count} packets
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-soc-card rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-bold text-white mb-4">Protocol Distribution</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(results.stats.protocols).map(([proto, count]: [string, any]) => (
                <div key={proto} className="bg-black/40 border border-gray-800 p-4 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-white mb-1">{count}</span>
                  <span className="text-sm font-medium text-soc-accent uppercase tracking-wider">{proto}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-soc-card rounded-xl p-6 border border-gray-800 md:col-span-2">
            <h3 className="text-lg font-bold text-white mb-4">Extracted Connections</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-soc-muted border-b border-gray-800">
                    <th className="pb-3 font-medium">Source</th>
                    <th className="pb-3 font-medium"></th>
                    <th className="pb-3 font-medium">Destination</th>
                    <th className="pb-3 font-medium">Protocol</th>
                    <th className="pb-3 font-medium">Packet Size</th>
                  </tr>
                </thead>
                <tbody>
                  {results.stats.connections.map((conn: any, i: number) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                      <td className="py-3 font-mono text-gray-300">{conn.src}</td>
                      <td className="py-3"><ArrowRight className="w-4 h-4 text-soc-muted" /></td>
                      <td className="py-3 font-mono text-gray-300">{conn.dst}</td>
                      <td className="py-3">
                        <span className="bg-soc-accent/10 text-soc-accent px-2 py-1 rounded text-xs border border-soc-accent/20">
                          {conn.protocol}
                        </span>
                      </td>
                      <td className="py-3 text-soc-muted">{conn.length} bytes</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
