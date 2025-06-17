import React, { useEffect, useState } from 'react';
import './App.css';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer
} from 'recharts';

function App() {
  const [readings, setReadings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedMac, setSelectedMac] = useState('');
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState('');

  const fetchData = async () => {
    try {
      const readingsRes = await fetch('http://localhost:5000/api/readings');
      const devicesRes = await fetch('http://localhost:5000/api/devices');
      setReadings(await readingsRes.json());
      setDevices(await devicesRes.json());
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const sendCommand = async () => {
    if (!selectedMac || !command) {
      setStatus('Please select a device and enter a command.');
      return;
    }
    try {
      const res = await fetch('http://localhost:5000/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac: selectedMac, command }),
      });
      const data = await res.json();
      setStatus(data.message);
      setCommand('');
    } catch (error) {
      console.error('Command error:', error);
      setStatus('Error sending command');
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const latestReading = readings.find(r => r.mac === selectedMac);

  return (
    <div className="App">
      <h1>📡 IoT Dashboard</h1>

      <div className="device-section">
        <h2>🟢 Connected Devices ({devices.length})</h2>
        <select onChange={(e) => setSelectedMac(e.target.value)} value={selectedMac}>
          <option value="">Select a device</option>
          {devices.map(mac => (
            <option key={mac} value={mac}>{mac}</option>
          ))}
        </select>
      </div>

      {latestReading && (
        <div className="gauges">
          <Gauge label="Temperature (°C)" value={latestReading.temperature} max={100} color="#e63946" />
          <Gauge label="Humidity (%)" value={latestReading.humidity} max={100} color="#1d3557" />
          <Gauge label="Voltage (V)" value={latestReading.voltage} max={5} color="#2a9d8f" />
        </div>
      )}

      {selectedMac && (
        <div className="charts">
          <h2>📈 Sensor Data for {selectedMac}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={readings.filter(r => r.mac === selectedMac).slice(-20)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" tickFormatter={(t) => new Date(t).toLocaleTimeString()} />
              <YAxis />
              <Tooltip labelFormatter={(t) => new Date(t).toLocaleString()} />
              <Legend />
              <Line type="monotone" dataKey="temperature" stroke="#e63946" name="Temp" />
              <Line type="monotone" dataKey="humidity" stroke="#1d3557" name="Humidity" />
              <Line type="monotone" dataKey="voltage" stroke="#2a9d8f" name="Voltage" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="command-section">
        <h2>🛠 Send Command</h2>
        <input
          type="text"
          placeholder="Enter command"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <button onClick={sendCommand}>Send</button>
        {status && <p>{status}</p>}
      </div>
    </div>
  );
}

function Gauge({ label, value, max, color }) {
  return (
    <div style={{ width: 120, margin: '20px' }}>
      <CircularProgressbar
        value={value}
        maxValue={max}
        text={`${value}`}
        styles={buildStyles({
          pathColor: color,
          textColor: '#333',
          trailColor: '#eee'
        })}
      />
      <div style={{ textAlign: 'center', marginTop: '10px' }}>{label}</div>
    </div>
  );
}

export default App;
