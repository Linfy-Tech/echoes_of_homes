const http = require('node:http');
const dns = require('node:dns').promises;
const net = require('node:net');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const parsed = new URL(databaseUrl);
const privateHost = parsed.hostname;
const privatePort = Number(parsed.port || 5432);

async function tcpCheck() {
  await dns.lookup(privateHost);
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: privateHost, port: privatePort });
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('error', reject);
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('TCP timeout')); });
  });
}

async function main() {
  await tcpCheck();
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const result = await pool.query('select current_database() as database_name, current_user as database_user, inet_server_addr()::text as server_address');
  await pool.end();
  const row = result.rows[0];
  console.log(JSON.stringify({
    private_host_suffix: privateHost.endsWith('.railway.internal'),
    private_host: privateHost,
    railway_region: process.env.RAILWAY_REPLICA_REGION || 'not-reported',
    tcp: 'connected',
    postgres: 'connected',
    database_name: row.database_name,
    database_user: row.database_user,
    server_address: row.server_address,
  }));
}

const server = http.createServer((request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true }));
});

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
