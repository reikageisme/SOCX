import { Shield, LayoutDashboard, Map, FileText, Settings, ShieldAlert, ChevronLeft, ChevronRight, AlertTriangle, Server, Network, ShieldCheck, ActivitySquare, Code } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Topology', path: '/topology', icon: Network },
  { name: 'Threat Map', path: '/map', icon: Map },
  { name: 'Assets', path: '/assets', icon: Server },
  { name: 'Incidents', path: '/incidents', icon: AlertTriangle },
  { name: 'Pentest & Reports', path: '/pentest', icon: ShieldCheck },
  { name: 'Forensics', path: '/forensics', icon: ActivitySquare },
  { name: 'Rules', path: '/rules', icon: ShieldAlert },
  { name: 'Logs', path: '/logs', icon: FileText },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const Sidebar = ({ isCollapsed, toggleSidebar }: { isCollapsed: boolean, toggleSidebar: () => void }) => {
  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} transition-all duration-300 bg-soc-card h-screen border-r border-gray-800 flex flex-col relative`}>
      <button 
        onClick={toggleSidebar}
        className="absolute -right-3 top-8 bg-soc-accent text-white rounded-full p-1 shadow-lg border-2 border-soc-dark hover:bg-soc-accent/80 z-50 transition-colors"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className={`p-6 flex items-center gap-3 border-b border-gray-800 ${isCollapsed ? 'justify-center' : ''}`}>
        <Shield className="w-8 h-8 text-soc-accent shrink-0" />
        {!isCollapsed && <h1 className="text-xl font-bold tracking-wider text-white truncate">ACE <span className="text-soc-accent">CS</span></h1>}
      </div>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            title={isCollapsed ? item.name : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-soc-accent/10 text-soc-accent border border-soc-accent/20' 
                  : 'text-soc-muted hover:bg-gray-800 hover:text-white'
              } ${isCollapsed ? 'justify-center px-0' : ''}`
            }
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.name}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-800 text-xs text-center text-soc-muted truncate">
        {isCollapsed ? 'v1.0' : 'ACS v1.0.0 • ACEDA'}
      </div>
    </div>
  );
};
