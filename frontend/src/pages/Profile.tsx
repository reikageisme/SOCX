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
      full_name: editForm.full_name,
      avatar_url: editForm.avatar_url
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
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col items-center">
            <div className="relative mb-4 group w-32 h-32 rounded-full border-4 border-slate-800 flex-shrink-0">
              <img 
                src={profile.avatar_url ? profile.avatar_url : `https://ui-avatars.com/api/?name=${profile.username}&background=random`} 
                alt="Avatar" 
                className="w-full h-full rounded-full object-cover"
              />
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
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm font-medium border border-slate-700"
              >
                Edit Profile
              </button>
            ) : (
              <div className="flex gap-2 w-full">
                <button 
                  onClick={handleSave}
                  className="flex-1 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors text-sm font-medium flex justify-center items-center gap-1"
                >
                  <Check size={16} /> Save
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm font-medium flex justify-center items-center gap-1"
                >
                  <X size={16} /> Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Details Form */}
        <div className="col-span-1 md:col-span-2">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-medium text-white mb-6 border-b border-slate-800 pb-2">Account Details</h3>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Username</label>
                <input 
                  type="text" 
                  value={profile.username} 
                  disabled 
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-300 focus:outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Full Name</label>
                <input 
                  type="text" 
                  value={isEditing ? editForm.full_name : (profile.full_name || '')} 
                  onChange={(e) => setEditForm({...editForm, full_name: e.target.value})}
                  disabled={!isEditing}
                  className={`w-full ${isEditing ? 'bg-slate-800 border-teal-500/50 text-white' : 'bg-slate-800/50 border-slate-700 text-slate-300'} border rounded-lg px-4 py-2 focus:outline-none transition-colors`}
                />
              </div>

              {isEditing && (
                <div className="pt-4 border-t border-slate-800 mt-6">
                  <h4 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                    <Key size={16} className="text-teal-400" /> 
                    Change Password
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">New Password</label>
                      <input 
                        type="password" 
                        value={editForm.new_password} 
                        onChange={(e) => setEditForm({...editForm, new_password: e.target.value})}
                        placeholder="Leave blank to keep current"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Confirm Password</label>
                      <input 
                        type="password" 
                        value={editForm.confirm_password} 
                        onChange={(e) => setEditForm({...editForm, confirm_password: e.target.value})}
                        placeholder="Confirm new password"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500/50 transition-colors"
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
