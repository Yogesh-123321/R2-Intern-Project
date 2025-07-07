module.exports = {
  insideTemperature: {
    min: -10,
    max: 50   // Over 50°C triggers fire/alarm
  },
  outsideTemperature: {
    min: -10,
    max: 60
  },
  humidity: {
    min: 20,
    max: 80   // You can adjust as per your sensor/environment
  },
  inputVoltage: {
    min: 3.0,
    max: 5.0
  },
  outputVoltage: {
    min: 3.0,
    max: 5.0
  },
  batteryBackup: {
    min: 10,     // minimum 10 mins backup expected
    max: 120     // assume 2 hrs max for chart normalization
  }
};
