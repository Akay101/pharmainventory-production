const fs = require("fs");
const path = require("path");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Initialize Brevo SDK
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY || "";
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Initialize Amazon SES SDK
let sesClient = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  sesClient = new SESClient({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

const SENDER_EMAIL = process.env.MAIL_USER || "team@davadesk.in";
const SENDER_NAME = "DavaDesk";

// Load DavaDesk Brand Logo as Base64 Data URI
let BRAND_LOGO_URI = "";
try {
  const possiblePaths = [
    path.join(__dirname, "../assets/logoBrand/logoOnly.png"),
    path.join(
      __dirname,
      "../../frontend/public/assets/svgs/logoBrand/logoOnly.png"
    ),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const b64 = fs.readFileSync(p).toString("base64");
      BRAND_LOGO_URI = `data:image/png;base64,${b64}`;
      break;
    }
  }
} catch (e) {
  console.error("Failed to load local brand logo:", e);
}

// Social Media Icons (Vector SVG Data URIs for universal, razor-sharp rendering)
const SOCIAL_ICONS = {
  youtube:
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="#FF0000" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.8 31.8 0 0 0 0 12a31.8 31.8 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1 31.8 31.8 0 0 0 .5-5.8 31.8 31.8 0 0 0-.5-5.8z"/><polygon fill="#FFFFFF" points="9.6,15.6 15.8,12 9.6,8.4"/></svg>`
    ).toString("base64"),
  linkedin:
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><rect width="24" height="24" rx="4" fill="#0A66C2"/><path fill="#FFFFFF" d="M19 19h-3v-4.7c0-1.1-.4-1.9-1.4-1.9-.8 0-1.2.5-1.4 1-.1.2-.1.5-.1.8V19h-3s.04-8.3 0-9.1h3v1.3c.4-.6 1.1-1.5 2.7-1.5 2 0 3.5 1.3 3.5 4.1V19zM6.9 8.7C5.9 8.7 5 7.9 5 6.9s.9-1.9 1.9-1.9 1.9.9 1.9 1.9-.9 1.8-1.9 1.8zM5.4 19h3V9.9h-3V19z"/></svg>`
    ).toString("base64"),
  website:
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="11" fill="#FF751F"/><circle cx="12" cy="12" r="9" fill="none" stroke="#FFFFFF" stroke-width="1.5"/><path d="M3 12h18M12 3a13 13 0 0 1 3.5 9 13 13 0 0 1-3.5 9 13 13 0 0 1-3.5-9 13 13 0 0 1 3.5-9z" fill="none" stroke="#FFFFFF" stroke-width="1.5"/></svg>`
    ).toString("base64"),
};

// Brand Configuration
const BRAND_CONFIG = {
  name: "DavaDesk",
  tagline: "Automate Your Pharmacy",
  websiteUrl: "https://davadesk.in",
  supportEmail: "support@davadesk.in",
  copyrightYear: new Date().getFullYear(),
  colors: {
    primary: "#ff751f",
    primaryDark: "#ea580c",
    primaryLight: "#fff7ed",
    accent: "#f59e0b",
    textMain: "#0f172a",
    textMuted: "#64748b",
    border: "#e2e8f0",
    bgOuter: "#f8fafc",
    bgCard: "#ffffff",
  },
  socials: [
    {
      name: "YouTube",
      url: "https://youtube.com/@davadesk",
      iconUri: SOCIAL_ICONS.youtube,
      textColor: "#0f172a",
    },
    {
      name: "Website",
      url: "https://davadesk.com",
      iconUri: SOCIAL_ICONS.website,
      textColor: "#0f172a",
    },
    {
      name: "LinkedIn",
      url: "https://linkedin.com/company/davadesk",
      iconUri: SOCIAL_ICONS.linkedin,
      textColor: "#0f172a",
    },
  ],
};

/**
 * Centralized Base Email Layout Generator
 * Wraps content with fixed brand header, real logo, theme colors, and interactive footer with social icons.
 */
