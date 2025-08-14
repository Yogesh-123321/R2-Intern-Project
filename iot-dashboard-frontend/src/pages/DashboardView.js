import React, { useEffect, useState, useRef } from 'react';
import '../App.css';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const defaultLocation = [28.6139, 77.2090];

function DashboardView() {
  const [readings, setReadings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceMeta, setDeviceMeta] = useState([]);
  const [selectedMac, setSelectedMac] = useState('');
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState('gauges');
  const [activeFanBtns, setActiveFanBtns] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

//Map and marker refs
  const mapRef = useRef(null);
  const markerRefs = useRef({});

  const latestReadingsByMac = {};
  readings.forEach(r => {
    const existing = latestReadingsByMac[r.mac];
    if (!existing || new Date(r.timestamp) > new Date(existing.timestamp)) {
      latestReadingsByMac[r.mac] = r;
    }
  });


  const selectedDeviceMeta = deviceMeta.find(d => d.mac === selectedMac);
  const latestReading = readings.find(r => r.mac === selectedMac);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // 🔄 Auto-focus map on selected device
  useEffect(() => {
    if (mapRef.current && selectedMac) {
      const selectedDevice = deviceMeta.find(d => d.mac === selectedMac);
      const lat = parseFloat(selectedDevice?.latitude);
      const lon = parseFloat(selectedDevice?.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        mapRef.current.flyTo([lat, lon], 15, { duration: 1.5 });
        console.log(`🔍 Flying to ${selectedMac} at [${lat}, ${lon}]`);
      }
    }
  }, [selectedMac, deviceMeta]);

  useEffect(() => {
    const iframe = document.querySelector('.camera-iframe');
    if (iframe) {
      iframe.style.transform = `scale(${zoom}) rotate(${rotation}deg)`;
    }
  }, [zoom, rotation]);

  
  const fetchData = async () => {
    try {
      const [readingsRes, devicesRes, deviceMetaRes] = await Promise.all([
        fetch('http://localhost:5000/api/readings'),
        fetch('http://localhost:5000/api/all-devices'),
        fetch('http://localhost:5000/api/devices-info')
      ]);

      // Fallback to [] if any response fails
      let readingsData = [], devicesData = [], metadata = [];

      if (readingsRes.ok) readingsData = await readingsRes.json();
      if (devicesRes.ok) devicesData = await devicesRes.json();
      if (deviceMetaRes.ok) metadata = await deviceMetaRes.json();

      setReadings(Array.isArray(readingsData) ? readingsData : []);
      setDevices(Array.isArray(devicesData) ? devicesData : []);
      setDeviceMeta(Array.isArray(metadata) ? metadata : []);
      setReadings(readingsData);
      setDevices(devicesData);
      setDeviceMeta(metadata);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

 const handleMapCreated = (mapInstance) => {
  if (!mapRef.current) {
    mapRef.current = mapInstance;
    console.log('Map ref set:', mapRef.current); // <--- You should see this log ONCE
  }
};

  const sendCommand = async (cmdToSend) => {
    if (!selectedMac || !cmdToSend) {
      setStatus('Please select a device and enter a command.');
      return;
    }
    try {
      const res = await fetch('http://localhost:5000/command', {
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

  const handleFanClick = (level) => {
  const isActive = activeFanBtns.includes(level);
  const command = isActive ? `fan off level ${level}` : `fan on level ${level}`;
  
  sendCommand(command);

  // Update UI immediately (optional, for instant feedback)
  setActiveFanBtns(isActive 
    ? activeFanBtns.filter(l => l !== level) 
    : [...activeFanBtns, level]
  );
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

  const toggleFullscreen = () => {
    const iframe = document.querySelector('.camera-iframe');
    if (iframe.requestFullscreen) iframe.requestFullscreen();
    else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
    else if (iframe.msRequestFullscreen) iframe.msRequestFullscreen();
  };

  const zoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.1, 1));
  const rotateFeed = () => setRotation(prev => (prev + 90) % 360);

  const isAlarmActive = (reading) =>
    reading.fireAlarm || reading.waterLeakage || reading.waterLogging;

  const historicalData = readings
    .filter(r => r.mac === selectedMac && r.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) // oldest to latest
    .slice(-15)
    .map(r => ({
      time: new Date(r.timestamp).toLocaleTimeString([], { month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',hour12: false }),
       insideTemperature: Number(r.insideTemperature.toFixed(2)),
outsideTemperature: Number(r.outsideTemperature.toFixed(2)),
humidity: Number(r.humidity.toFixed(2)),
inputVoltage: Number(r.inputVoltage.toFixed(2)),
outputVoltage: Number(r.outputVoltage.toFixed(2)),
batteryBackup: Number(r.batteryBackup.toFixed(2)),

      // insideTemperature: r.insideTemperature,
      // outsideTemperature: r.outsideTemperature,
      // humidity: r.humidity,
      // inputVoltage: r.inputVoltage,
      // outputVoltage: r.outputVoltage,
      // batteryBackup: r.batteryBackup

    }));


  return (
    <>
    {/* Logo */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        zIndex: 9999
      }}>
        <img src="/technotrendz.png" alt="Technotrendz Logo" style={{ height: '40px', width: '100px' }} />
      </div>
    <div className="dashboard">
      <div className="panel">
        <h2 className="selected-heading">📟 Selected iMoni {selectedMac && <span>: {selectedMac}</span>}</h2>
        {latestReading && (
          <>
            <div className="tabs">
              <button className={activeTab === 'gauges' ? 'active' : ''} onClick={() => setActiveTab('gauges')}>Gauges</button>
              <button className={activeTab === 'status' ? 'active' : ''} onClick={() => setActiveTab('status')}>Status</button>
              <button className={activeTab === 'camera-feed' ? 'active' : ''} onClick={() => setActiveTab('camera-feed')}>Camera Feed</button>
              <button className={activeTab === 'snapshots' ? 'active' : ''} onClick={() => setActiveTab('snapshots')}>Snapshots</button>
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
                    {[...Array(6)].map((_, i) => {
                      const running = latestReading[`fan${i + 1}Status`];      // true if running
                      const faulty = latestReading[`fan${i + 1}Fault`];        // true if faulty

                      let statusClass = 'off'; // default grey
                      if (running && !faulty) statusClass = 'running'; // green
                      else if (running && faulty) statusClass = 'faulty'; // red
                      else if (!running && faulty) statusClass = 'faulty'; // red even if off

                      return (
                        <div key={i} className="fan-light">
                          <div className={`fan-light-circle ${statusClass}`} />
                          <div className="fan-label">F{i + 1}</div>
                        </div>
                      );
                    })}
                  </div>

                <div className="alarm-line">
                  <h4>Alarms</h4>
                  {['fireAlarm', 'waterLogging', 'waterLeakage'].map((key, i) => (
                    <div key={i} className="alarm-indicator">
                      <div className={`alarm-led ${latestReading[key] ? 'active' : ''}`} />
                      <div className="alarm-label">{key.replace(/([A-Z])/g, ' $1')}</div>
                    </div>
                  ))}
                  {['lockStatus', 'doorStatus'].map((key, i) => (
                    <div key={i} className="alarm-indicator">
                      <div className={`alarm-led ${latestReading[key] === 'OPEN' ? 'active' : ''}`} />
                      <div className="alarm-label">{key.replace('Status', '')}</div>
                    </div>
                  ))}
                </div>
                <h4>🛠 Commands</h4>
                <div className="fan-power-buttons aligned">
                    {[1, 2, 3, 4].map(level => (
                      <div key={level} className="fan-light">
                        <button className={`power-btn ${activeFanBtns.includes(level) ? 'active' : ''}`} onClick={() => handleFanClick(level)} />
                        <div className="fan-label">Level {level}</div>
                      </div>
                    ))}
                  <div className="fan-light">
                    <button className="lock-btn" onClick={handleOpenLock}>🔓</button>
                    <div className="fan-label">Lock</div>
                  </div>
                  <div className="fan-light">
                    <button className="lock-btn" onClick={handleResetLock}>🔐</button>
                    <div className="fan-label">Reset</div>
                  </div>
                </div>
                {status && <p>{status}</p>}
              </div>
            )}

            {activeTab === 'camera-feed' && (
              <div className="camera-feed-wrapper">
                <div className="camera-frame">
                  <iframe
                    className="camera-iframe"
                    src={selectedDeviceMeta?.ipCamera || ''}
                    allow="autoplay"
                    title="Live Camera"
                  />
                </div>
                <div className="camera-controls">
                  <button onClick={toggleFullscreen}>🔳 Fullscreen</button>
                  <button onClick={rotateFeed}>🔄 Rotate</button>
                  <button onClick={zoomIn}>➕ Zoom In</button>
                  <button onClick={zoomOut}>➖ Zoom Out</button>
                </div>
              </div>
            )}

            {activeTab === 'snapshots' && (
              <div className="camera-tab">
                <h4>🖼️ Last 15 Snapshots (Placeholder)</h4>
                <div className="snapshots-grid">
                  {[...Array(15)].map((_, i) => (
                    <img key={i} src={`https://via.placeholder.com/120x90?text=Img+${i + 1}`} alt={`snapshot-${i + 1}`} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Panel 2: Chart */}
      <div className="panel">
        <h2>📈 Historical Data</h2>
        {selectedMac && historicalData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                  dataKey="time"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fontSize: 10, fill: '#ccc' }}
                />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="insideTemperature" stroke="#ff4d4f" dot={false} isAnimationActive={true} name="insideTemp" />
              <Line type="monotone" dataKey="humidity" stroke="#1d3557" dot={false} isAnimationActive={true} />
              <Line type="monotone" dataKey="inputVoltage" stroke="#00b894" dot={false} isAnimationActive={true} name="I/P volt" />
              <Line type="monotone" dataKey="outputVoltage" stroke="#0984e3" dot={false} isAnimationActive={true} name="O/P volt" />
              <Line type="monotone" dataKey="batteryBackup" stroke="#ffc107" dot={false} isAnimationActive={true} name="Battery" />
              <Line type="monotone" dataKey="outsideTemperature" stroke="#ffa500" dot={false} isAnimationActive={true} name="outsideTemp" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p>Select a device to see its historical chart</p>
        )}
      </div>

      {/* Panel 3: Device Tiles */}
  <div className="panel device-list">
  <h2>🟢 Devices</h2>
  <div className="grid">
    {(() => {
      const latestReadingsByMac = {};
      readings.forEach(r => {
        const existing = latestReadingsByMac[r.mac];
        if (!existing || new Date(r.timestamp) > new Date(existing.timestamp)) {
          latestReadingsByMac[r.mac] = r;
        }
      });

      return deviceMeta.map(device => {
        const mac = device.mac;
        const reading = latestReadingsByMac[mac];
        let colorClass = 'disconnected'; // default

        if (reading && reading.timestamp) {
          const age = Date.now() - new Date(reading.timestamp).getTime();
          const staleThreshold = 30000; // 30 seconds

          if (age <= staleThreshold) {
            // Use status from latest valid reading
            const hasStatusAlarm = isAlarmActive(reading);
            const hasGaugeAlarm =
              reading.insideTemperatureAlarm || reading.outsideTemperatureAlarm ||
              reading.humidityAlarm || reading.inputVoltageAlarm ||
              reading.outputVoltageAlarm || reading.batteryBackupAlarm;

            colorClass =
              hasStatusAlarm ? 'status-alarm'
              : hasGaugeAlarm ? 'gauge-alarm'
              : 'connected';
          } else {
            // Reading is stale — treat as disconnected
            colorClass = 'disconnected';
          }
        }

        return (
          <div
            key={mac}
            className={`device-tile ${colorClass} ${selectedMac === mac ? 'selected' : ''}`}
            onClick={() => setSelectedMac(mac)}
          >
            {device.locationId || mac}
          </div>
        );
      });
    })()}
  </div>
</div>
     
      {/* Panel 4: Map */}
     <div className="panel device-map">
  <h2>🗺️ Device Map</h2>

  {(() => {
    const selectedDevice = deviceMeta.find(d => d.mac === selectedMac);
    const lat = parseFloat(selectedDevice?.latitude);
    const lon = parseFloat(selectedDevice?.longitude);
    const selectedCenter = (!isNaN(lat) && !isNaN(lon)) ? [lat, lon] : defaultLocation;

    return (
      <MapContainer
        key={selectedMac || 'default-map'}
        center={selectedCenter}
        zoom={15}
        scrollWheelZoom={true}
        style={{ height: '315px', width: '100%' }}
        whenCreated={handleMapCreated}
      >
        <TileLayer
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>'
        />

        {deviceMeta.map(device => {
          const mac = device.mac;
          const reading = latestReadingsByMac[mac];

          let dotClass = 'disconnected'; // Default state

          if (reading) {
            const timeDiff = Date.now() - new Date(reading.timestamp).getTime();
            const isStale = timeDiff > 30000;

            if (!isStale) {
              const hasStatusAlarm = isAlarmActive(reading);
              const hasGaugeAlarm =
                reading.insideTemperatureAlarm ||
                reading.outsideTemperatureAlarm ||
                reading.humidityAlarm ||
                reading.inputVoltageAlarm ||
                reading.outputVoltageAlarm ||
                reading.batteryBackupAlarm;

              dotClass = hasStatusAlarm
                ? 'status-alarm'
                : hasGaugeAlarm
                ? 'gauge-alarm'
                : 'connected';
            }
          }

          const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div class="marker-dot ${dotClass}"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });

          const lat = parseFloat(device.latitude);
          const lon = parseFloat(device.longitude);
          if (isNaN(lat) || isNaN(lon)) return null;

          return (
            <Marker
              key={mac}
              position={[lat, lon]}
              icon={icon}
              ref={ref => {
                markerRefs.current[mac] = ref;
              }}
              eventHandlers={{
                click: () => setSelectedMac(mac),
              }}
            >
              <Popup>
                {device.locationId || mac}
                <br />
                {device.address || ''}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    );
  })()}

  <div style={{
    marginTop: '8px',
    fontSize: '0.8rem',
    color: '#aaa',
    textAlign: 'right'
  }}>
    Best viewed on {navigator.userAgent.includes("Chrome") ? "Chrome" :
      navigator.userAgent.includes("Firefox") ? "Firefox" : "your browser"} @ {window.innerWidth}x{window.innerHeight}
  </div>
</div>

      </div>
    </>
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

export default DashboardView;
