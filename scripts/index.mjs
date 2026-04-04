import http from "node:http";

const options = {
    hostname: "127.0.0.1",
    port: 8080,
    path: "/ping",
    method: "GET",
    headers: {
        Host: "node-benchmark.default.127.0.0.1.sslip.io",
    },
    timeout: 10000,
};

const startedAt = Date.now();

const req = http.request(options, (res) => {
    let data = "";

    res.on("data", (chunk) => {
        data += chunk;
    });

    res.on("end", () => {
        const elapsedMs = Date.now() - startedAt;

        console.log("status:", res.statusCode);
        console.log("elapsed_ms:", elapsedMs);
        console.log("body:");
        console.log(data);
    });
});

req.on("timeout", () => {
    console.error("request failed: timeout");
    req.destroy();
    process.exitCode = 1;
});

req.on("error", (err) => {
    console.error("request failed:", err.message);
    process.exitCode = 1;
});

req.end();