const renderBaseLayout = ({
  previewText = "",
  badge = "",
  badgeColor = BRAND_CONFIG.colors.primaryDark,
  title = "",
  greeting = "",
  contentHtml = "",
  footerNote = "",
  showSocials = true,
}) => {
  const { colors, socials, name, tagline, copyrightYear, supportEmail } =
    BRAND_CONFIG;

  const socialLinksHtml = showSocials
    ? `
      <div style="margin: 22px 0 16px 0; text-align: center;">
        <p style="margin: 0 0 12px 0; font-size: 11px; font-weight: 800; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 1.2px;">
          Connect With Us
        </p>
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            ${socials
              .map(
                (s) => `
              <td style="padding: 0 6px;">
                <a href="${s.url}" target="_blank" style="display: inline-block; padding: 7px 16px; background: #ffffff; border: 1px solid ${colors.border}; border-radius: 24px; text-decoration: none; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td valign="middle" style="padding-right: 6px;">
                        <img src="${s.iconUri}" width="16" height="16" alt="${s.name}" style="display: block; width: 16px; height: 16px; border: 0;" />
                      </td>
                      <td valign="middle" style="font-size: 12px; font-weight: 700; color: ${s.textColor}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        ${s.name}
                      </td>
                    </tr>
                  </table>
                </a>
              </td>
            `
              )
              .join("")}
          </tr>
        </table>
      </div>
    `
    : "";

  const logoImgTag = BRAND_LOGO_URI
    ? `<img src="${BRAND_LOGO_URI}" width="42" height="42" alt="${name}" style="display: block; width: 42px; height: 42px; object-fit: contain; border: 0;" />`
    : `<div style="width: 42px; height: 42px; border-radius: 10px; background: linear-gradient(135deg, #ff751f 0%, #ea580c 100%); text-align: center; line-height: 42px; color: #ffffff; font-weight: 900; font-size: 22px;">✛</div>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title || name}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
  <style type="text/css">
    body {
      margin: 0 !important;
      padding: 0 !important;
      -webkit-text-size-adjust: 100% !important;
      -ms-text-size-adjust: 100% !important;
      background-color: ${colors.bgOuter};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    table {
      border-collapse: collapse !important;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    a {
      color: ${colors.primary};
      text-decoration: none;
    }
    @media only screen and (max-width: 620px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 0 !important;
        border-left: none !important;
        border-right: none !important;
      }
      .content-padding {
        padding: 24px 20px !important;
      }
      .header-padding {
        padding: 20px 20px 16px 20px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${colors.bgOuter};">
  ${
    previewText
      ? `<div style="display: none; font-size: 1px; color: ${colors.bgOuter}; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
          ${previewText}
          &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
        </div>`
      : ""
  }

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${colors.bgOuter};">
    <tr>
      <td align="center" style="padding: 32px 12px;">
        <!-- Main Card Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 600px; background-color: ${colors.bgCard}; border-radius: 16px; border: 1px solid ${colors.border}; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);">
          
          <!-- Top Gradient Accent Bar -->
          <tr>
            <td style="height: 5px; background: linear-gradient(90deg, #ff751f 0%, #ea580c 50%, #f59e0b 100%); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Header Section with Real Brand Logo -->
          <tr>
            <td class="header-padding" style="padding: 26px 36px 20px 36px; border-bottom: 1px solid #f1f5f9;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" valign="middle">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <!-- Real DavaDesk Logo Image -->
                        <td valign="middle" style="padding-right: 14px;">
                          ${logoImgTag}
                        </td>
                        <td valign="middle">
                          <div style="font-size: 22px; font-weight: 900; color: ${colors.textMain}; letter-spacing: -0.5px; line-height: 1.1;">
                            ${name}
                          </div>
                          <div style="font-size: 11px; font-weight: 600; color: ${colors.textMuted}; margin-top: 3px;">
                            ${tagline}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  ${
                    badge
                      ? `
                  <td align="right" valign="middle">
                    <span style="display: inline-block; padding: 5px 12px; background-color: #fff7ed; color: ${badgeColor}; border: 1px solid #ffedd5; border-radius: 20px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">
                      ${badge}
                    </span>
                  </td>
                  `
                      : ""
                  }
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body Section -->
          <tr>
            <td class="content-padding" style="padding: 32px 36px;">
              ${
                title
                  ? `<h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 800; color: ${colors.textMain}; letter-spacing: -0.4px; line-height: 1.3;">
                      ${title}
                    </h1>`
                  : ""
              }

              ${
                greeting
                  ? `<p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 600; color: ${colors.textMain};">
                      ${greeting}
                    </p>`
                  : ""
              }

              <div style="font-size: 14px; line-height: 1.6; color: #334155;">
                ${contentHtml}
              </div>
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 36px; border-top: 1px solid #f1f5f9;">
              
              <!-- Social Media Links -->
              ${socialLinksHtml}

              <!-- Help & Support Line -->
              <div style="text-align: center; margin-top: 16px; font-size: 12px; color: ${colors.textMuted};">
                Need help or have questions? Contact our support team at 
                <a href="mailto:${supportEmail}" style="color: ${colors.primary}; font-weight: 700; text-decoration: none;">${supportEmail}</a>
              </div>

              ${
                footerNote
                  ? `<div style="text-align: center; margin-top: 10px; font-size: 11px; color: #94a3b8;">
                      ${footerNote}
                    </div>`
                  : ""
              }

              <!-- Divider -->
              <div style="border-top: 1px solid #e2e8f0; margin: 16px 0;"></div>

              <!-- Copyright & Legal -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
                    © ${copyrightYear} <strong>${name} Inc.</strong> All rights reserved.<br>
                    Smart Pharmacy Operations, Automated Invoicing & Inventory Intelligence.
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 10px; color: #cbd5e1; padding-top: 8px;">
                    This is an automated transactional message. Please do not reply directly to this email.
                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Reusable Components for Building Email Content
 */
const EmailComponents = {
  // Bold OTP Box with Expiry Timer
  otpBox: (otp, expiryMinutes = 10) => `
    <div style="background: linear-gradient(135deg, rgba(255, 117, 31, 0.08) 0%, rgba(245, 158, 11, 0.05) 100%); border: 1.5px dashed #ff751f; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
      <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 800; color: #ea580c; text-transform: uppercase; letter-spacing: 1.5px;">
        One-Time Password (OTP)
      </p>
      <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #ff751f; font-family: 'Courier New', Courier, monospace; margin: 6px 0; text-shadow: 0 2px 4px rgba(255, 117, 31, 0.15);">
        ${otp}
      </div>
      <p style="margin: 8px 0 0 0; font-size: 12px; font-weight: 600; color: #64748b;">
        ⏱ Valid for <strong>${expiryMinutes} minutes</strong>. Do not share this code with anyone.
      </p>
    </div>
  `,

  // Call-To-Action Button
  button: (text, url, color = "#ff751f") => `
    <table border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, ${color} 0%, #ea580c 100%);">
          <a href="${url}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);">
            ${text}
          </a>
        </td>
      </tr>
    </table>
  `,

  // Information Card / Key-Value Grid
  infoCard: (title, rows = []) => `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 20px 0;">
      ${
        title
          ? `<h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.8px;">${title}</h3>`
          : ""
      }
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        ${rows
          .map(
            (r, i) => `
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600; border-bottom: ${
              i === rows.length - 1 ? "none" : "1px dashed #f1f5f9"
            }; width: 40%;">
              ${r.label}
            </td>
            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; font-weight: 700; text-align: right; border-bottom: ${
              i === rows.length - 1 ? "none" : "1px dashed #f1f5f9"
            };">
              ${r.value}
            </td>
          </tr>
        `
          )
          .join("")}
      </table>
    </div>
  `,

  // Alert Callout Box
  alertBox: (text, type = "warning") => {
    const styles = {
      warning: { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
      info: { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
      success: { bg: "#ecfdf5", border: "#10b981", text: "#065f46" },
    }[type] || { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" };

    return `
      <div style="background: ${styles.bg}; border-left: 4px solid ${styles.border}; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 13px; color: ${styles.text}; line-height: 1.5;">
        ${text}
      </div>
    `;
  },
};

/**
 * Helper: Send via Amazon SES
 */
const sendViaSES = async ({ toEmail, toName, subject, htmlContent }) => {
  if (!sesClient) {
    throw new Error("AWS SES client is not configured (missing credentials/region)");
  }

  const formattedFrom = SENDER_NAME ? `${SENDER_NAME} <${SENDER_EMAIL}>` : SENDER_EMAIL;
  const formattedTo = toName ? `${toName} <${toEmail}>` : toEmail;

  const params = {
    Source: formattedFrom,
    Destination: {
      ToAddresses: [formattedTo],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: htmlContent,
          Charset: "UTF-8",
        },
      },
    },
  };

  const command = new SendEmailCommand(params);
  return await sesClient.send(command);
};

/**
 * Helper: Send via Brevo
 */
const sendViaBrevo = async ({ toEmail, toName, subject, htmlContent }) => {
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.sender = { name: SENDER_NAME, email: SENDER_EMAIL };
  sendSmtpEmail.to = [{ email: toEmail, name: toName || toEmail }];

  return await apiInstance.sendTransacEmail(sendSmtpEmail);
};

/**
 * Generic Sender with Auto-Fallback:
 * 1. Primary: Amazon SES
 * 2. Fallback: Brevo
 */
const sendEmail = async ({ toEmail, toName, subject, htmlContent }) => {
  // 1. Primary Attempt: Amazon SES
  try {
    await sendViaSES({ toEmail, toName, subject, htmlContent });
    console.log(`[DavaDesk Email] Sent "${subject}" to ${toEmail} via Amazon SES ✅`);
    return true;
  } catch (sesError) {
    console.warn(
      `[DavaDesk Email Warning] Amazon SES delivery failed for ${toEmail} (${sesError.message}). Falling back to Brevo 🔄...`
    );
  }

  // 2. Fallback Attempt: Brevo
  try {
    await sendViaBrevo({ toEmail, toName, subject, htmlContent });
    console.log(`[DavaDesk Email] Sent "${subject}" to ${toEmail} via Brevo Fallback ✅`);
    return true;
  } catch (brevoError) {
    console.error(
      `[DavaDesk Email Critical] Both SES and Brevo failed to deliver "${subject}" to ${toEmail}:`,
      brevoError.message || brevoError
    );
    return false;
  }
};

/**
 * SCENARIO 1: Centralized OTP Verification Email
 * Supports: 'signup', 'forgot_password', 'settings', 'user_invite', 'general'
 */
const sendOTPEmail = async (toEmail, toName, otp, scenario = "general") => {
  let subject = "DavaDesk - Your Verification Code";
  let badge = "Security Verification";
  let title = "Verify Your Account";
  let description =
    "Please use the one-time verification code below to proceed with your request on DavaDesk:";

  if (scenario === "signup" || scenario === "verification") {
    subject = "DavaDesk - Welcome & Verification Code";
    badge = "Account Verification";
    title = "Verify Your New DavaDesk Account";
    description =
      "Welcome to DavaDesk! Please enter the 6-digit verification code below to verify your email and activate your pharmacy workspace:";
  } else if (scenario === "forgot_password" || scenario === "reset") {
    subject = "DavaDesk - Password Reset Code";
    badge = "Password Reset";
    title = "Reset Your Password";
    description =
      "We received a request to reset your DavaDesk account password. Use the verification code below to set a new password:";
  } else if (scenario === "settings" || scenario === "security") {
    subject = "DavaDesk - Security Verification Code";
    badge = "Security Alert";
    title = "Confirm Security Action";
    description =
      "A sensitive change was requested on your pharmacy configuration. Confirm your identity using the code below:";
  } else if (scenario === "user_invite") {
    subject = "DavaDesk - Pharmacy Staff Invitation Code";
    badge = "Staff Setup";
    title = "Join Pharmacy Workspace";
    description =
      "You have been invited to join a pharmacy workspace on DavaDesk. Use the verification code below to complete your setup:";
  }

  const contentHtml = `
    <p style="margin: 0 0 16px 0; color: #334155;">${description}</p>
    ${EmailComponents.otpBox(otp, 10)}
    ${EmailComponents.alertBox("⚠️ <strong>Security Notice:</strong> DavaDesk will never ask for your OTP over phone or email. If you did not initiate this request, please ignore this email or contact support immediately.", "warning")}
  `;

  const htmlContent = renderBaseLayout({
    previewText: `Your DavaDesk verification code is ${otp}. Valid for 10 minutes.`,
    badge,
    title,
    greeting: `Hello ${toName || "there"},`,
    contentHtml,
    footerNote: "This code expires in 10 minutes for your account security.",
  });

  return sendEmail({ toEmail, toName, subject, htmlContent });
};

/**
 * SCENARIO 2: Centralized Bill / Invoice Receipt Email
 */
const sendBillEmail = async (
  toEmail,
  toName,
  billNo,
  pdfUrl,
  amount,
  options = {}
) => {
  const pharmacyName = options.pharmacyName || "Pharmacy Store";
  const formattedAmount = Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const subject = `Invoice #${billNo} from ${pharmacyName} - DavaDesk`;
  const badge = "Invoice Receipt";
  const title = "Thank You For Your Purchase!";

  const contentHtml = `
    <p style="margin: 0 0 16px 0; color: #334155;">
      Your digital bill for purchase from <strong>${pharmacyName}</strong> has been generated successfully. Here is a summary of your invoice:
    </p>

    ${EmailComponents.infoCard("Invoice Details", [
      { label: "Invoice Number", value: `#${billNo}` },
      {
        label: "Billing Date",
        value: new Date().toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      },
      { label: "Pharmacy Store", value: pharmacyName },
      {
        label: "Total Paid Amount",
        value: `<span style="color: #ff751f; font-size: 15px; font-weight: 900;">₹${formattedAmount}</span>`,
      },
      {
        label: "Payment Status",
        value: `<span style="color: #16a34a; font-weight: 800;">✓ Completed</span>`,
      },
    ])}

    <p style="margin: 20px 0 12px 0; color: #334155;">
      You can view and download your complete GST invoice PDF using the button below:
    </p>

    <div style="text-align: center;">
      ${EmailComponents.button("Download Tax Invoice (PDF)", pdfUrl, "#ff751f")}
    </div>

    ${EmailComponents.alertBox("💡 <strong>Tip:</strong> Keep this digital invoice for your medical records and prescription warranty claims.", "info")}
  `;

  const htmlContent = renderBaseLayout({
    previewText: `Your invoice #${billNo} for ₹${formattedAmount} is ready for download.`,
    badge,
    title,
    greeting: `Hello ${toName || "Valued Customer"},`,
    contentHtml,
    footerNote: `Invoice generated powered by DavaDesk Pharmacy Intelligence.`,
  });

  return sendEmail({ toEmail, toName, subject, htmlContent });
};

