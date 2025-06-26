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

mongoose.connect('mongodb+srv://yogeshmadan1428:Gjr9Qk1FZnVt6Ytl@srmsems.28gfh0m.mongodb.net/')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// 🔧 Helper to generate static location per MAC
function getStaticLocation(mac) {
  const index = parseInt(mac.slice(-2), 16);
  return {
    latitude: 28.60 + (index % 10) * 0.01,
    longitude: 77.20 + (index % 10) * 0.01
  };
}

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
      console.error(`Failed to send command to ${mac}:`, err.message);
      return res.status(500).json({ message: `Error sending command to ${mac}` });
    }
    console.log(`Sent command "${command}" to ${mac}`);
    res.json({ message: `Command sent to ${mac}` });
  });
});

app.get('/api/devices', (req, res) => {
  res.json(Array.from(connectedDevices.keys()));
});

app.get('/api/all-devices', async (req, res) => {
  try {
    const devices = await SensorReading.distinct("mac");
    res.json(devices);
  } catch (error) {
    console.error("Error fetching all devices:", error);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

app.get('/api/readings', async (req, res) => {
  try {
    const readings = await SensorReading.find().sort({ timestamp: -1 }).limit(100);
    res.json(readings);
  } catch (error) {
    console.error("Error fetching readings:", error);
    res.status(500).json({ error: "Failed to fetch readings" });
  }
});

app.get('/api/device/:mac', async (req, res) => {
  try {
    const latest = await SensorReading.findOne({ mac: req.params.mac }).sort({ timestamp: -1 });
    if (!latest) return res.status(404).json({ message: 'No data found' });
    res.json(latest);
  } catch (err) {
    console.error('Error fetching device data:', err.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

const BULK_SAVE_LIMIT = 1000;
let readingBuffer = [];

const server = net.createServer(socket => {
  let buffer = Buffer.alloc(0);

  socket.on('data', async (data) => {
    buffer = Buffer.concat([buffer, data]);

    try {
      while (buffer.length >= 55) {
        const macRaw = buffer.subarray(0, 17);
        const macRawStr = macRaw.toString('utf-8').slice(0, 17).trim();
        const mac = /^[0-9A-Fa-f:]+$/.test(macRawStr) ? macRawStr : `INVALID_${Date.now()}`;
        if (mac.startsWith("INVALID")) {
          console.warn(`⚠️ Dropping malformed MAC: ${mac}`);
          buffer = buffer.slice(55);
          continue;
        }

        const humidity = +buffer.readFloatLE(17).toFixed(2);
        const insideTemperature = +buffer.readFloatLE(21).toFixed(2);
        const outsideTemperature = +buffer.readFloatLE(25).toFixed(2);
        const lockStatus = buffer[29] === 1 ? 'OPEN' : 'CLOSED';
        const doorStatus = buffer[30] === 1 ? 'OPEN' : 'CLOSED';
        const waterLogging = !!buffer[31];
        const waterLeakage = !!buffer[32];
        const outputVoltage = +buffer.readFloatLE(33).toFixed(2);
        const inputVoltage = +buffer.readFloatLE(37).toFixed(2);
        const batteryBackup = +buffer.readFloatLE(41).toFixed(2);
        const alarmActive = !!buffer[45];
        const fireAlarm = !!buffer[46];
        const fanLevel1Running = !!buffer[47];
        const fanLevel2Running = !!buffer[48];
        const fanLevel3Running = !!buffer[49];
        const fanFailBits = buffer.readUInt32LE(50);

        // ✅ Get location
        const { latitude, longitude } = getStaticLocation(mac);

        const floats = [
          humidity, insideTemperature, outsideTemperature,
          outputVoltage, inputVoltage, batteryBackup
        ];

        if (floats.some(val => isNaN(val) || Math.abs(val) > 100000)) {
          console.warn(`⚠️ Skipping packet from ${mac}: bad float value(s)`);
          buffer = buffer.slice(55);
          continue;
        }

        if (Math.random() < 0.01) {
          console.log(`📡 ${mac} | Temp: ${insideTemperature}°C | Humidity: ${humidity}% | Voltage: ${inputVoltage}V`);
        }

        // ✅ Individual fan statuses based on fail bits
        const fan1Status = fanLevel1Running && !(fanFailBits & (1 << 0));
        const fan2Status = fanLevel1Running && !(fanFailBits & (1 << 1));
        const fan3Status = fanLevel2Running && !(fanFailBits & (1 << 2));
        const fan4Status = fanLevel2Running && !(fanFailBits & (1 << 3));
        const fan5Status = fanLevel3Running && !(fanFailBits & (1 << 4));
        const fan6Status = fanLevel3Running && !(fanFailBits & (1 << 5));

        const reading = new SensorReading({
          mac,
          humidity,
          insideTemperature,
          outsideTemperature,
          lockStatus,
          doorStatus,
          waterLogging,
          waterLeakage,
          outputVoltage,
          inputVoltage,
          batteryBackup,
          alarmActive,
          fireAlarm,
          fanLevel1Running,
          fanLevel2Running,
          fanLevel3Running,
          fanFailBits,
          fan1Status,
          fan2Status,
          fan3Status,
          fan4Status,
          fan5Status,
          fan6Status,
          latitude,
          longitude
        });

        connectedDevices.set(mac, socket);
        readingBuffer.push(reading);

        if (readingBuffer.length >= BULK_SAVE_LIMIT) {
          const toSave = [...readingBuffer];
          readingBuffer = [];
          SensorReading.insertMany(toSave).catch(err => console.error('Bulk save error:', err.message));
        }

        buffer = buffer.slice(55);
      }
    } catch (err) {
      console.error('Packet parsing failed:', err.message);
      socket.destroy();
    }
  });

  socket.on('end', () => {
    for (const [mac, sock] of connectedDevices.entries()) {
      if (sock === socket) {
        connectedDevices.delete(mac);
        console.log(`Device ${mac} disconnected`);
      }
    }
  });

  socket.on('error', err => {
    if (err.code !== 'ECONNRESET') {
      console.error('Socket error:', err.message);
    }
  });
});

setInterval(() => {
  if (readingBuffer.length > 0) {
    const toSave = [...readingBuffer];
    readingBuffer = [];
    SensorReading.insertMany(toSave).catch(err => console.error('Periodic bulk save error:', err.message));
  }
}, 5000);

server.listen(4000, '0.0.0.0' ,() => {
  console.log('TCP server listening on port 4000');
});

app.listen(5000, '0.0.0.0' ,() => {
  console.log('HTTP server running on port 5000');
});
