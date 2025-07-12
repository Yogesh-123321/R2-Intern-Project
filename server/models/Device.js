const mongoose = require('mongoose');
const deviceSchema = new mongoose.Schema({
  mac: String,
  block: String,
  panchayat: String,
  latitude: Number,
  longitude: Number,
  ipCamera: { type: String, default: '' }  // ✅ New field
});

module.exports = mongoose.model('Device', deviceSchema);
