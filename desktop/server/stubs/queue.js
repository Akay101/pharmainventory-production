// The scan queue only serves AI scanning, which needs the internet.
const fail = () => {
  throw Object.assign(new Error("Scanning needs internet. You can enter items by hand or import a CSV."), { status: 503, onlineOnly: true });
};

const scanQueue = { add: fail, getJob: fail, client: Promise.resolve({ ping: async () => "PONG" }) };
const connection = { on() {}, status: "end" };

module.exports = {
  scanQueue,
  connection,
  fastConnection: () => connection,
  makeConnection: () => connection,
  getQueueEvents: fail,
};
