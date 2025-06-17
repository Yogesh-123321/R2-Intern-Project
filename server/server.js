const net = require('net');
const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');
const SensorReading = require('./SensorReading');
const thresholds = require('./thresholds');

const app = express();
const connectedDevices = new Map();
app.use(bodyParser.json());
const cors = require('cors');
app.use(cors());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/iot_dashboard')
  .then(() => console.log(' MongoDB connected'))
  .catch(err => console.error(' MongoDB connection error:', err.message));

// HTTP API: Send command to a connected device
app.post('/command', (req, res) => {
  const { mac, command } = req.body;
  const deviceSocket = connectedDevices.get(mac);

  if (!deviceSocket || deviceSocket.destroyed) {
    connectedDevices.delete(mac);
    return res.status(404).json({ message: `Device ${mac} not connected` });
  }

  const buffer = Buffer.from(command, 'utf-8');
  deviceSocket.write(buffer, (err) => {
    if (err) {
      console.error(` Failed to send command to ${mac}:`, err.message);
      return res.status(500).json({ message: `Error sending command to ${mac}` });
    }
    console.log(` Sent command "${command}" to ${mac}`);
    res.json({ message: `Command sent to ${mac}` });
  });
});

//  HTTP API: Get live connected devices
app.get('/api/devices', (req, res) => {
  res.json(Array.from(connectedDevices.keys()));
});

//  HTTP API: Get all historical MACs (from MongoDB)
app.get('/api/all-devices', async (req, res) => {
  try {
    const devices = await SensorReading.distinct("mac");
    res.json(devices);
  } catch (error) {
    console.error(" Error fetching all devices:", error);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

//  HTTP API: Get latest 100 sensor readings
app.get('/api/readings', async (req, res) => {
  try {
    const readings = await SensorReading.find().sort({ timestamp: -1 }).limit(100);
    res.json(readings);
  } catch (error) {
    console.error("Error fetching readings:", error);
    res.status(500).json({ error: "Failed to fetch readings" });
  }
});

//  TCP Server: Receive binary packets from STM32
const server = net.createServer(socket => {
  console.log(' New device connected from:', socket.remoteAddress);
  let buffer = Buffer.alloc(0);

  socket.on('data', async (data) => {
    buffer = Buffer.concat([buffer, data]);

    while (buffer.length >= 29) {
      const macRaw = buffer.subarray(0, 17);
      const mac = macRaw.toString('utf-8').trim();
      const temperature = buffer.readFloatLE(17);
      const humidity = buffer.readFloatLE(21);
      const voltage = buffer.readFloatLE(25);

      const json = {
        mac,
        temperature: +temperature.toFixed(2),
        humidity: +humidity.toFixed(2),
        voltage: +voltage.toFixed(2),
        timestamp: new Date().toISOString()
      };

      connectedDevices.set(mac, socket); // track active socket
      await processData(json);

      buffer = buffer.slice(29); // remove processed packet
    }
  });

  socket.on('end', () => {
    for (const [mac, sock] of connectedDevices.entries()) {
      if (sock === socket) {
        connectedDevices.delete(mac);
        console.log(` Device ${mac} disconnected`);
      }
    }
  });

  socket.on('error', err => {
    console.error(' Socket error:', err.message);
  });
});

// Start TCP and HTTP servers
server.listen(4000, () => {
  console.log(' TCP Server running on port 4000');
});

app.listen(5000, () => {
  console.log(' HTTP Command API running on port 5000');
});

// Sensor data processing & alerting
async function processData(json) {
  console.log(' Received:', json);

  const alerts = [];
  if (json.temperature < thresholds.temperature.min || json.temperature > thresholds.temperature.max)
    alerts.push(`Temperature out of range: ${json.temperature}°C`);
  if (json.humidity < thresholds.humidity.min || json.humidity > thresholds.humidity.max)
    alerts.push(`Humidity out of range: ${json.humidity}%`);
  if (json.voltage < thresholds.voltage.min || json.voltage > thresholds.voltage.max)
    alerts.push(`Voltage out of range: ${json.voltage}V`);

  if (alerts.length > 0) {
    console.log(' ALERTS:', alerts.join(' | '));
  } else {
    console.log(' All values normal');
  }

  const reading = new SensorReading(json);
  await reading.save();
  console.log(' Saved to MongoDB');
}
