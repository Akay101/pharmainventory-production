const SibApiV3Sdk = require("sib-api-v3-sdk");

// Configure Brevo API Client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const SENDER_EMAIL = process.env.MAIL_USER;
const SENDER_NAME = process.env.MAIL_SENDER_NAME || "DavaDesk Admin Security";

/**
 * Generate responsive and modern HTML template for Admin security codes
 */
function buildAdminOtpTemplate({ toName, otp, scenario, expiryMinutes = 10 }) {
  let title = "Admin Verification Code";
  let subtitle = "Two-Factor Authentication Security Code";
  let message = "Use the secure 6-digit verification code below to complete your administrative login to DavaDesk:";

  if (scenario === "FIRST_TIME_LOGIN") {
    title = "Welcome to DavaDesk Admin Panel";
    subtitle = "Initial Account Setup & Password Creation";
    message = "Your DavaDesk administrative account has been initiated. Verify your identity using the code below to set your account password:";
  } else if (scenario === "LOGIN_2FA") {
    title = "Admin Sign-In Verification (2FA)";
    subtitle = "Two-Factor Authentication Challenge";
    message = "A login attempt was initiated for your DavaDesk admin account. Enter the 6-digit verification code below to authorize this session:";
  } else if (scenario === "PASSWORD_RESET") {
    title = "Admin Password Reset";
    subtitle = "Security Credentials Recovery";
    message = "We received a request to reset your DavaDesk admin password. Use the verification code below to proceed with setting a new password:";
  } else if (scenario === "INVITE") {
    title = "Admin Portal Invitation";
    subtitle = "New Administrative Team Member";
    message = "You have been granted administrative privileges on the DavaDesk Operations Panel. Use the one-time code below to verify your email and set your password:";
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f172a; padding: 36px 12px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          
          <!-- Top Accent Banner -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #ea580c 0%, #f97316 50%, #fb923c 100%);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #334155;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="display: inline-block; font-size: 20px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px;">
                      <span style="color: #f97316;">Dava</span>Desk
                    </div>
                    <span style="margin-left: 8px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; background-color: #0f172a; padding: 3px 8px; border-radius: 6px; border: 1px solid #334155;">
                      Security Portal
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-weight: 700; color: #f97316; background-color: rgba(234, 88, 12, 0.15); border: 1px solid rgba(234, 88, 12, 0.3); padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${subtitle}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 800; color: #f8fafc; letter-spacing: -0.3px;">
                ${title}
              </h1>
              
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                Hello <strong>${toName || "Admin"}</strong>,
              </p>

              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                ${message}
              </p>

              <!-- OTP Verification Box -->
              <div style="background-color: #0f172a; border: 2px dashed #ea580c; border-radius: 12px; padding: 24px 16px; text-align: center; margin: 20px 0;">
                <div style="font-size: 11px; font-weight: 800; color: #f97316; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">
                  Security Verification Code
                </div>
                <div style="font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #ffffff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-shadow: 0 0 20px rgba(234, 88, 12, 0.4);">
                  ${otp}
                </div>
                <div style="font-size: 12px; color: #94a3b8; margin-top: 10px;">
                  ⏱ Code expires in <strong style="color: #f1f5f9;">${expiryMinutes} minutes</strong>
                </div>
              </div>

              <!-- Security Warning -->
              <div style="background-color: rgba(220, 38, 38, 0.1); border-left: 3px solid #ef4444; border-radius: 0 8px 8px 0; padding: 12px 16px; margin: 24px 0 12px 0;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #fca5a5;">
                  🔒 <strong>Zero-Trust Security Notice:</strong> Never share this code with anyone. DavaDesk security engineers will NEVER request this code. If you did not initiate this request, someone may be attempting to access your account.
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0f172a; border-top: 1px solid #334155; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748b;">
                Sent securely by DavaDesk Admin Identity Service &bull; Automated System
              </p>
              <p style="margin: 0; font-size: 10px; color: #475569;">
                &copy; ${new Date().getFullYear()} DavaDesk Technologies Inc. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Send Admin OTP via Brevo
 */
async function sendAdminOTPEmail({ toEmail, toName, otp, scenario, expiryMinutes = 10 }) {
  if (!process.env.BREVO_API_KEY) {
    console.warn("[Admin Email] Warning: BREVO_API_KEY not configured. OTP was generated:", otp);
    return false;
  }

  const subjectMap = {
    FIRST_TIME_LOGIN: "DavaDesk Admin - Complete Your Account Setup",
    LOGIN_2FA: `DavaDesk Admin - Verification Code: ${otp}`,
    PASSWORD_RESET: `DavaDesk Admin - Password Reset Code: ${otp}`,
    INVITE: "DavaDesk Admin - Team Member Setup Invitation",
  };

  const subject = subjectMap[scenario] || `DavaDesk Admin Verification Code: ${otp}`;
  const htmlContent = buildAdminOtpTemplate({ toName, otp, scenario, expiryMinutes });

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.sender = { name: SENDER_NAME, email: SENDER_EMAIL };
  sendSmtpEmail.to = [{ email: toEmail, name: toName || "Admin User" }];

  try {
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`[Admin Email] Successfully sent OTP (${scenario}) to ${toEmail}. Message ID:`, data.messageId);
    return true;
  } catch (error) {
    console.error(`[Admin Email] Failed to send OTP to ${toEmail}:`, error.response ? error.response.body : error.message);
    throw error;
  }
}

module.exports = {
  sendAdminOTPEmail,
};
