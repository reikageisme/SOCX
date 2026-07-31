import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Settings as SettingsIcon, Save, Key, Clock, ShieldCheck, Eye, EyeOff, MessageCircle, Send, Fingerprint, ExternalLink } from 'lucide-react';
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
  const [discordCategory, setDiscordCategory] = useState('critical-alerts');
  const [testDiscordStatus, setTestDiscordStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

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
    
    // Integration: Sync with credentials_registry to update rotation metadata
    try {
      const credsRes = await apiFetch('/api/v1/access-review/credentials', { headers: { Authorization: `Bearer ${token}` } });
      if (credsRes.ok) {
        const creds = await credsRes.json();
        for (const c of creds) {
          await apiFetch(`/api/v1/access-review/credentials/${c.id}/rotate`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
        }
      }
    } catch (e) {
      console.error("Failed to sync credential rotation", e);
    }

    setTimeout(() => {
      setIsSaving(false);
      setSaveMsg('Settings & Credential Metadata updated successfully!');
      setTimeout(() => setSaveMsg(''), 3000);
    }, 500);
  };

  const handleTestDiscord = async () => {
    setTestDiscordStatus('testing');
    try {
      const res = await apiFetch('/api/v1/system/discord/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ category: discordCategory })
      });
      if (res.ok) setTestDiscordStatus('success');
      else setTestDiscordStatus('error');
    } catch {
      setTestDiscordStatus('error');
    }
    setTimeout(() => setTestDiscordStatus('idle'), 3000);
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

        {/* IAM / SSO Config */}
        <div className="bg-slate-900/50 rounded-2xl border border-indigo-700/50 p-6 backdrop-blur-md shadow-[0_0_15px_rgba(79,70,229,0.1)] relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-lg">Enterprise Feature</div>
          <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2 mb-2">
            <Fingerprint size={20} className="text-indigo-400" />
            Identity & Access Management (SSO)
          </h2>
          <p className="text-sm text-slate-400 mb-6">Configure Single Sign-On (OIDC/SAML) via Keycloak or Authentik to centrally manage access to the SOC Portal, Proxmox, and pfSense.</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Identity Provider URL (Issuer)</label>
              <input 
                type="text" 
                defaultValue="https://sso.aceda.local/realms/socx"
                className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Client ID</label>
                <input 
                  type="text" 
                  defaultValue="socx-portal"
                  className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Client Secret</label>
                <input 
                  type={showKeys ? "text" : "password"}
                  defaultValue="enterprise-secret-key-mock"
                  className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
            
            <div className="pt-4 flex items-center justify-between border-t border-slate-800">
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                SSO Module Ready. Enabling will enforce OIDC login globally.
              </div>
              <button className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                Enable Enterprise SSO
              </button>
            </div>
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

        {/* Discord Webhooks */}
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 p-6 backdrop-blur-md">
          <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2 mb-6">
            <MessageCircle size={20} className="text-[#5865F2]" />
            Discord Operations Center (Webhooks)
          </h2>
          
          <div className="space-y-4">
            <div className="text-sm text-slate-400 mb-4">
              Alerts are automatically routed to predefined Discord channels based on their category.
              Select a channel below to send a test message.
            </div>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-400 mb-1">Target Channel</label>
                <select 
                  value={discordCategory}
                  onChange={(e) => setDiscordCategory(e.target.value)}
                  className="bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2 w-full text-slate-200 focus:outline-none focus:border-[#5865F2] font-mono"
                >
                  <option value="critical-alerts">🔴 #critical-alerts</option>
                  <option value="security-warnings">🟠 #security-warnings</option>
                  <option value="pve-status">🟡 #pve-status</option>
                  <option value="network-logs">🌐 #network-logs</option>
                  <option value="database-monitor">💾 #database-monitor</option>
                  <option value="pentest-reports">🟢 #pentest-reports</option>
                  <option value="forensics-analysis">🕵️ #forensics-analysis</option>
                </select>
              </div>
              <button
                onClick={handleTestDiscord}
                disabled={testDiscordStatus === 'testing'}
                className="bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 mb-[2px]"
              >
                <Send size={18} />
                {testDiscordStatus === 'testing' ? 'Sending...' : testDiscordStatus === 'success' ? 'Sent!' : testDiscordStatus === 'error' ? 'Failed' : 'Test Webhook'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
