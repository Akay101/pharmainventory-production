// dotenv and node-cron: the desktop app sets its own settings and runs no timed cloud jobs
module.exports = { config: () => ({}), schedule: () => ({ stop() {} }) };
