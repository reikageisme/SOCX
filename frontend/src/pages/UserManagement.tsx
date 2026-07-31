import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/api';
import { Shield, Users, Plus, Trash2, Edit2, Check, X, Search, ShieldAlert, Key } from 'lucide-react';
import { IAMAccessReview } from '../components/IAMAccessReview';

export const UserManagement = () => {
  const { userRole } = useStore();
  const [activeTab, setActiveTab] = useState<'users' | 'access'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  const [form, setForm] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'analyst',
    is_active: true
  });

  useEffect(() => {
    if (userRole === 'superadmin' || userRole === 'Super_Administrator') {
      fetchUsers();
    } else {
      setError('Unauthorized access. Superadmin role required.');
      setLoading(false);
    }
  }, [userRole]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/v1/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        setError('Failed to fetch users');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setModalMode('add');
    setForm({ username: '', password: '', full_name: '', role: 'analyst', is_active: true });
    setSelectedUser(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: any) => {
    setModalMode('edit');
    setSelectedUser(user);
    setForm({
      username: user.username,
      password: '', // blank intentionally
      full_name: user.full_name || '',
      role: user.role,
      is_active: user.is_active
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (modalMode === 'add') {
        const res = await apiFetch('/api/v1/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: form.username,
            password: form.password,
            full_name: form.full_name,
            role: form.role
          })
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const payload: any = {
          full_name: form.full_name,
          role: form.role,
          is_active: form.is_active
        };
        if (form.password) payload.password = form.password;
        
        const res = await apiFetch(`/api/v1/users/${selectedUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      alert(`Error saving user: ${err.message || err}`);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (username === 'tahnadmin') {
      alert("Cannot delete root system admin");
      return;
    }
    if (confirm(`Are you sure you want to delete user ${username}?`)) {
      try {
        const res = await apiFetch(`/api/v1/users/${id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          fetchUsers();
        } else {
          const err = await res.json();
          alert(err.detail || 'Failed to delete');
        }
      } catch (err) {
        alert('Error deleting user');
      }
    }
  };

  if (error) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="bg-rose-500/10 border border-rose-500/30 p-6 rounded-xl flex flex-col items-center gap-4">
          <ShieldAlert size={48} className="text-rose-400" />
          <h2 className="text-xl font-bold text-white">Access Denied</h2>
          <p className="text-rose-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <Shield className="text-indigo-400" size={28} />
          <h1 className="text-2xl font-bold text-white tracking-wide">Identity & Access Management</h1>
        </div>
        
        <div className="flex bg-slate-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 flex items-center gap-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'users' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={16} /> Directory
          </button>
          <button
            onClick={() => setActiveTab('access')}
            className={`px-4 py-2 flex items-center gap-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'access' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key size={16} /> Access & API Licenses
          </button>
        </div>

        {activeTab === 'users' && (
          <button 
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
          >
            <Plus size={16} /> Add User
          </button>
        )}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl flex-1 overflow-hidden flex flex-col">
        {activeTab === 'users' ? (
          <>
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/80">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Search users..." 
                  className="bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors w-64"
                />
              </div>
          <div className="text-sm text-slate-400">
            Total Users: <span className="text-white font-bold">{users.length}</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900/90 sticky top-0 z-10 border-b border-slate-800">
              <tr>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">Loading users...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">No users found</td></tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={user.avatar_url || `https://ui-avatars.com/api/?name=${user.username}&background=random`} 
                          alt="Avatar" 
                          className="w-10 h-10 rounded-full object-cover border border-slate-700 group-hover:border-indigo-500/50 transition-colors"
                        />
                        <div>
                          <div className="font-medium text-white">{user.full_name || user.username}</div>
                          <div className="text-xs text-slate-500">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        (user.role === 'superadmin' || user.role === 'Super_Administrator') ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        user.role === 'admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-teal-500/10 text-teal-400 border-teal-500/20'
                      }`}>
                        <Shield size={12} /> {user.role}
                      </span>
                    </td>
                    <td className="p-4">
                      {user.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-500"></span> Inactive</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => openEditModal(user)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded transition-colors"
                          title="Edit User"
                        >
                          <Edit2 size={16} />
                        </button>
                        {user.username !== 'tahnadmin' && (
                          <button 
                            onClick={() => handleDelete(user.id, user.username)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded transition-colors"
                            title="Delete User"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <IAMAccessReview />
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {modalMode === 'add' ? <Plus className="text-indigo-400" /> : <Edit2 className="text-indigo-400" />}
                {modalMode === 'add' ? 'Add New User' : 'Edit User'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Username</label>
                <input 
                  type="text" 
                  value={form.username} 
                  onChange={(e) => setForm({...form, username: e.target.value})}
                  disabled={modalMode === 'edit'}
                  className={`w-full bg-slate-800 border ${modalMode === 'edit' ? 'border-transparent text-slate-500 cursor-not-allowed' : 'border-slate-700 text-white focus:border-indigo-500/50'} rounded-lg px-4 py-2 focus:outline-none transition-colors`}
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Full Name</label>
                <input 
                  type="text" 
                  value={form.full_name} 
                  onChange={(e) => setForm({...form, full_name: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Password {modalMode === 'edit' && '(Leave blank to keep current)'}</label>
                <input 
                  type="password" 
                  value={form.password} 
                  onChange={(e) => setForm({...form, password: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Role</label>
                <select 
                  value={form.role} 
                  onChange={(e) => setForm({...form, role: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500/50 transition-colors"
                >
                  <option value="Super_Administrator">Super Administrator</option>
                  <option value="SOC_Analyst_Tier2">SOC Analyst (Tier 2)</option>
                  <option value="Penetration_Tester">Penetration Tester</option>
                  <option value="DevOps_Engineer">DevOps Engineer</option>
                  <option value="Security_Auditor">Security Auditor</option>
                </select>
              </div>

              {modalMode === 'edit' && form.username !== 'tahnadmin' && (
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800">
                  <input 
                    type="checkbox" 
                    id="isActive"
                    checked={form.is_active} 
                    onChange={(e) => setForm({...form, is_active: e.target.checked})}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-indigo-500/50"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-slate-300">Account is Active</label>
                </div>
              )}
            </div>
            
            <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3 rounded-b-2xl">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
              >
                <Check size={16} /> {modalMode === 'add' ? 'Create User' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
