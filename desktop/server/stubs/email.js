// Email needs the internet. Senders report "not sent", which the routes already handle.
const notSent = async () => false;

module.exports = {
  escapeHtml: (s) => String(s ?? ""),
  sendTrialStartedEmail: notSent,
  sendSubscriptionEmail: notSent,
  sendOTPEmail: notSent,
  sendBillEmail: notSent,
  sendCustomEmail: notSent,
  sendWelcomeEmail: notSent,
  renderBaseLayout: () => "",
  getAssetUrls: () => ({}),
  EmailComponents: {},
  BRAND_CONFIG: {},
};
