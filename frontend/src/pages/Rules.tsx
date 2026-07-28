import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Play, Check, XCircle, FileCode } from 'lucide-react';
import { useStore } from '../store/useStore';

interface Rule {
  name: string;
  description?: string;
  is_local?: boolean;
  raw_yaml?: string;
}

export const RulesPage: React.FC = () => {
  const token = useStore((state) => state.token);
  const [selectedYaml, setSelectedYaml] = useState('');
  const [validateStatus, setValidateStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [validateMsg, setValidateMsg] = useState('');
  const [dryRunRes, setDryRunRes] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const res = await fetch('/api/v1/rules', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.json();
    }
  });

  const validateRule = async () => {
    try {
      const res = await fetch('/api/v1/rules/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ yaml_content: selectedYaml })
      });
      const json = await res.json();
      if (json.status === 'success') {
        setValidateStatus('success');
        setValidateMsg('Rule hợp lệ! Có thể sử dụng.');
      } else {
        setValidateStatus('error');
        setValidateMsg(json.message);
      }
    } catch (e: any) {
      setValidateStatus('error');
      setValidateMsg(e.message);
    }
  };

  const dryRunRule = async () => {
    try {
      const res = await fetch('/api/v1/rules/dry-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ yaml_content: selectedYaml })
      });
      const json = await res.json();
      setDryRunRes(json);
    } catch (e: any) {
      console.error(e);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col space-y-6 animate-fade-in text-white">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-inter bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">Rules Management</h1>
      </div>

      <div className="flex flex-1 space-x-6">
        {/* Left Side: Rule List */}
        <div className="w-1/3 bg-slate-900/50 rounded-2xl border border-slate-700 p-4 overflow-y-auto backdrop-blur-md">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">Deployed Rules</h2>
          {isLoading && <div className="text-slate-400">Loading rules...</div>}
          <div className="space-y-3">
            {data?.rules?.map((rule: Rule, idx: number) => (
              <div 
                key={idx} 
                onClick={() => setSelectedYaml(rule.raw_yaml || '')}
                className="bg-slate-800/80 p-4 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors border border-slate-700/50 group"
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-teal-300 flex items-center gap-2">
                    <ShieldAlert size={16} />
                    {rule.name}
                  </h3>
                  {rule.is_local ? (
                    <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300 font-mono border border-slate-600">Local</span>
                  ) : (
                    <span className="text-xs bg-indigo-900/50 px-2 py-1 rounded text-indigo-300 font-mono border border-indigo-700/50 flex items-center gap-1">
                      <FileCode size={12} /> aisoc
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-2 line-clamp-2">{rule.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Editor & Tester */}
        <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-700 p-4 flex flex-col backdrop-blur-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-slate-200">YAML Editor</h2>
            <div className="flex space-x-3">
              <button onClick={validateRule} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg flex items-center gap-2">
                <Check size={18} /> Validate
              </button>
              <button onClick={dryRunRule} className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2">
                <Play size={18} fill="currentColor" /> Dry-Run
              </button>
            </div>
          </div>
          
          {validateStatus !== 'idle' && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${validateStatus === 'success' ? 'bg-emerald-900/30 border border-emerald-500/50 text-emerald-400' : 'bg-red-900/30 border border-red-500/50 text-red-400'}`}>
              {validateStatus === 'success' ? <Check size={20} /> : <XCircle size={20} />}
              <span>{validateMsg}</span>
            </div>
          )}

          {dryRunRes && (
            <div className="mb-4 p-3 rounded-lg bg-indigo-900/30 border border-indigo-500/50 text-indigo-200 flex justify-between items-center">
              <div>
                <span className="font-bold text-indigo-300">Dry-run Results: </span>
                Tested {dryRunRes.events_tested} mock events.
              </div>
              <div>
                {dryRunRes.triggered ? (
                  <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-bold border border-red-500/30">Triggered Incident!</span>
                ) : (
                  <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm font-bold border border-emerald-500/30">No Incident Triggered</span>
                )}
              </div>
            </div>
          )}

          <textarea 
            className="flex-1 bg-slate-950/80 border border-slate-700 rounded-xl p-4 font-mono text-sm text-teal-200 focus:outline-none focus:border-teal-500 resize-none w-full"
            value={selectedYaml}
            onChange={(e) => setSelectedYaml(e.target.value)}
            placeholder="Paste your Sigma-like rule here..."
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};
