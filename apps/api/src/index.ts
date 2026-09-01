import "dotenv/config";
import http from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { startVirusScanWorker } from "./modules/documents/worker.js";
import { startEmailWorker } from "./lib/email-worker.js";
import { attachSocketServer } from "./lib/socket.js";

const app = createApp();
const server = http.createServer(app);

attachSocketServer(server);
startVirusScanWorker();
startEmailWorker();

server.listen(config.port, () => {
  console.log(`oncoflow api listening on :${String(config.port)}`);
});
