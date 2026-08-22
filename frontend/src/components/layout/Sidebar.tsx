import { Boxes, Shield, LayoutDashboard, Map, FileText, Settings, ShieldAlert, ChevronLeft, ChevronRight, AlertTriangle, Server, Network, ShieldCheck, ActivitySquare, Users, User, Globe, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['superadmin', 'Super_Administrator', 'SOC_Analyst_Tier2', 'Security_Auditor'] },
  { name: 'Topology', path: '/topology', icon: Network, roles: ['superadmin', 'Super_Administrator', 'DevOps_Engineer'] },
  { name: 'Infrastructure', path: '/infrastructure', icon: Boxes, roles: ['superadmin', 'Super_Administrator', 'DevOps_Engineer', 'SOC_Analyst_Tier2', 'Security_Auditor'] },
  { name: 'Threat Map', path: '/map', icon: Map, roles: ['superadmin', 'Super_Administrator', 'SOC_Analyst_Tier2', 'Security_Auditor'] },
  { name: 'Assets', path: '/assets', icon: Server, roles: ['superadmin', 'Super_Administrator', 'Penetration_Tester', 'DevOps_Engineer'] },
  { name: 'Incidents', path: '/incidents', icon: AlertTriangle, roles: ['superadmin', 'Super_Administrator', 'SOC_Analyst_Tier2', 'Penetration_Tester'] },
  { name: 'Threat Intel', path: '/intel', icon: Globe, roles: ['superadmin', 'Super_Administrator', 'SOC_Analyst_Tier2'] },
  { name: 'Pentest & Reports', path: '/pentest', icon: ShieldCheck, roles: ['superadmin', 'Super_Administrator', 'Penetration_Tester'] },
  { name: 'Forensics', path: '/forensics', icon: ActivitySquare, roles: ['superadmin', 'Super_Administrator', 'SOC_Analyst_Tier2'] },
  { name: 'Rules', path: '/rules', icon: ShieldAlert, roles: ['superadmin', 'Super_Administrator', 'DevOps_Engineer'] },
  { name: 'Logs', path: '/logs', icon: FileText, roles: ['superadmin', 'Super_Administrator', 'SOC_Analyst_Tier2', 'DevOps_Engineer', 'Security_Auditor'] },
  { name: 'Profile', path: '/profile', icon: User, roles: ['superadmin', 'Super_Administrator', 'SOC_Analyst_Tier2', 'Penetration_Tester', 'DevOps_Engineer', 'Security_Auditor'] },
  { name: 'Settings', path: '/settings', icon: Settings, roles: ['superadmin', 'Super_Administrator'] },
];

export const Sidebar = ({ isCollapsed, toggleSidebar }: { isCollapsed: boolean, toggleSidebar: () => void }) => {
  const { userRole, setToken } = useStore();
  const navigate = useNavigate();
  
  const handleLogout = () => {
    setToken(null);
    navigate('/login');
  };
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
        {navItems.filter(item => !item.roles || item.roles.includes(userRole)).map((item) => (
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
        { (userRole === 'superadmin' || userRole === 'Super_Administrator') && (
          <>
            <NavLink
              to="/users"
              title={isCollapsed ? "Identity & Access" : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive 
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                    : 'text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400'
                } ${isCollapsed ? 'justify-center px-0' : ''}`
              }
            >
              <Users className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="font-medium whitespace-nowrap">Identity & Access</span>}
            </NavLink>
          </>
        )}
      </nav>
      <div className="p-4 border-t border-gray-800 flex flex-col gap-2">
        <button 
          onClick={handleLogout}
          className={`flex items-center gap-3 px-4 py-2 w-full text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors ${isCollapsed ? 'justify-center px-0' : ''}`}
          title={isCollapsed ? "Logout" : undefined}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="font-medium whitespace-nowrap">Logout</span>}
        </button>
        <div className="text-xs text-center text-soc-muted truncate mt-2">
          {isCollapsed ? 'v1.0' : 'ACS v1.0.0 • ACEDA'}
        </div>
      </div>
    </div>
  );
};
