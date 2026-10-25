// Purchase returns: non-expired stock sent back to suppliers.
// The note logic is shared with Expiry, see services/returns/notes.js.
const { createNotesRouter } = require("../services/returns/notes");

module.exports = createNotesRouter("return");
