require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Device = require('./models/Device');
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

// DB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err.message));

// --------------- HTTP API Endpoints (unchanged) ---------------
app.get('/ping', async (req, res) => {
    try {
        await mongoose.connection.db.admin().ping();
        res.send('pong');
    } catch (e) {
        console.error('⚠️ /ping DB check failed:', e.message);
        res.status(500).send('MongoDB unreachable');
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign(
            { username: 'admin', role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );
        return res.json({ role: 'admin', token });
    }
    const user = await User.findOne({ username: username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
        { username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '2h' }
    );
    res.json({ role: user.role, token });
});

app.post('/api/register-user', async (req, res) => {
    const { username, password, role } = req.body;
    if (!['admin', 'block', 'gp', 'user'].includes(role))
        return res.status(400).json({ error: 'Invalid role' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username: username.toLowerCase(),
            password: hashedPassword,
            role
        });
        await user.save();
        res.json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error creating user' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        console.error('Failed to fetch users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/register-device', async (req, res) => {
    const { mac, locationId, address, latitude, longitude, ipCamera } = req.body;
    try {
        const device = new Device({
            mac,
            locationId,
            address,
            latitude,
            longitude,
            ipCamera: ipCamera || ''
        });
        await device.save();
        res.json({ message: 'Device registered successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error registering device' });
    }
});

app.get('/api/devices-info', async (req, res) => {
    try {
        const devices = await Device.find();
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching devices' });
    }
});

app.put('/api/device/:mac', async (req, res) => {
    try {
        const { password, ...updateFields } = req.body;
        if (updateFields.locationId && updateFields.locationId.length > 17)
            return res.status(400).json({ error: 'Location ID must be 17 characters or fewer' });
        if (password !== process.env.ADMIN_PASSWORD)
            return res.status(403).json({ error: 'Unauthorized: Invalid admin password' });
        const { mac } = req.params;
        const updatedDevice = await Device.findOneAndUpdate(
            { mac },
            { $set: updateFields },
            { new: true }
        );
        if (!updatedDevice) return res.status(404).json({ error: 'Device not found' });
        res.json(updatedDevice);
    } catch (error) {
        console.error('Error updating device:', error);
        res.status(500).json({ error: 'Server error while updating device' });
    }
});

app.post('/api/device/delete/:mac', async (req, res) => {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD)
        return res.status(403).json({ error: 'Unauthorized: Invalid admin password' });
    try {
        const result = await Device.deleteOne({ mac: req.params.mac });
        if (result.deletedCount === 0)
            return res.status(404).json({ error: 'Device not found' });
        res.json({ message: 'Device deleted successfully' });
    } catch (err) {
        console.error('Error deleting device:', err);
        res.status(500).json({ error: 'Error deleting device' });
    }
});

app.get('/api/devices', (req, res) => {
    res.json(Array.from(connectedDevices.keys()));
});

app.get('/api/all-devices', async (req, res) => {
    try {
        const devices = await Device.find({}, 'mac');
        res.json(devices.map(d => d.mac));
    } catch (error) {
        console.error("Error fetching registered devices:", error);
        res.status(500).json({ error: "Failed to fetch devices" });
    }
});

app.get('/api/readings', async (req, res) => {
    try {
        const readings = await SensorReading.find().sort({ timestamp: -1 }).limit(400);
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

app.get('/api/historical-data', async (req, res) => {
    const { mac, datetime } = req.query;
    if (!mac || !datetime)
        return res.status(400).json({ error: 'Missing mac or datetime' });
    const datetimeObj = new Date(datetime);
    if (isNaN(datetimeObj.getTime()))
        return res.status(400).json({ error: 'Invalid datetime format' });
    const selectedDate = new Date(datetimeObj);
    selectedDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    try {
        const readings = await SensorReading.find({
            mac,
            timestamp: { $gte: selectedDate, $lt: nextDate }
        }).sort({ timestamp: 1 });
        const atSelectedTime = await SensorReading.findOne({
            mac,
            timestamp: { $lte: datetimeObj }
        }).sort({ timestamp: -1 });
        res.json({ readings, atSelectedTime });
    } catch (err) {
        console.error('Historical data error:', err.message);
        res.status(500).json({ error: 'Failed to fetch historical data' });
    }
});

app.get('/api/thresholds', (req, res) => {
    res.json(thresholds);
});

// --------------------- TCP Server (58-byte packet format) ---------------------

const BULK_SAVE_LIMIT = 1000;
let readingBuffer = [];
const server = net.createServer(socket => {
    let buffer = Buffer.alloc(0);
    socket.on('data', async data => {
        buffer = Buffer.concat([buffer, data]);
        try {
            while (buffer.length >= 58) { // Expect 58-byte packet
                // MAC (bytes 0–16)
                const macRaw = buffer.subarray(0, 17);
                const macRawStr = macRaw.toString('utf-8').slice(0, 17).trim();
                const mac = /^[0-9A-Fa-f:]+$/.test(macRawStr) ? macRawStr : `INVALID_${Date.now()}`;
                if (mac.startsWith("INVALID")) {
                    console.warn(`⚠️ Dropping malformed MAC: ${mac}`);
                    buffer = buffer.slice(58);
                    continue;
                }

                // Sensor floats (bytes 17–28)
                const humidity = +buffer.readFloatLE(17).toFixed(2);
                const insideTemperature = +buffer.readFloatLE(21).toFixed(2);
                const outsideTemperature = +buffer.readFloatLE(25).toFixed(2);

                // Status bytes (bytes 29–32)
                const lockStatus = buffer[29] === 1 ? 'OPEN' : 'CLOSED';
                const doorStatus = buffer[30] === 1 ? 'OPEN' : 'CLOSED';
                const waterLogging = !!buffer[31];
                const waterLeakage = !!buffer[32];

                // Voltage/battery (bytes 33–52)
                const outputVoltage = +buffer.readFloatLE(33).toFixed(2);
                const inputVoltage = +buffer.readFloatLE(37).toFixed(2);
                const batteryBackup = +buffer.readFloatLE(41).toFixed(2);

                // Alarm, fire, fanLevels, padding (bytes 45–52)
                const alarmActive = !!buffer[45];
                const fireAlarm = !!buffer[46];
                const fanLevel1Running = !!buffer[47];
                const fanLevel2Running = !!buffer[48];
                const fanLevel3Running = !!buffer[49];
                const fanLevel4Running = !!buffer[50];
                // const padding = buffer[51]; // unused

                // Fan status bits (bytes 52–53, uint16, 2 bits/fan, 6 fans)
                const fanStatusBits = buffer.readUInt16LE(52);
                const fanStatus = [];
                for (let i = 0; i < 6; i++) {
                    fanStatus[i] = (fanStatusBits >> (i * 2)) & 0x03; // 0=off, 1=healthy, 2=faulty
                }

                // Fail mask (bytes 54–57, uint32)
                const fanFailBits = buffer.readUInt32LE(54); // <-- Critical offset

                // Sensor value sanity checks
                const floats = [
                    humidity, insideTemperature, outsideTemperature,
                    outputVoltage, inputVoltage, batteryBackup
                ];
                if (floats.some(val => isNaN(val) || Math.abs(val) > 100000)) {
                    console.warn(`⚠️ Skipping packet from ${mac}: bad float value(s)`);
                    buffer = buffer.slice(58);
                    continue;
                }

                // Optional: log sample readings to console occasionally
                if (Math.random() < 0.01) {
                    console.log(`📡 ${mac} | Temp: ${insideTemperature}°C | Humidity: ${humidity}% | Voltage: ${inputVoltage}V | Fan stat=${fanStatusBits.toString(16)}h`);
                }

                // Threshold-based alarms
                const thresholdAlarms = {
                    insideTemperatureAlarm: insideTemperature > thresholds.insideTemperature.max || insideTemperature < thresholds.insideTemperature.min,
                    outsideTemperatureAlarm: outsideTemperature > thresholds.outsideTemperature.max || outsideTemperature < thresholds.outsideTemperature.min,
                    humidityAlarm: humidity > thresholds.humidity.max || humidity < thresholds.humidity.min,
                    inputVoltageAlarm: inputVoltage > thresholds.inputVoltage.max || inputVoltage < thresholds.inputVoltage.min,
                    outputVoltageAlarm: outputVoltage > thresholds.outputVoltage.max || outputVoltage < thresholds.outputVoltage.min,
                    batteryBackupAlarm: batteryBackup < thresholds.batteryBackup.min
                };

                // Build and save the reading (fan status is now independent, not derived)
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
                    fanLevel4Running,
                    fanFailBits,   // keep for legacy (optional)
                    fan1Status: fanStatus[0],
                    fan2Status: fanStatus[1],
                    fan3Status: fanStatus[2],
                    fan4Status: fanStatus[3],
                    fan5Status: fanStatus[4],
                    fan6Status: fanStatus[5],
                    ...thresholdAlarms
                });

                // Track connected devices
                connectedDevices.set(mac, socket);

                // Buffer for bulk insert
                readingBuffer.push(reading);
                if (readingBuffer.length >= BULK_SAVE_LIMIT) {
                    const toSave = [...readingBuffer];
                    readingBuffer = [];
                    SensorReading.insertMany(toSave).catch(err => console.error('Bulk save error:', err.message));
                }

                // Advance buffer
                buffer = buffer.slice(58);
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

// Auto save readings
setInterval(() => {
    if (readingBuffer.length > 0) {
        const toSave = [...readingBuffer];
        readingBuffer = [];
        SensorReading.insertMany(toSave).catch(err => console.error('Periodic bulk save error:', err.message));
    }
}, 5000);

server.listen(4000, '0.0.0.0', () => {
    console.log('TCP server listening on port 4000');
});

app.listen(5000, '0.0.0.0', () => {
    console.log('HTTP server running on port 5000');
});



// require('dotenv').config();
// const bcrypt = require('bcrypt');
// const jwt = require('jsonwebtoken');
// const User = require('./models/User');
// const Device = require('./models/Device');
// const net = require('net');
// const mongoose = require('mongoose');
// const express = require('express');
// const bodyParser = require('body-parser');
// const SensorReading = require('./SensorReading');
// const thresholds = require('./thresholds');

// const app = express();
// const connectedDevices = new Map();
// app.use(bodyParser.json());
// const cors = require('cors');
// app.use(cors());

// // 🔌 DB connection
// mongoose.connect(process.env.MONGO_URI)
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.error('MongoDB connection error:', err.message));

// app.get('/ping', async (req, res) => {
//   try {
//     await mongoose.connection.db.admin().ping();
//     res.send('pong');
//   } catch (e) {
//     console.error('⚠️ /ping DB check failed:', e.message);
//     res.status(500).send('MongoDB unreachable');
//   }
// });

// // ✅ Login route (admin hardcoded via .env)
// app.post('/api/login', async (req, res) => {
//   const { username, password } = req.body;

//   if (
//     username === process.env.ADMIN_USERNAME &&
//     password === process.env.ADMIN_PASSWORD
//   ) {
//     const token = jwt.sign(
//       { username: 'admin', role: 'admin' },
//       process.env.JWT_SECRET,
//       { expiresIn: '2h' }
//     );
//     return res.json({ role: 'admin', token });
//   }

//   const user = await User.findOne({ username: username });
//   if (!user) return res.status(401).json({ error: 'Invalid credentials' });

//   const isMatch = await bcrypt.compare(password, user.password);
//   if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

//   const token = jwt.sign(
//     { username: user.username, role: user.role },
//     process.env.JWT_SECRET,
//     { expiresIn: '2h' }
//   );

//   res.json({ role: user.role, token });
// });

// // ✅ Register new user
// app.post('/api/register-user', async (req, res) => {
//   const { username, password, role } = req.body;

//   if (!['admin', 'block', 'gp', 'user'].includes(role)) {
//     return res.status(400).json({ error: 'Invalid role' });
//   }

//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const user = new User({
//       username: username.toLowerCase(),
//       password: hashedPassword,
//       role
//     });
//     await user.save();
//     res.json({ message: 'User registered successfully' });
//   } catch (err) {
//     res.status(500).json({ error: 'Error creating user' });
//   }
// });

// // ✅ Register new device
// app.post('/api/register-device', async (req, res) => {
//   const { mac, locationId, address, latitude, longitude, ipCamera } = req.body;

//   try {
//     const device = new Device({
//       mac,
//       locationId,
//       address,
//       latitude,
//       longitude,
//       ipCamera: ipCamera || ''
//     });
//     await device.save();
//     res.json({ message: 'Device registered successfully' });
//   } catch (err) {
//     res.status(500).json({ error: 'Error registering device' });
//   }
// });

// // ✅ Get registered device metadata
// app.get('/api/devices-info', async (req, res) => {
//   try {
//     const devices = await Device.find();
//     res.json(devices);
//   } catch (err) {
//     res.status(500).json({ error: 'Error fetching devices' });
//   }
// });

// // ✅ Update device
// app.put('/api/device/:mac', async (req, res) => {
//   try {
//     const { password, ...updateFields } = req.body;

//     if (updateFields.locationId && updateFields.locationId.length > 17) {
//       return res.status(400).json({ error: 'Location ID must be 17 characters or fewer' });
//     }

//     if (password !== process.env.ADMIN_PASSWORD) {
//       return res.status(403).json({ error: 'Unauthorized: Invalid admin password' });
//     }

//     const { mac } = req.params;

//     const updatedDevice = await Device.findOneAndUpdate(
//       { mac },
//       { $set: updateFields },
//       { new: true }
//     );

//     if (!updatedDevice) {
//       return res.status(404).json({ error: 'Device not found' });
//     }

//     res.json(updatedDevice);
//   } catch (error) {
//     console.error('Error updating device:', error);
//     res.status(500).json({ error: 'Server error while updating device' });
//   }
// });

// // ✅ Delete device
// app.post('/api/device/delete/:mac', async (req, res) => {
//   const { password } = req.body;

//   if (password !== process.env.ADMIN_PASSWORD) {
//     return res.status(403).json({ error: 'Unauthorized: Invalid admin password' });
//   }

//   try {
//     const result = await Device.deleteOne({ mac: req.params.mac });

//     if (result.deletedCount === 0) {
//       return res.status(404).json({ error: 'Device not found' });
//     }

//     res.json({ message: 'Device deleted successfully' });
//   } catch (err) {
//     console.error('Error deleting device:', err);
//     res.status(500).json({ error: 'Error deleting device' });
//   }
// });

// // ✅ Command endpoint
// app.post('/command', (req, res) => {
//   const { mac, command } = req.body;
//   const deviceSocket = connectedDevices.get(mac);

//   if (!deviceSocket || deviceSocket.destroyed) {
//     connectedDevices.delete(mac);
//     return res.status(404).json({ message: `Device ${mac} not connected` });
//   }

//   const buffer = Buffer.from(command, 'utf-8');
//   deviceSocket.write(buffer, (err) => {
//     if (err) {
//       console.error(`Failed to send command to ${mac}:`, err.message);
//       return res.status(500).json({ message: `Error sending command to ${mac}` });
//     }
//     console.log(`Sent command "${command}" to ${mac}`);
//     res.json({ message: `Command sent to ${mac}` });
//   });
// });

// // ✅ Get all users
// app.get('/api/users', async (req, res) => {
//   try {
//     const users = await User.find();
//     res.json(users);
//   } catch (err) {
//     console.error('Failed to fetch users:', err);
//     res.status(500).json({ error: 'Failed to fetch users' });
//   }
// });

// // ✅ Get connected MACs
// app.get('/api/devices', (req, res) => {
//   res.json(Array.from(connectedDevices.keys()));
// });

// // ✅ Get only registered MACs
// app.get('/api/all-devices', async (req, res) => {
//   try {
//     const devices = await Device.find({}, 'mac');
//     res.json(devices.map(d => d.mac));
//   } catch (error) {
//     console.error("Error fetching registered devices:", error);
//     res.status(500).json({ error: "Failed to fetch devices" });
//   }
// });

// // ✅ Get last readings
// app.get('/api/readings', async (req, res) => {
//   try {
//     const readings = await SensorReading.find().sort({ timestamp: -1 }).limit(400);
//     res.json(readings);
//   } catch (error) {
//     console.error("Error fetching readings:", error);
//     res.status(500).json({ error: "Failed to fetch readings" });
//   }
// });

// // ✅ Get latest reading by MAC
// app.get('/api/device/:mac', async (req, res) => {
//   try {
//     const latest = await SensorReading.findOne({ mac: req.params.mac }).sort({ timestamp: -1 });
//     if (!latest) return res.status(404).json({ message: 'No data found' });
//     res.json(latest);
//   } catch (err) {
//     console.error('Error fetching device data:', err.message);
//     res.status(500).json({ error: 'Failed to fetch data' });
//   }
// });

// // ✅ Historical data
// app.get('/api/historical-data', async (req, res) => {
//   const { mac, datetime } = req.query;

//   if (!mac || !datetime) {
//     return res.status(400).json({ error: 'Missing mac or datetime' });
//   }

//   const datetimeObj = new Date(datetime);
//   if (isNaN(datetimeObj.getTime())) {
//     return res.status(400).json({ error: 'Invalid datetime format' });
//   }

//   const selectedDate = new Date(datetimeObj);
//   selectedDate.setHours(0, 0, 0, 0);

//   const nextDate = new Date(selectedDate);
//   nextDate.setDate(nextDate.getDate() + 1);

//   try {
//     const readings = await SensorReading.find({
//       mac,
//       timestamp: { $gte: selectedDate, $lt: nextDate }
//     }).sort({ timestamp: 1 });

//     const atSelectedTime = await SensorReading.findOne({
//       mac,
//       timestamp: { $lte: datetimeObj }
//     }).sort({ timestamp: -1 });

//     res.json({ readings, atSelectedTime });
//   } catch (err) {
//     console.error('Historical data error:', err.message);
//     res.status(500).json({ error: 'Failed to fetch historical data' });
//   }
// });

// // Thresholds
// app.get('/api/thresholds', (req, res) => {
//   res.json(thresholds);
// });

// // 📡 TCP Server — updated for 62-byte packets with independent fan statuses

// const BULK_SAVE_LIMIT = 1000;
// let readingBuffer = [];

// const server = net.createServer(socket => {
//   let buffer = Buffer.alloc(0);

//   socket.on('data', async (data) => {
//     buffer = Buffer.concat([buffer, data]);

//     try {
//       while (buffer.length >= 56) {
//         const macRaw = buffer.subarray(0, 17);
//         const macRawStr = macRaw.toString('utf-8').slice(0, 17).trim();
//         const mac = /^[0-9A-Fa-f:]+$/.test(macRawStr) ? macRawStr : `INVALID_${Date.now()}`;
//         if (mac.startsWith("INVALID")) {
//           console.warn(`⚠️ Dropping malformed MAC: ${mac}`);
//           buffer = buffer.slice(56);
//           continue;
//         }

//         const humidity = +buffer.readFloatLE(17).toFixed(2);
//         const insideTemperature = +buffer.readFloatLE(21).toFixed(2);
//         const outsideTemperature = +buffer.readFloatLE(25).toFixed(2);
//         const lockStatus = buffer[29] === 1 ? 'OPEN' : 'CLOSED';
//         const doorStatus = buffer[30] === 1 ? 'OPEN' : 'CLOSED';
//         const waterLogging = !!buffer[31];
//         const waterLeakage = !!buffer[32];
//         const outputVoltage = +buffer.readFloatLE(33).toFixed(2);
//         const inputVoltage = +buffer.readFloatLE(37).toFixed(2);
//         const batteryBackup = +buffer.readFloatLE(41).toFixed(2);
//         const alarmActive = !!buffer[45];
//         const fireAlarm = !!buffer[46];
//         const fanLevel1Running = !!buffer[47];
//         const fanLevel2Running = !!buffer[48];
//         const fanLevel3Running = !!buffer[49];
//         const fanLevel4Running = !!buffer[50];
//         const fanFailBits = buffer.readUInt32LE(51);

//         const floats = [
//           humidity, insideTemperature, outsideTemperature,
//           outputVoltage, inputVoltage, batteryBackup
//         ];

//         if (floats.some(val => isNaN(val) || Math.abs(val) > 100000)) {
//           console.warn(`⚠️ Skipping packet from ${mac}: bad float value(s)`);
//           buffer = buffer.slice(56);
//           continue;
//         }

//         if (Math.random() < 0.01) {
//           console.log(`📡 ${mac} | Temp: ${insideTemperature}°C | Humidity: ${humidity}% | Voltage: ${inputVoltage}V`);
//         }

//         const fan1Status = fanLevel1Running && !(fanFailBits & (1 << 0));
//         const fan2Status = fanLevel1Running && !(fanFailBits & (1 << 1));
//         const fan3Status = fanLevel2Running && !(fanFailBits & (1 << 2));
//         const fan4Status = fanLevel3Running && !(fanFailBits & (1 << 3));
//         const fan5Status = fanLevel3Running && !(fanFailBits & (1 << 4));
//         const fan6Status = fanLevel4Running && !(fanFailBits & (1 << 5));

//         const thresholdAlarms = {
//           insideTemperatureAlarm:
//             insideTemperature > thresholds.insideTemperature.max ||
//             insideTemperature < thresholds.insideTemperature.min,
//           outsideTemperatureAlarm:
//             outsideTemperature > thresholds.outsideTemperature.max ||
//             outsideTemperature < thresholds.outsideTemperature.min,
//           humidityAlarm:
//             humidity > thresholds.humidity.max ||
//             humidity < thresholds.humidity.min,
//           inputVoltageAlarm:
//             inputVoltage > thresholds.inputVoltage.max ||
//             inputVoltage < thresholds.inputVoltage.min,
//           outputVoltageAlarm:
//             outputVoltage > thresholds.outputVoltage.max ||
//             outputVoltage < thresholds.outputVoltage.min,
//           batteryBackupAlarm:
//             batteryBackup < thresholds.batteryBackup.min
//         };

//         const reading = new SensorReading({
//           mac,
//           humidity,
//           insideTemperature,
//           outsideTemperature,
//           lockStatus,
//           doorStatus,
//           waterLogging,
//           waterLeakage,
//           outputVoltage,
//           inputVoltage,
//           batteryBackup,
//           alarmActive,
//           fireAlarm,
//           fanLevel1Running,
//           fanLevel2Running,
//           fanLevel3Running,
//           fanLevel4Running,
//           fanFailBits,
//           fan1Status,
//           fan2Status,
//           fan3Status,
//           fan4Status,
//           fan5Status,
//           fan6Status,
//           ...thresholdAlarms
//         });

//         connectedDevices.set(mac, socket);
//         readingBuffer.push(reading);

//         if (readingBuffer.length >= BULK_SAVE_LIMIT) {
//           const toSave = [...readingBuffer];
//           readingBuffer = [];
//           SensorReading.insertMany(toSave).catch(err => console.error('Bulk save error:', err.message));
//         }

//         buffer = buffer.slice(56);
//       }
//     } catch (err) {
//       console.error('Packet parsing failed:', err.message);
//       socket.destroy();
//     }
//   });

//   socket.on('end', () => {
//     for (const [mac, sock] of connectedDevices.entries()) {
//       if (sock === socket) {
//         connectedDevices.delete(mac);
//         console.log(`Device ${mac} disconnected`);
//       }
//     }
//   });

//   socket.on('error', err => {
//     if (err.code !== 'ECONNRESET') {
//       console.error('Socket error:', err.message);
//     }
//   });
// });

// setInterval(() => {
//   if (readingBuffer.length > 0) {
//     const toSave = [...readingBuffer];
//     readingBuffer = [];
//     SensorReading.insertMany(toSave).catch(err => console.error('Periodic bulk save error:', err.message));
//   }
// }, 5000);

// server.listen(4000, '0.0.0.0', () => {
//   console.log('TCP server listening on port 4000');
// });

// app.listen(5000, '0.0.0.0', () => {
//   console.log('HTTP server running on port 5000');
// });
