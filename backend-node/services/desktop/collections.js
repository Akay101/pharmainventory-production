// What the desktop app may sync, shared by the cloud routes and the desktop
// engine (which runs a copy of this file). Anything not listed here is refused.

// Changed on the device and pushed to the cloud, and pulled back
const TWO_WAY = [
  "inventory",
  "products",
  "suppliers",
  "customers",
  "bills",
  "bill_drafts",
  "purchases",
  "purchase_drafts",
  "reminders",
  "doctors",
  "short_book",
  "activities",
  "notifications",
  "user_settings",
  "bill_prescriptions",
  "return_bundles",
  "expiry_bundles",
];

// Copied down only. A device can never change these: they hold plans, roles and logins.
const PULL_ONLY = ["pharmacies", "users"];

const ALL = [...TWO_WAY, ...PULL_ONLY];

// Collections scoped by something other than pharmacy_id
const OWNER_FIELD = { user_settings: "user_id", pharmacies: "id" };

// Never sent to a device, whatever the collection
const SECRET_FIELDS = [
  "password_hash",
  "password",
  "otp",
  "otp_expiry",
  "otp_attempts",
  "profile_update_otp",
  "profile_update_otp_expiry",
  "profile_update_otp_attempts",
  "lock_setting_otp",
  "lock_setting_otp_expiry",
  "lock_setting_otp_attempts",
];

// Counts that travel as changes (-5, +200), so sales in two places add up
const COUNTERS = {
  inventory: ["available_quantity", "quantity", "pack_quantity", "returned_quantity"],
  customers: ["total_debt", "total_advance"],
  suppliers: ["total_debt", "total_advance"],
};

module.exports = { TWO_WAY, PULL_ONLY, ALL, OWNER_FIELD, SECRET_FIELDS, COUNTERS };
