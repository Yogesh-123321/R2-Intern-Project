const net = require('net');

const mac = '00:11:22:33:44:F9';
const macBuffer = Buffer.alloc(17, ' '); // 17-byte MAC padded with spaces
macBuffer.write(mac, 'utf-8');

const client = net.createConnection({ port: 4000 }, () => {
  console.log(`Connected to server as device ${mac}`);
});

client.on('data', (data) => {
  console.log('Received command:', data.toString());
});

setInterval(() => {
  const temperature = +(20 + Math.random() * 10).toFixed(2); // 20–30°C
  const humidity = +(30 + Math.random() * 20).toFixed(2);    // 30–50%
  const voltage = +(3.2 + Math.random() * 0.2).toFixed(2);   // 3.2–3.4V

  const tempBuf = Buffer.alloc(4);
  const humBuf = Buffer.alloc(4);
  const voltBuf = Buffer.alloc(4);

  tempBuf.writeFloatLE(temperature);
  humBuf.writeFloatLE(humidity);
  voltBuf.writeFloatLE(voltage);

  const binaryPacket = Buffer.concat([macBuffer, tempBuf, humBuf, voltBuf]);
  client.write(binaryPacket);

  console.log(`Sent Binary: MAC=${mac}, T=${temperature}, H=${humidity}, V=${voltage}`);
}, 5000);

client.on('error', err => {
  console.error('Connection error:', err.message);
});
