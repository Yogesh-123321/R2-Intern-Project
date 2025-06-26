const net = require('net');

const TOTAL_DEVICES = 10;
const devices = [];

function generateMac(index) {
  return `00:11:22:33:44:${(index % 256).toString(16).padStart(2, '0').toUpperCase()}`;
}

function toFloatLE(value) {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(value, 0);
  return buf;
}

function createDevice(mac) {
  const macBuffer = Buffer.from(mac.padEnd(17, ' '), 'utf-8');

  const client = net.createConnection({ port: 4000 }, () => {
    console.log(`Connected as ${mac}`);
  });

  client.on('data', (data) => {
    console.log(`${mac} received command: ${data.toString()}`);
  });

  client.on('error', (err) => {
    console.error(`${mac} error: ${err.message}`);
  });

  setInterval(() => {
    const humidity = +(30 + Math.random() * 20).toFixed(2);
    const insideTemp = +(22 + Math.random() * 5).toFixed(2);
    const outsideTemp = +(25 + Math.random() * 5).toFixed(2);
    const lockStatus = Math.random() < 0.5 ? 1 : 0;
    const doorStatus = Math.random() < 0.5 ? 1 : 0;
    const waterLogging = Math.random() < 0.1 ? 1 : 0;
    const waterLeakage = Math.random() < 0.1 ? 1 : 0;
    const outputVoltage = +(3.0 + Math.random() * 0.3).toFixed(2);
    const inputVoltage = +(3.2 + Math.random() * 0.3).toFixed(2);
    const batteryBackup = +(30 + Math.random() * 60).toFixed(2);
    const alarmActive = (waterLogging || waterLeakage) ? 1 : 0;
    const fireAlarm = Math.random() < 0.05 ? 1 : 0;
    const fan1 = Math.random() < 0.8 ? 1 : 0;
    const fan2 = Math.random() < 0.6 ? 1 : 0;
    const fan3 = Math.random() < 0.5 ? 1 : 0;

    let failMask = 0;
    for (let bit = 0; bit <= 5; bit++) {
      if (Math.random() < 0.05) failMask |= (1 << bit);
    }

    const failBuf = Buffer.alloc(4);
    failBuf.writeUInt32LE(failMask, 0);

    const packet = Buffer.concat([
      macBuffer,                        // 17 bytes
      toFloatLE(humidity),             // 4
      toFloatLE(insideTemp),           // 4
      toFloatLE(outsideTemp),          // 4
      Buffer.from([                    // 4 bytes: 1 byte each
        lockStatus,
        doorStatus,
        waterLogging,
        waterLeakage
      ]),
      toFloatLE(outputVoltage),        // 4
      toFloatLE(inputVoltage),         // 4
      toFloatLE(batteryBackup),        // 4
      Buffer.from([                    // 6 bytes: alarms + fan status + 1 padding
        alarmActive,
        fireAlarm,
        fan1,
        fan2,
        fan3,
        0
      ]),
      failBuf                          // 4
    ]);

    console.log(`[${mac}] sending packet of length: ${packet.length}`); // Must be 55
    client.write(packet);
  }, 5000);

  return client;
}

let index = 0;
const spawnInterval = setInterval(() => {
  if (index >= TOTAL_DEVICES) {
    clearInterval(spawnInterval);
    console.log('All simulated devices started.');
    return;
  }
  const mac = generateMac(index);
  const device = createDevice(mac);
  devices.push(device);
  index++;
}, 10);
