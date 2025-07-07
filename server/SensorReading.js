const mongoose = require('mongoose');

const sensorReadingSchema = new mongoose.Schema({
  mac: { type: String, required: true },
  humidity: { type: Number, required: true },
  insideTemperature: { type: Number, required: true },
  outsideTemperature: { type: Number, required: true },
  lockStatus: { type: String, required: true },
  doorStatus: { type: String, required: true },
  waterLogging: { type: Boolean, required: true },
  waterLeakage: { type: Boolean, required: true },
  outputVoltage: { type: Number, required: true },
  inputVoltage: { type: Number, required: true },
  batteryBackup: { type: Number, required: true },
  alarmActive: { type: Boolean, required: true },
  fireAlarm: { type: Boolean, required: true },

  fanLevel1Running: { type: Boolean, required: true },
  fanLevel2Running: { type: Boolean, required: true },
  fanLevel3Running: { type: Boolean, required: true },
  fanFailBits: { type: Number, required: true },

  fan1Status: { type: Boolean, required: true },
  fan2Status: { type: Boolean, required: true },
  fan3Status: { type: Boolean, required: true },
  fan4Status: { type: Boolean, required: true },
  fan5Status: { type: Boolean, required: true },
  fan6Status: { type: Boolean, required: true },

  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },

  // ✅ Threshold-based alarms (with required flag)
  insideTemperatureAlarm: { type: Boolean, required: true },
  outsideTemperatureAlarm: { type: Boolean, required: true },
  humidityAlarm: { type: Boolean, required: true },
  inputVoltageAlarm: { type: Boolean, required: true },
  outputVoltageAlarm: { type: Boolean, required: true },
  batteryBackupAlarm: { type: Boolean, required: true },

  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SensorReading', sensorReadingSchema);
