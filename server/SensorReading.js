const mongoose = require('mongoose');

const sensorReadingSchema = new mongoose.Schema({
  mac: {
    type: String,
    required: true
  },
  temperature: {
    type: Number,
    required: true
  },
  humidity: {
    type: Number,
    required: true
  },
  voltage: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  }
});

// Export the model
module.exports = mongoose.model('SensorReading', sensorReadingSchema);

