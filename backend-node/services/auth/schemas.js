// Request validation for auth endpoints. Every field is parsed as a string of
// bounded length, so operator objects ({"$ne": null}) can never reach Mongo.
const { z } = require("zod");

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter a valid email address");

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

// Indian mobile: optional +91 / 0 prefix, 10 digits starting 6-9
const mobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => /^(?:\+91|91|0)?[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number")
  .transform((v) => v.slice(-10));

const text = (label, max) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`)
    // No markup in names that end up in emails, PDFs and the UI
    .refine((v) => !/[<>]/.test(v), `${label} contains invalid characters`);

const otp = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

const registerSchema = z.object({
  name: text("Name", 80),
  email,
  mobile,
  password,
  pharmacy: z.object({
    name: text("Pharmacy name", 120),
    location: text("Location", 200),
    license_no: z.string().trim().max(60).optional().nullable(),
    years_old: z.union([z.number().int().min(0).max(200), z.string().trim().max(4)]).optional().nullable(),
  }),
});

const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
const emailSchema = z.object({ email });
const verifySchema = z.object({ email, otp });
const resetSchema = z.object({ email, otp, password });

// Returns parsed data or sends a 400 with the first readable message.
const validate = (schema, body, res) => {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  res.status(400).json({ code: "VALIDATION_ERROR", detail: issue?.message || "Invalid request", field: issue?.path?.join(".") });
  return null;
};

module.exports = {
  email,
  password,
  mobile,
  otp,
  text,
  registerSchema,
  loginSchema,
  emailSchema,
  verifySchema,
  resetSchema,
  validate,
};
