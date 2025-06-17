const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect("mongodb://127.0.0.1:27017/iot_dashboard")
  .then(() => console.log(" Connected to MongoDB"))
  .catch((err) => console.error(" MongoDB connection error:", err));

// Define sensor reading schema and model
const sensorReadingSchema = new mongoose.Schema({
  mac: String,
  temperature: Number,
  humidity: Number,
  voltage: Number,
  timestamp: Date
}, { collection: "sensorreadings" });

const SensorReading = mongoose.model("sensorreadings", sensorReadingSchema);

// Default route (optional)
app.get("/", (req, res) => {
  res.send("IoT API is running!");
});

// Route: Get latest 100 readings (all devices)
app.get("/api/readings", async (req, res) => {
  try {
    const readings = await SensorReading.find()
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(readings);
  } catch (error) {
    console.error(" Error fetching readings:", error);
    res.status(500).json({ error: "Failed to fetch readings" });
  }
});

// Route: Get list of unique device MAC addresses
app.get("/api/devices", async (req, res) => {
  try {
    const devices = await SensorReading.distinct("mac");
    res.json(devices);
  } catch (error) {
    console.error(" Error fetching devices:", error);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

// Route: Get latest 100 readings for a specific device
app.get("/api/readings/:mac", async (req, res) => {
  const { mac } = req.params;
  try {
    const readings = await SensorReading.find({ mac })
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(readings);
  } catch (error) {
    console.error("Error fetching readings for device:", error);
    res.status(500).json({ error: "Failed to fetch device readings" });
  }
});


// ✅ ADD THIS: Command queue for each device
const commandQueue = {};

// ✅ Route to receive command from React app
app.post("/command", (req, res) => {
  const { mac, command } = req.body;

  if (!mac || !command) {
    return res.status(400).json({ message: "MAC and command are required" });
  }

  if (!commandQueue[mac]) {
    commandQueue[mac] = [];
  }

  commandQueue[mac].push(command);
  console.log(`Command '${command}' queued for ${mac}`);
  res.json({ message: `Command '${command}' queued for ${mac}` });
});

// ✅ Route for TCP device to poll for commands
app.get("/command/:mac", (req, res) => {
  const mac = req.params.mac;
  const commands = commandQueue[mac] || [];
  commandQueue[mac] = []; // Clear the queue after sending
  res.json({ commands });
});

// Start server
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
