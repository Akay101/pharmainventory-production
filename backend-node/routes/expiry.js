// Expiry: expired stock moved to the expiry list and returned to suppliers.
// The note logic is shared with Returns, see services/returns/notes.js.
const { createNotesRouter } = require("../services/returns/notes");

module.exports = createNotesRouter("expiry");
