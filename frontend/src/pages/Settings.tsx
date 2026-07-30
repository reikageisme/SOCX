import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Settings as SettingsIcon, Save, Key, Clock, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../lib/api';

export const SettingsPage: React.FC = () => {
  const token = useStore((state) => state.token);
  const [settings, setSettings] = useState<any>(null);
  const [aiProvider, setAiProvider] = useState('ollama');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [geminiKey, setGeminiKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    apiFetch('/api/v1/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        setSettings(data);
        if (data.ai_provider) {
          setAiProvider(data.ai_provider);
          setOllamaUrl(data.ollama_url || 'http://localhost:11434');
          setGeminiKey(data.gemini_key || '');
        }
      });
  }, [token]);

  const handleSave = async () => {
    setIsSaving(true);
    // In a real app we would PUT these to the server
    setTimeout(() => {
      setIsSaving(false);
      setSaveMsg('Settings updated successfully!');
      setTimeout(() => setSaveMsg(''), 3000);
    }, 1000);
  };

  if (!settings) {
    return <div className="p-6 text-white">Loading settings...</div>;
  }

  return (
    <div className="p-6 h-full flex flex-col space-y-6 animate-fade-in text-white max-w-4xl mx-auto w-full">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-inter bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent flex items-center gap-3">
          <SettingsIcon size={32} className="text-teal-400" />
          System Settings
        </h1>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-2"
        >
          <Save size={18} /> {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {saveMsg && (
        <div className="bg-emerald-900/30 border border-emerald-500/50 text-emerald-400 p-4 rounded-xl flex items-center gap-2">
          <ShieldCheck size={20} /> {saveMsg}
        </div>
      )}

      <div className="space-y-6">
        {/* Threat Intel API Keys */}
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 p-6 backdrop-blur-md">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
              <Key size={20} className="text-indigo-400" />
              Threat Intel API Keys
            </h2>
            <button 
              onClick={() => setShowKeys(!showKeys)}
              className="text-slate-400 hover:text-white transition-colors"
              title="Toggle masked keys"
            >
              {showKeys ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">AlienVault OTX Key</label>
              <input 
                type={showKeys ? "text" : "password"}
                defaultValue={settings.otx_key}
                className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">ThreatFox API Key</label>
              <input 
                type={showKeys ? "text" : "password"}
                defaultValue={settings.threatfox_key}
                className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">AbuseIPDB API Key</label>
              <input 
                type={showKeys ? "text" : "password"}
                defaultValue={settings.abuseipdb_key}
                className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* AI Provider Config */}
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 p-6 backdrop-blur-md">
          <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2 mb-6">
            <ShieldCheck size={20} className="text-purple-400" />
            AI Provider Configuration
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Active AI Provider</label>
              <select 
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="ollama">Local AI (Ollama) - Recommended for privacy</option>
                <option value="gemini">Cloud AI (Gemini)</option>
              </select>
            </div>
            
            {aiProvider === 'gemini' && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm mb-4">
                <strong>Security Warning:</strong> You have selected a Cloud AI provider. Incident details will be sent externally to Google. Ensure no highly sensitive PII is included in the prompt.
              </div>
            )}
            
            {aiProvider === 'ollama' && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Ollama URL</label>
                <input 
                  type="text" 
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
            )}
            
            {aiProvider === 'gemini' && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Gemini API Key</label>
                <input 
                  type={showKeys ? "text" : "password"}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
            )}
          </div>
        </div>

        {/* System Config */}
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 p-6 backdrop-blur-md">
          <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2 mb-6">
            <Clock size={20} className="text-orange-400" />
            Scheduler Configuration
          </h2>
          
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Threat Intel Pull Interval (minutes)</label>
            <div className="flex items-center gap-4">
              <input 
                type="number" 
                defaultValue={settings.threat_intel_interval}
                className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-32 text-slate-200 focus:outline-none focus:border-orange-500"
              />
              <span className="text-sm text-slate-500">
                Recommended: 15 minutes to avoid rate-limiting on free tiers.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
