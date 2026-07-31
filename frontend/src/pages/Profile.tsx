import { useState, useEffect } from 'react';

import { apiFetch } from '../lib/api';
import { Shield, Key, User as UserIcon, Camera, Check, X, ShieldAlert } from 'lucide-react';

export const Profile = () => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    avatar_url: '',
    new_password: '',
    confirm_password: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await apiFetch('/api/v1/users/me');
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setEditForm({
          full_name: data.full_name || '',
          avatar_url: data.avatar_url || '',
          new_password: '',
          confirm_password: ''
        });
        window.dispatchEvent(new Event('profileUpdated'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await apiFetch('/api/v1/users/me/avatar', {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        const data = await res.json();
        setProfile({...profile, avatar_url: data.avatar_url});
        setEditForm(prev => ({...prev, avatar_url: data.avatar_url}));
        setSuccess('Avatar updated successfully');
        window.dispatchEvent(new Event('profileUpdated'));
      } else {
        const err = await res.json();
        setError(err.detail || 'Failed to upload avatar');
      }
    } catch (err) {
      setError('Network error during upload');
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    
    if (editForm.new_password && editForm.new_password !== editForm.confirm_password) {
      setError('Passwords do not match');
      return;
    }
    
    const payload: any = {
      full_name: editForm.full_name
    };
    
    if (editForm.new_password) {
      payload.password = editForm.new_password;
    }
    
    try {
      const res = await apiFetch('/api/v1/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setSuccess('Profile updated successfully');
        setIsEditing(false);
        fetchProfile();
      } else {
        const errData = await res.json();
        setError(errData.detail || 'Failed to update profile');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="p-8 text-center text-rose-400">Failed to load profile</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <UserIcon className="text-teal-400" size={28} />
        <h1 className="text-2xl font-bold text-white tracking-wide">My Profile</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center gap-3 text-rose-400">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-3 text-emerald-400">
          <Check size={18} />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Avatar & Basic Info */}
        <div className="col-span-1 space-y-6">
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 flex flex-col items-center shadow-lg backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500/20 via-teal-400/80 to-emerald-400/20"></div>
            <div className="relative mb-5 group w-36 h-36 rounded-full p-1 bg-gradient-to-tr from-teal-500/30 to-emerald-400/10 flex-shrink-0">
              <div className="w-full h-full rounded-full border-4 border-slate-900 overflow-hidden bg-slate-800 shadow-inner">
                <img 
                  src={profile.avatar_url ? profile.avatar_url : `https://ui-avatars.com/api/?name=${profile.username}&background=random`} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                />
              </div>
              {isEditing && (
                <label className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="text-white mb-1" size={24} />
                  <span className="text-white text-xs font-medium">Change</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </label>
              )}
            </div>
            <h2 className="text-xl font-bold text-white mb-1">{profile.full_name || profile.username}</h2>
            <div className="flex items-center gap-2 text-slate-400 mb-4">
              <Shield size={14} className={profile.role === 'superadmin' ? 'text-rose-400' : 'text-teal-400'} />
              <span className="capitalize text-sm">{profile.role}</span>
            </div>
            
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="w-full mt-2 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl transition-all duration-300 text-sm font-semibold border border-slate-700/50 shadow-sm hover:shadow"
              >
                Edit Profile
              </button>
            ) : (
              <div className="flex gap-3 w-full mt-2">
                <button 
                  onClick={handleSave}
                  className="flex-1 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white rounded-xl transition-all duration-300 text-sm font-semibold flex justify-center items-center gap-2 shadow-lg shadow-teal-500/20"
                >
                  <Check size={16} /> Save
                </button>
                <button 
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm({
                      full_name: profile.full_name || '',
                      new_password: '',
                      confirm_password: ''
                    });
                  }}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all duration-300 text-sm font-semibold flex justify-center items-center gap-2 border border-slate-700/50"
                >
                  <X size={16} /> Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Details Form */}
        <div className="col-span-1 md:col-span-2">
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 shadow-lg backdrop-blur-sm relative">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-teal-500 rounded-full inline-block"></span>
              Account Details
            </h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">Username</label>
                <input 
                  type="text" 
                  value={profile.username} 
                  disabled 
                  className="w-full bg-slate-950/50 border border-slate-800/80 rounded-xl px-4 py-3 text-slate-500 focus:outline-none cursor-not-allowed font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">Full Name</label>
                <input 
                  type="text" 
                  value={isEditing ? editForm.full_name : (profile.full_name || '')} 
                  onChange={(e) => setEditForm({...editForm, full_name: e.target.value})}
                  disabled={!isEditing}
                  className={`w-full ${isEditing ? 'bg-slate-800/80 border-teal-500/50 text-white shadow-inner focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30' : 'bg-slate-950/50 border-slate-800/80 text-slate-300 cursor-default'} border rounded-xl px-4 py-3 outline-none transition-all duration-300 font-medium`}
                />
              </div>

              {isEditing && (
                <div className="pt-6 border-t border-slate-800/80 mt-8">
                  <h4 className="text-sm font-semibold text-slate-300 mb-5 flex items-center gap-2">
                    <Key size={16} className="text-teal-400" /> 
                    Change Password
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">New Password</label>
                      <input 
                        type="password" 
                        value={editForm.new_password} 
                        onChange={(e) => setEditForm({...editForm, new_password: e.target.value})}
                        placeholder="Leave blank to keep current"
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-3 text-white outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30 transition-all placeholder:text-slate-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">Confirm Password</label>
                      <input 
                        type="password" 
                        value={editForm.confirm_password} 
                        onChange={(e) => setEditForm({...editForm, confirm_password: e.target.value})}
                        placeholder="Confirm new password"
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-3 text-white outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30 transition-all placeholder:text-slate-600"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
