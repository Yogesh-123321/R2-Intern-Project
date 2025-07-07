import React, { useEffect, useState } from 'react';
import './App.css';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const defaultLocation = [28.6139, 77.2090];

function App() {
  const [readings, setReadings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedMac, setSelectedMac] = useState('');
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState('gauges');
  const [activeFanBtns, setActiveFanBtns] = useState([]);
  const [chartKey, setChartKey] = useState(0);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const readingsRes = await fetch('http://13.201.227.67:5000/api/readings');
      const devicesRes = await fetch('http://13.201.227.67:5000/api/all-devices');
      setReadings(await readingsRes.json());
      setDevices(await devicesRes.json());
      setChartKey(prev => prev + 1);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const sendCommand = async (cmdToSend) => {
    if (!selectedMac || !cmdToSend) {
      setStatus('Please select a device and enter a command.');
      return;
    }
    try {
      const res = await fetch('http://13.201.227.67:5000/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac: selectedMac, command: cmdToSend }),
      });
      const data = await res.json();
      setStatus(data.message);
    } catch (error) {
      console.error('Command error:', error);
      setStatus('Error sending command');
    }
  };

  const latestReading = readings.find(r => r.mac === selectedMac);

  const isAlarmActive = (reading) =>
    reading.fireAlarm || reading.waterLeakage || reading.waterLogging;

  const handleFanClick = (level) => {
    const isActive = activeFanBtns.includes(level);
    setActiveFanBtns(isActive ? activeFanBtns.filter(l => l !== level) : [...activeFanBtns, level]);
    sendCommand(`fan level ${level}`);
  };

  const handleOpenLock = () => {
    const pwd = window.prompt("Enter password to open lock:");
    if (pwd === 'admin123') sendCommand('open lock');
    else setStatus('Wrong password for opening lock!');
  };

  const handleResetLock = () => {
    const pwd = window.prompt("Enter password to reset lock:");
    if (pwd === 'admin123') {
      const newLock = window.prompt("Enter new lock value:");
      if (newLock && newLock.trim() !== '') {
        sendCommand(`reset lock ${newLock}`);
      } else {
        setStatus('New lock value cannot be empty!');
      }
    } else {
      setStatus('Wrong password for resetting lock!');
    }
  };

  const historicalData = readings
    .filter(r => r.mac === selectedMac)
    .slice(-100)
    .map((r, index) => ({
      index,
      insideTemperature: r.insideTemperature,
      outsideTemperature: r.outsideTemperature,
      humidity: r.humidity,
      inputVoltage: r.inputVoltage,
      outputVoltage: r.outputVoltage,
      batteryBackup: r.batteryBackup,
      insideTemperatureAlarm: r.insideTemperatureAlarm,
      outsideTemperatureAlarm: r.outsideTemperatureAlarm,
      humidityAlarm: r.humidityAlarm,
      inputVoltageAlarm: r.inputVoltageAlarm,
      outputVoltageAlarm: r.outputVoltageAlarm,
      batteryBackupAlarm: r.batteryBackupAlarm
    }));

  const latestReadingsByMac = {};
  for (const reading of readings) {
    if (!latestReadingsByMac[reading.mac]) {
      latestReadingsByMac[reading.mac] = reading;
    }
  }

      return (
    <div className="dashboard">
      {/* ✅ TOP-LEFT: Selected Device Panel */}
      <div className="panel">
        <h2 className="selected-heading">
          📟 Selected Device{selectedMac ? <span>: {selectedMac}</span> : ''}
        </h2>

        {latestReading && (
          <>
            <div className="tabs">
              <button className={activeTab === 'gauges' ? 'active' : ''} onClick={() => setActiveTab('gauges')}>Gauges</button>
              <button className={activeTab === 'status' ? 'active' : ''} onClick={() => setActiveTab('status')}>Status</button>
              <button className={activeTab === 'camera' ? 'active' : ''} onClick={() => setActiveTab('camera')}>Camera</button>
            </div>

            {activeTab === 'gauges' && (
              <div className="gauges grid-3x3">
                <Gauge label="Inside Temp" value={latestReading.insideTemperature} max={100} color="#e63946" alarm={latestReading.insideTemperatureAlarm} />
                <Gauge label="Outside Temp" value={latestReading.outsideTemperature} max={100} color="#fca311" alarm={latestReading.outsideTemperatureAlarm} />
                <Gauge label="Humidity" value={latestReading.humidity} max={100} color="#1d3557" alarm={latestReading.humidityAlarm} />
                <Gauge label="Input Voltage" value={latestReading.inputVoltage} max={5} color="#06d6a0" alarm={latestReading.inputVoltageAlarm} />
                <Gauge label="Output Voltage" value={latestReading.outputVoltage} max={5} color="#118ab2" alarm={latestReading.outputVoltageAlarm} />
                <Gauge label="Battery (min)" value={latestReading.batteryBackup} max={120} color="#ffc107" alarm={latestReading.batteryBackupAlarm} />
              </div>
            )}

            {activeTab === 'status' && (
              <div className="fan-status">
                <div className="fan-status-line">
                  <h4>Fan Running Status</h4>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="fan-light">
                      <div className={`fan-light-circle ${latestReading[`fan${i + 1}Status`] ? 'running' : 'stopped'}`} />
                      <div className="fan-label">F{i + 1}</div>
                    </div>
                  ))}
                </div>

                <div className="alarm-line">
                  <h4>Alarms</h4>
                  {['fireAlarm', 'waterLogging', 'waterLeakage'].map((alarmKey, i) => (
                    <div key={i} className="alarm-indicator">
                      <div className={`alarm-led ${latestReading[alarmKey] ? 'active' : ''}`}></div>
                      <div className="alarm-label">{alarmKey.replace(/([A-Z])/g, ' $1')}</div>
                    </div>
                  ))}
                  {['lockStatus', 'doorStatus'].map((statusKey, i) => (
                    <div key={i} className="alarm-indicator">
                      <div className={`alarm-led ${latestReading[statusKey] === 'OPEN' ? 'active' : ''}`}></div>
                      <div className="alarm-label">{statusKey.replace('Status', '')}</div>
                    </div>
                  ))}
                </div>

                <h4>🛠 Commands</h4>
                <div className="fan-power-buttons aligned">
                  {[1, 2, 3].map(level => (
                    <div key={level} className="fan-light">
                      <button
                        className={`power-btn ${activeFanBtns.includes(level) ? 'active' : ''}`}
                        onClick={() => handleFanClick(level)}
                        title={`Fan Level ${level}`}
                      ></button>
                      <div className="fan-label">Level {level}</div>
                    </div>
                  ))}
                  <div className="fan-light">
                    <button className="lock-btn" onClick={handleOpenLock} title="Open Lock">🔓</button>
                    <div className="fan-label">Lock</div>
                  </div>
                  <div className="fan-light">
                    <button className="lock-btn" onClick={handleResetLock} title="Reset Lock">🔐</button>
                    <div className="fan-label">Reset</div>
                  </div>
                </div>
                {status && <p>{status}</p>}
              </div>
            )}

            {activeTab === 'camera' && (
              <div className="camera-tab">
                <p>📷 Camera Feed (Coming Soon)</p>
              </div>
            )}
          </>
        )}
      </div>
      {/* Top-right: Historical Graph */}
      <div className="panel">
        <h2>📈 Historical Data</h2>
        {selectedMac && historicalData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250} key={chartKey}>
                <LineChart data={historicalData} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" />
                  <YAxis />
                  <Tooltip />
                <Line
                  type="monotone"
                  dataKey="insideTemperature"
                  stroke="#ff4d4f"
                  name="Inside Temp"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="inputVoltage"
                  stroke="#00b894"
                  name="In Volt"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="humidity"
                  stroke="#1d3557"
                  name="Humidity"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="batteryBackup"
                  stroke="#ffc107"
                  name="Battery"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="outputVoltage"
                  stroke="#0984e3"
                  name="Out Volt"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="outsideTemperature"
                  stroke="#ffa500"
                  name="Outside Temp"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                </LineChart>
              </ResponsiveContainer>

        ) : (
          <p>Select a device to see its historical chart</p>
        )}
      </div>

      {/* Bottom-left: Device List */}
      <div className="panel device-list">
        <h2>🟢 Devices</h2>
        <div className="grid">
          {devices.map(mac => {
            const reading = readings.find(r => r.mac === mac);
            let colorClass = 'disconnected';

            if (reading) {
              const hasStatusAlarm = isAlarmActive(reading);
              const hasGaugeAlarm = reading.insideTemperatureAlarm || reading.outsideTemperatureAlarm || reading.humidityAlarm ||
                reading.inputVoltageAlarm || reading.outputVoltageAlarm || reading.batteryBackupAlarm;
              colorClass = hasStatusAlarm ? 'status-alarm' : hasGaugeAlarm ? 'gauge-alarm' : 'connected';
            }

            return (
              <div
                key={mac}
                className={`device-tile ${colorClass} ${selectedMac === mac ? 'selected' : ''}`}
                onClick={() => setSelectedMac(mac)}
              >
                {mac}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom-right: Map */}
      <div className="panel device-map">
        <h2>🗺️ Device Map</h2>
        <MapContainer center={defaultLocation} zoom={11} scrollWheelZoom={true} style={{ flexGrow: 1, height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" />
              {devices.map(mac => {
                const reading = latestReadingsByMac[mac];
                if (!reading || !reading.latitude || !reading.longitude) return null;

                const isConnected = readings.some(r => r.mac === mac);
                const isAlarm = isAlarmActive(reading);

                let dotClass = 'disconnected';

                if (reading) {
                  const hasStatusAlarm = isAlarmActive(reading);
                  const hasGaugeAlarm = reading.insideTemperatureAlarm || reading.outsideTemperatureAlarm || reading.humidityAlarm ||
                    reading.inputVoltageAlarm || reading.outputVoltageAlarm || reading.batteryBackupAlarm;

                  if (hasStatusAlarm) {
                    dotClass = 'status-alarm';
                  } else if (hasGaugeAlarm) {
                    dotClass = 'gauge-alarm';
                  } else {
                    dotClass = 'connected';
                  }
                }

                const icon = L.divIcon({
                  className: 'custom-marker',
                  html: `<div class="marker-dot ${dotClass}"></div>`,
                  iconSize: [20, 20],
                  iconAnchor: [10, 10],
                });


                return (
                  <Marker key={mac} position={[reading.latitude, reading.longitude]} icon={icon}
                    eventHandlers={{ click: () => setSelectedMac(mac) }}>
                    <Popup>{mac}</Popup>
                  </Marker>
                );
              })}

        </MapContainer>
      </div>
    </div>
  );
}

function Gauge({ label, value, max, color, alarm = false }) {
  return (
    <div className={`gauge-box small ${alarm ? 'alarm' : ''}`}>
      <CircularProgressbar
        value={value}
        maxValue={max}
        text={`${value}`}
        styles={buildStyles({ pathColor: color, textColor: '#fff', trailColor: '#333' })}
      />
      <div className="gauge-label">{label}</div>
    </div>
  );
}

export default App;
