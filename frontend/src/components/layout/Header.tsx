import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { ShieldCheck, Bell, LogOut, Settings, AlertTriangle, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';

export const Header = () => {
  const [profile, setProfile] = useState<any>(null);
  const wsConnected = useStore((state) => state.wsConnected);
  const setToken = useStore((state) => state.setToken);
  const navigate = useNavigate();
  
  const notifications = useStore((state) => state.notifications);
  const markAllNotificationsRead = useStore((state) => state.markAllNotificationsRead);
  const unreadCount = notifications.filter(n => !n.read).length;

  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [iocQuery, setIocQuery] = useState('');
  const [lookupResult, setLookupResult] = useState<any>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiFetch('/api/v1/users/me');
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (err) {
        console.error('Failed to fetch profile in header', err);
      }
    };
    if (useStore.getState().token) {
      fetchProfile();
    }
    
    window.addEventListener('profileUpdated', fetchProfile);
    return () => window.removeEventListener('profileUpdated', fetchProfile);
  }, []);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!iocQuery) return;
    try {
      const res = await apiFetch(`/api/v1/intel/lookup?q=${encodeURIComponent(iocQuery)}`);
      const data = await res.json();
      setLookupResult(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    setToken(null);
    navigate('/login');
  };

  return (
    <header className="h-20 border-b border-gray-800 bg-soc-dark flex items-center justify-between px-8">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-white tracking-wide">ACS Control Center</h2>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${wsConnected ? 'bg-soc-success/10 text-soc-success border-soc-success/20' : 'bg-soc-alert/10 text-soc-alert border-soc-alert/20'}`}>
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-soc-success animate-pulse' : 'bg-soc-alert'}`} />
          {wsConnected ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
        </div>
      </div>
      
      <div className="flex items-center gap-6 relative">
        <form onSubmit={handleLookup} className="relative flex items-center">
          <input 
            type="text" 
            placeholder="IOC Lookup (IP)..." 
            value={iocQuery}
            onChange={(e) => setIocQuery(e.target.value)}
            className="bg-gray-800 text-white text-sm rounded-l px-3 py-1.5 focus:outline-none w-48"
          />
          <button type="submit" className="bg-gray-700 hover:bg-gray-600 px-2 py-1.5 rounded-r">
            <Search size={16} className="text-gray-300" />
          </button>
          {lookupResult && (
            <div className="absolute top-10 right-0 w-64 bg-gray-800 border border-gray-700 rounded shadow-lg p-3 z-50 text-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold">Result for {lookupResult.ioc}</span>
                <button type="button" onClick={() => setLookupResult(null)} className="text-gray-400 hover:text-white">&times;</button>
              </div>
              <div className={lookupResult.is_malicious ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                {lookupResult.is_malicious ? 'Malicious' : 'Clean / Unknown'}
              </div>
              {lookupResult.is_malicious && (
                <div className="mt-2 text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(lookupResult.metadata, null, 2)}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Notification Bell */}
        <div className="relative">
          <button 
            onClick={() => setShowNotif(!showNotif)}
            onBlur={() => setTimeout(() => setShowNotif(false), 200)}
            className={`relative p-2 rounded-full transition-colors ${showNotif ? 'bg-gray-800 text-white' : 'text-soc-muted hover:text-white hover:bg-gray-800/50'}`}
          >
            <Bell className="w-5 h-5" />
            <span className={`absolute top-1 right-1 w-2 h-2 rounded-full border border-soc-dark ${unreadCount > 0 ? 'bg-soc-alert animate-pulse' : 'hidden'}`}></span>
          </button>
          
          {showNotif && (
            <div className="absolute right-0 mt-3 w-80 bg-soc-card border border-gray-700 rounded-xl shadow-2xl py-2 z-50 animate-fade-in origin-top-right">
              <div className="px-4 py-2 border-b border-gray-800 flex justify-between items-center">
                <h3 className="font-semibold text-white">Notifications {unreadCount > 0 && `(${unreadCount})`}</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-soc-muted">
                    No notifications
                  </div>
                ) : (
                  notifications.map((notif, idx) => (
                    <div 
                      key={notif.id || idx} 
                      onClick={() => { navigate('/incidents'); setShowNotif(false); }}
                      className={`px-4 py-3 hover:bg-gray-800/50 cursor-pointer flex gap-3 transition-colors ${idx > 0 ? 'border-t border-gray-800/50' : ''} ${!notif.read ? 'bg-gray-800/30' : ''}`}
                    >
                      <div className="mt-1">
                        {notif.severity === 'high' ? (
                          <AlertTriangle size={16} className="text-soc-alert" />
                        ) : (
                          <ShieldCheck size={16} className={notif.severity === 'medium' ? 'text-soc-warning' : 'text-soc-success'} />
                        )}
                      </div>
                      <div>
                        <p className={`text-sm ${!notif.read ? 'text-white font-medium' : 'text-gray-300'}`}>{notif.title}</p>
                        <p className="text-xs text-gray-500 mt-1">{new Date(notif.timestamp).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <div className="px-4 py-2 border-t border-gray-800 text-center">
                  <button 
                    onClick={(e) => { e.stopPropagation(); markAllNotificationsRead(); }}
                    className="text-sm text-soc-accent hover:text-soc-accent/80 font-medium"
                  >
                    Mark all as read
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-gray-800"></div>
        
        {/* Profile Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowProfile(!showProfile)}
            onBlur={() => setTimeout(() => setShowProfile(false), 200)}
            className="flex items-center gap-3 hover:bg-gray-800/50 p-2 rounded-xl transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-soc-accent to-indigo-500 flex items-center justify-center text-white border border-gray-700 shadow-lg overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <img src={`https://ui-avatars.com/api/?name=${profile?.username || 'User'}&background=random`} alt="Avatar" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-medium text-white">{profile?.full_name || profile?.username || 'tahnadmin'}</div>
              <div className="text-xs text-soc-muted capitalize">{profile?.role || 'Super Administrator'}</div>
            </div>
          </button>

          {showProfile && (
            <div className="absolute right-0 mt-3 w-56 bg-soc-card border border-gray-700 rounded-xl shadow-2xl py-2 z-50 animate-fade-in origin-top-right">
              <div className="px-4 py-3 border-b border-gray-800 sm:hidden">
                <div className="text-sm font-medium text-white">{profile?.full_name || profile?.username || 'tahnadmin'}</div>
                <div className="text-xs text-soc-muted capitalize">{profile?.role || 'Super Administrator'}</div>
              </div>
              <button 
                onClick={() => navigate('/settings')}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2 transition-colors"
              >
                <Settings size={16} /> Account Settings
              </button>
              <button 
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-soc-alert hover:bg-soc-alert/10 flex items-center gap-2 transition-colors"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
