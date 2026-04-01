const http = require("http");
const os = require("os");

const port = process.env.PORT || "8080";
const startupTime = new Date();
const hostname = os.hostname();

console.log(`startup timestamp: ${startupTime.toISOString()}`);

const methodNotAllowed = (res) => {
  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method Not Allowed");
};

const notFound = (res) => {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
};

const server = http.createServer((req, res) => {
  if (!req.url) {
    notFound(res);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/ping") {
    if (req.method !== "GET") {
      methodNotAllowed(res);
      return;
    }

    const now = new Date();
    const payload = {
      message: "pong",
      runtime: "node",
      hostname,
      timestamp: now.toISOString(),
      startup_timestamp: startupTime.toISOString(),
      uptime_ms: now.getTime() - startupTime.getTime(),
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
    return;
  }

  notFound(res);
});

server.listen(Number(port), () => {
  console.log(`listening on :${port}`);
});

const shutdown = (signal) => {
  console.log(`received ${signal}, shutting down`);

  server.close((error) => {
    if (error) {
      console.error(`graceful shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
