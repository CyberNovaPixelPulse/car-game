import { createServer } from "node:http";
import express from "express";
import { ExpressPeerServer } from "peer";
const app = express();
const server = createServer(app);
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use(
  "/peer",
  ExpressPeerServer(server, { path: "/", allow_discovery: false }),
);
server.listen(Number(process.env.PORT || 4274), "0.0.0.0", () =>
  console.log("PeerServer listening"),
);
