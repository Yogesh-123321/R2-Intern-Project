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

function startDevice(mac, index) {
  let sendCount = 0;

  const isHealthyDevice = index >= TOTAL_DEVICES - 2;
  const isDisconnectedSim = index >= TOTAL_DEVICES - 5 && index < TOTAL_DEVICES - 2;

  let alarmStart = 5 + Math.floor(Math.random() * 5);
  let alarmDuration = 2 + Math.floor(Math.random() * 2);
  let inAlarmPhase = false;

  const client = net.createConnection({ host: '13.201.227.67', port: 4000 });

  client.on('connect', () => {
    console.log(`✅ Connected as ${mac}`);

    const interval = setInterval(() => {
      sendCount++;

      // Disconnection Simulation
      if (isDisconnectedSim && sendCount >= 3) {
        console.log(`❌ [${mac}] Disconnecting after ${sendCount} packets`);
        clearInterval(interval);
        client.end();

        const reconnectDelay = 10000 + Math.random() * 10000; // 10–20 seconds
        console.log(`🔄 [${mac}] Will reconnect in ${(reconnectDelay / 1000).toFixed(1)}s`);

        setTimeout(() => {
          startDevice(mac, index);
        }, reconnectDelay);

        return;
      }

      // Toggle alarm phase for healthy devices
      if (isHealthyDevice) {
        if (sendCount >= alarmStart && sendCount < alarmStart + alarmDuration) {
          inAlarmPhase = true;
        } else {
          inAlarmPhase = false;
        }

        if (sendCount >= alarmStart + alarmDuration) {
          alarmStart = sendCount + 5 + Math.floor(Math.random() * 5);
          alarmDuration = 2 + Math.floor(Math.random() * 2);
        }
      }

      const triggerAlarm = !isHealthyDevice || inAlarmPhase;

      const humidity = triggerAlarm ? 85 + Math.random() * 10 : 55 + Math.random() * 5;
      const insideTemp = triggerAlarm ? 55 + Math.random() * 5 : 35 + Math.random() * 3;
      const outsideTemp = triggerAlarm ? 65 + Math.random() * 5 : 40 + Math.random() * 3;

      const lockStatus = Math.random() < 0.5 ? 1 : 0;
      const doorStatus = Math.random() < 0.5 ? 1 : 0;
      const waterLogging = triggerAlarm && Math.random() < 0.2 ? 1 : 0;
      const waterLeakage = triggerAlarm && Math.random() < 0.2 ? 1 : 0;

      const outputVoltage = triggerAlarm ? 2.5 + Math.random() * 0.2 : 3.3 + Math.random() * 0.1;
      const inputVoltage = triggerAlarm ? 2.5 + Math.random() * 0.2 : 3.3 + Math.random() * 0.1;
      const batteryBackup = triggerAlarm ? 5 + Math.random() * 2 : 12 + Math.random() * 3;

      const alarmActive = waterLogging || waterLeakage;
      const fireAlarm = triggerAlarm && Math.random() < 0.2 ? 1 : 0;

      const fan1 = Math.random() < 0.9 ? 1 : 0;
      const fan2 = Math.random() < 0.9 ? 1 : 0;
      const fan3 = Math.random() < 0.9 ? 1 : 0;

      let failMask = 0;
      for (let bit = 0; bit <= 5; bit++) {
        if (triggerAlarm && Math.random() < 0.1) failMask |= (1 << bit);
      }

      const failBuf = Buffer.alloc(4);
      failBuf.writeUInt32LE(failMask, 0);

      const latitude = +(28.4 + Math.random() * 0.5).toFixed(6);
      const longitude = +(76.9 + Math.random() * 0.6).toFixed(6);
      const latBuf = toFloatLE(latitude);
      const lonBuf = toFloatLE(longitude);

      const packet = Buffer.concat([
        Buffer.from(mac.padEnd(17, ' '), 'utf-8'),
        toFloatLE(humidity),
        toFloatLE(insideTemp),
        toFloatLE(outsideTemp),
        Buffer.from([lockStatus, doorStatus, waterLogging, waterLeakage]),
        toFloatLE(outputVoltage),
        toFloatLE(inputVoltage),
        toFloatLE(batteryBackup),
        Buffer.from([
          alarmActive ? 1 : 0,
          fireAlarm,
          fan1,
          fan2,
          fan3,
          0
        ]),
        failBuf,
        latBuf,
        lonBuf
      ]);

      const status = isDisconnectedSim && sendCount >= 3
        ? '❌ DISCONNECTED'
        : triggerAlarm
          ? '🚨 ALARM'
          : '✅ NORMAL';

      console.log(`[${mac}] ${status} | Packet #${sendCount}`);
      client.write(packet);
    }, 5000);
  });

  client.on('data', (data) => {
    console.log(`${mac} received command: ${data.toString()}`);
  });

  client.on('error', (err) => {
    console.error(`${mac} error:`, err);
  });

  client.on('close', () => {
    console.warn(`${mac} connection closed`);
  });
}

// Start all devices
let index = 0;
const spawnInterval = setInterval(() => {
  if (index >= TOTAL_DEVICES) {
    clearInterval(spawnInterval);
    console.log('✅ All simulated devices started.');
    return;
  }
  const mac = generateMac(index);
  startDevice(mac, index);
  devices.push(mac);
  index++;
}, 10);
