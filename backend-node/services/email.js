const SibApiV3Sdk = require('sib-api-v3-sdk');

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY || '';

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
const SENDER_EMAIL = process.env.MAIL_USER || 'no-reply@pharmalogy.co.in';

const sendOTPEmail = async (toEmail, toName, otp) => {
  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    
    sendSmtpEmail.subject = 'Pharmalogy - Your OTP Code';
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Pharmalogy</h2>
        <p>Hello ${toName},</p>
        <p>Your OTP code is:</p>
        <h1 style="color: #7c3aed; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Pharmalogy - Pharmacy Management System</p>
      </div>
    `;
    sendSmtpEmail.sender = { name: 'Pharmalogy', email: SENDER_EMAIL };
    sendSmtpEmail.to = [{ email: toEmail, name: toName }];

    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return true;
  } catch (error) {
    console.error('Brevo email error:', error);
    return false;
  }
};

const sendBillEmail = async (toEmail, toName, billNo, pdfUrl, amount) => {
  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    
    sendSmtpEmail.subject = `Pharmalogy - Bill ${billNo}`;
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Pharmalogy</h2>
        <p>Hello ${toName},</p>
        <p>Thank you for your purchase! Here are your bill details:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Bill Number:</strong> ${billNo}</p>
          <p><strong>Amount:</strong> Rs. ${amount.toFixed(2)}</p>
        </div>
        <p>You can download your bill from the link below:</p>
        <a href="${pdfUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Download Bill PDF</a>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Pharmalogy - Pharmacy Management System</p>
      </div>
    `;
    sendSmtpEmail.sender = { name: 'Pharmalogy', email: SENDER_EMAIL };
    sendSmtpEmail.to = [{ email: toEmail, name: toName }];

    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return true;
  } catch (error) {
    console.error('Brevo email error:', error);
    return false;
  }
};

module.exports = { sendOTPEmail, sendBillEmail };