/**
 * SCENARIO 3: Custom Transactional Email Generator for future extensions
 */
const sendCustomEmail = async ({
  toEmail,
  toName,
  subject,
  previewText,
  badge = "Notification",
  badgeColor,
  title,
  greeting,
  bodyHtml,
  actionButton,
  alertBox,
  infoCard,
  footerNote,
  showSocials = true,
}) => {
  let combinedContent = bodyHtml || "";

  if (infoCard) {
    combinedContent += EmailComponents.infoCard(infoCard.title, infoCard.rows);
  }
  if (alertBox) {
    combinedContent += EmailComponents.alertBox(alertBox.text, alertBox.type);
  }
  if (actionButton) {
    combinedContent += EmailComponents.button(
      actionButton.text,
      actionButton.url,
      actionButton.color
    );
  }

  const htmlContent = renderBaseLayout({
    previewText: previewText || subject,
    badge,
    badgeColor,
    title,
    greeting: greeting || (toName ? `Hello ${toName},` : "Hello,"),
    contentHtml: combinedContent,
    footerNote,
    showSocials,
  });

  return sendEmail({ toEmail, toName, subject, htmlContent });
};

/**
 * SCENARIO 4: Welcome Email on Account Creation
 */
const sendWelcomeEmail = async (toEmail, toName, pharmacyName) => {
  const subject = `Welcome to DavaDesk, ${toName}! 🚀`;
  const badge = "Welcome Onboard";
  const title = "Welcome to DavaDesk Pharmacy OS";

  const contentHtml = `
    <p style="margin: 0 0 16px 0; color: #334155;">
      Congratulations on setting up <strong>${pharmacyName || "your pharmacy"}</strong> on DavaDesk! You now have access to next-gen AI OCR bill extraction, smart batch expiry tracking, and real-time ledger accounting.
    </p>

    ${EmailComponents.infoCard("Your Workspace Details", [
      { label: "Account Administrator", value: toName },
      { label: "Registered Email", value: toEmail },
      { label: "Pharmacy Store", value: pharmacyName || "Configured" },
      {
        label: "Platform Access",
        value: `<a href="${BRAND_CONFIG.websiteUrl}" style="color: #ff751f; font-weight: 700;">Launch Dashboard</a>`,
      },
    ])}

    <div style="text-align: center;">
      ${EmailComponents.button("Go to DavaDesk Dashboard", BRAND_CONFIG.websiteUrl, "#ff751f")}
    </div>
  `;

  const htmlContent = renderBaseLayout({
    previewText: `Welcome to DavaDesk, ${toName}! Get started with your pharmacy workspace.`,
    badge,
    title,
    greeting: `Hello ${toName},`,
    contentHtml,
  });

  return sendEmail({ toEmail, toName, subject, htmlContent });
};

module.exports = {
  sendOTPEmail,
  sendBillEmail,
  sendCustomEmail,
  sendWelcomeEmail,
  renderBaseLayout,
  EmailComponents,
  BRAND_CONFIG,
};
