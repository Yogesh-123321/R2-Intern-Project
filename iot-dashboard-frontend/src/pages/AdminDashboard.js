// src/pages/AdminDashboard.js
import React, { useState } from 'react';
import '../App.css';
import DashboardView from './DashboardView';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('register-user');

  return (
    <div className="admin-dashboard">
      <aside className="sidebar">
        <h3>🛠 Admin Panel</h3>
        <ul>
          <li onClick={() => setActiveTab('register-user')} className={activeTab === 'register-user' ? 'active' : ''}>👤 Register User</li>
          <li onClick={() => setActiveTab('register-device')} className={activeTab === 'register-device' ? 'active' : ''}>📡 Register Device</li>
          <li onClick={() => setActiveTab('color-scheme')} className={activeTab === 'color-scheme' ? 'active' : ''}>🎨 Alarm Colors</li>
          <li onClick={() => setActiveTab('console')} className={activeTab === 'console' ? 'active' : ''}>📊 Console</li>
        </ul>
      </aside>

      <main className="tab-content">
        {activeTab === 'register-user' && <RegisterUserTab />}
        {activeTab === 'register-device' && <RegisterDeviceTab />}
        {activeTab === 'color-scheme' && <p>🎨 Alarm color customization (coming soon)</p>}
        {activeTab === 'console' && <DashboardView />}
      </main>
    </div>
  );
};

const RegisterUserTab = () => {
  const [form, setForm] = useState({ username: '', password: '', role: 'block' });
  const [status, setStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('');
    try {
      const res = await fetch('http://localhost:5000/api/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register user');
      setStatus('✅ User registered successfully');
      setForm({ username: '', password: '', role: 'block' });
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  };

  return (
    <div>
      <h2>👤 Register New User</h2>
      <form onSubmit={handleSubmit} className="admin-form">
        <input type="text" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="block">Block Officer</option>
          <option value="gp">GP Officer</option>
          <option value="user">Common User</option>
        </select>
        <button type="submit">Register</button>
        {status && <p>{status}</p>}
      </form>
    </div>
  );
};

const RegisterDeviceTab = () => {
  const [form, setForm] = useState({
    mac: '',
    block: '',
    panchayat: '',
    latitude: '',
    longitude: '',
    ipCamera: '',
  });
  const [status, setStatus] = useState('');
  const [deviceList, setDeviceList] = useState([]);

  const fetchDevices = async () => {
    const res = await fetch('http://localhost:5000/api/devices-info');
    const data = await res.json();
    setDeviceList(data);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setStatus('');
    try {
      const res = await fetch('http://localhost:5000/api/register-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac: form.mac,
          block: form.block,
          panchayat: form.panchayat,
          latitude: +form.latitude,
          longitude: +form.longitude,
          ipCamera: form.ipCamera,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Device registration failed');
      setStatus('✅ Device registered');
      setForm({ mac: '', block: '', panchayat: '', latitude: '', longitude: '', ipCamera: '' });
      fetchDevices();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  };

  const handleDelete = async (mac) => {
    try {
      const res = await fetch(`http://localhost:5000/api/device/${mac}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      fetchDevices();
    } catch (err) {
      alert('❌ Error deleting device');
    }
  };

  return (
    <div>
      <h2>📡 Register New Device</h2>
      <form onSubmit={handleRegister} className="admin-form">
        <input type="text" placeholder="MAC Address" value={form.mac} onChange={(e) => setForm({ ...form, mac: e.target.value })} required />
        <input type="text" placeholder="Block" value={form.block} onChange={(e) => setForm({ ...form, block: e.target.value })} required />
        <input type="text" placeholder="Panchayat" value={form.panchayat} onChange={(e) => setForm({ ...form, panchayat: e.target.value })} required />
        <input type="number" step="0.000001" placeholder="Latitude" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} required />
        <input type="number" step="0.000001" placeholder="Longitude" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} required />
        <input type="text" placeholder="IP Camera URL" value={form.ipCamera} onChange={(e) => setForm({ ...form, ipCamera: e.target.value })} />

        <button type="submit">Register Device</button>
        {status && <p>{status}</p>}
      </form>

      <h3>📋 Registered Devices</h3>
      <button onClick={fetchDevices}>🔄 Refresh</button>
      <ul>
        {deviceList.map((d) => (
          <li key={d.mac}>
            {d.mac} ({d.block}, {d.panchayat}) - [{d.latitude}, {d.longitude}]
            {d.ipCamera && <> | 📹 <a href={d.ipCamera} target="_blank" rel="noreferrer">Camera</a></>}
            <button onClick={() => handleDelete(d.mac)} style={{ marginLeft: '10px' }}>❌ Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AdminDashboard;
