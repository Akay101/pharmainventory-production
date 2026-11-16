// The local server runs in its own process, so heavy reports never freeze the window.
const { startServer } = require("../server");

const send = (msg) => process.parentPort.postMessage(msg);
let server = null;

// Requests from the main process to the shop-network controls
const actions = {
  lanStatus: () => server.network.status(),
  lanEnable: () => server.network.enable(),
  lanDisable: async () => {
    await server.network.disable();
    return server.network.status();
  },
  lanNewCode: () => server.network.newCode(),
  lanRevoke: ({ id }) => server.network.revoke(id),
  status: () => server.sync.status(),
  activate: (args) => server.sync.activate(args),
  signOut: (args) => server.sync.signOut(args),
  continueSetup: () => server.db.setMeta("catalog_skip", "1"),
};

process.parentPort.on("message", async ({ data }) => {
  if (data.type === "start") {
    try {
      server = await startServer(data.options);
      send({ type: "ready", port: server.port, header: server.windowHeader });
    } catch (err) {
      send({ type: "failed", message: err.message, code: err.code });
    }
  } else if (data.type === "stop") {
    if (server) await server.stop().catch((err) => console.error(err));
    send({ type: "stopped" });
    process.exit(0);
  } else if (data.type === "call") {
    try {
      send({ type: "result", id: data.id, value: await actions[data.action](data.args || {}) });
    } catch (err) {
      send({ type: "result", id: data.id, error: err.message });
    }
  }
});

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
