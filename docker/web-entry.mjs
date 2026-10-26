// Starts the Next.js standalone server and shuts it down cleanly on SIGTERM/SIGINT: stop accepting
// connections, let in-flight requests finish (at most 10 s), exit 0. Without this Node dies with 143.
import http from "node:http";

const servers = [];
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  servers.push(this);
  return listen.apply(this, args);
};

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ level: 30, msg: "web stopping", signal }));
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve) => {
          server.close(() => resolve());
          server.closeIdleConnections();
        }),
    ),
  ).then(() => process.exit(0));
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

await import("./server.js");
