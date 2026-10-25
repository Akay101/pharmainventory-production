// Expected, user-facing billing failures. Routes turn these into 4xx JSON
// responses with a stable `code` the frontend can switch on.
class BillingError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const sendBillingError = (res, err, next) => {
  if (err instanceof BillingError) {
    return res.status(err.status).json({ code: err.code, detail: err.message });
  }
  return next(err);
};

module.exports = { BillingError, sendBillingError };
