import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

export const Assets = () => {
  const [assets, setAssets] = useState<any[]>([]);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const token = localStorage.getItem('token') || '';
        const res = await apiFetch('/api/v1/assets', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setAssets(data);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchAssets();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Asset Inventory</h1>
      <div className="bg-gray-800 p-4 rounded-lg">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="py-2">Hostname</th>
              <th className="py-2">IP Address</th>
              <th className="py-2">OS Version</th>
              <th className="py-2">Criticality</th>
              <th className="py-2">Owner</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(asset => (
              <tr key={asset.id} className="border-t border-gray-700">
                <td className="py-2">{asset.hostname}</td>
                <td className="py-2">{asset.ip_address}</td>
                <td className="py-2">{asset.os_version || 'N/A'}</td>
                <td className="py-2">{asset.criticality}</td>
                <td className="py-2">{asset.owner || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {assets.length === 0 && <p className="mt-4 text-gray-400">No assets found.</p>}
      </div>
    </div>
  );
};
