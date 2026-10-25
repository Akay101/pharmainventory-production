import { toast } from "sonner";

/**
 * Clean and format phone number for WhatsApp international standard (e.g., 919876543210)
 * @param {string|number} phone 
 * @returns {string} Cleaned digits with country code
 */
export const formatWhatsAppNumber = (phone) => {
  if (!phone) return "";
  let cleaned = String(phone).replace(/\D/g, "");
  
  // Strip leading zero if present
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }
  
  // Default to 91 (India) if 10-digit standard mobile number is provided
  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  }
  
  return cleaned;
};

/**
 * Generate a standard WhatsApp URL with prefilled text and optional attachment link
 * @param {Object} options
 * @param {string|number} options.phone - Customer or supplier phone number
 * @param {string} options.message - The prefilled text message
 * @param {string} [options.mediaUrl] - Optional URL of PDF invoice / image attachment
 * @returns {string} Full WhatsApp Web/App URL
 */
export const generateWhatsAppUrl = ({ phone, message = "", mediaUrl = "" }) => {
  const formattedPhone = formatWhatsAppNumber(phone);
  
  let fullMessage = message ? message.trim() : "";
  if (mediaUrl && mediaUrl.trim()) {
    fullMessage += `\n\nAttachment / Link:\n${mediaUrl.trim()}`;
  }

  if (formattedPhone) {
    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(fullMessage)}`;
  }
  
  // Fallback to general WhatsApp sharing if no specific phone is provided
  return `https://wa.me/?text=${encodeURIComponent(fullMessage)}`;
};

/**
 * Centralized trigger to open WhatsApp in a new tab/window with validation
 * @param {Object} options
 * @param {string|number} options.phone - Phone number to message
 * @param {string} options.message - Text message
 * @param {string} [options.mediaUrl] - Optional media attachment link
 * @param {string} [options.target="_blank"] - Browser window target
 * @returns {boolean} True if successfully opened, false otherwise
 */
export const openWhatsApp = ({ phone, message = "", mediaUrl = "", target = "_blank" }) => {
  if (!phone && !message) {
    toast.error("Please provide a phone number or message to send via WhatsApp");
    return false;
  }

  const formattedPhone = formatWhatsAppNumber(phone);
  if (phone && (!formattedPhone || formattedPhone.length < 10)) {
    toast.error("Invalid phone number for WhatsApp");
    return false;
  }

  const url = generateWhatsAppUrl({ phone: formattedPhone, message, mediaUrl });
  window.open(url, target, "noopener,noreferrer");
  return true;
};

export default openWhatsApp;
