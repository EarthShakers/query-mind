const net = require("node:net");
const { spawn } = require("node:child_process");

const DEFAULT_START_PORT = 3000;
const MAX_TRIES = 100;
const CONNECT_TIMEOUT_MS = 200;

function canUsePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "0.0.0.0");
  });
}

function canConnectToPort(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

async function isPortAlreadyInUse(port) {
  // Check common localhost bindings first to catch loopback-only services.
  // eslint-disable-next-line no-await-in-loop
  if (await canConnectToPort(port, "127.0.0.1")) return true;
  // eslint-disable-next-line no-await-in-loop
  if (await canConnectToPort(port, "::1")) return true;

  // Fallback check: try binding on IPv4 wildcard.
  const canBind = await canUsePort(port);
  return !canBind;
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + MAX_TRIES; port += 1) {
    // Find the first free port from the preferred range.
    // Example: 3000 is busy -> fallback to 3001/3002...
    // eslint-disable-next-line no-await-in-loop
    const occupied = await isPortAlreadyInUse(port);
    const available = !occupied;
    if (available) {
      return port;
    }
  }

  throw new Error(
    `No available port found in range ${startPort}-${startPort + MAX_TRIES - 1}`
  );
}

async function start() {
  console.log("[dev] Starting dynamic port detection...");

  const fromEnv = Number.parseInt(process.env.PORT || "", 10);
  const startPort = Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_START_PORT;
  const port = await findAvailablePort(startPort);

  if (port !== startPort) {
    console.log(`[dev] Port ${startPort} is busy, using ${port} instead.`);
  } else {
    console.log(`[dev] Using port ${port}.`);
  }

  const child = spawn("next", ["dev", "-p", String(port)], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

start().catch((error) => {
  console.error("[dev] Failed to start dev server:", error);
  process.exit(1);
});
