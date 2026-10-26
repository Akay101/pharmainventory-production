const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

/**
 * Reusable Centralized Notification Service
 */

/**
 * Create a new notification
 */
async function createNotification(db, {
  pharmacy_id,
  user_id = null,
  type = "SYSTEM",
  title,
  message,
  priority = "MEDIUM",
  data = {},
  expires_at = null,
}) {
  if (!pharmacy_id || !title) return null;

  const id = uuidv4();
  const notification = {
    id,
    pharmacy_id,
    user_id,
    type, // "REFILL_REMINDER", "EXPIRY_ALERT", "LOW_STOCK", "PAYMENT_DUE", "SYSTEM"
    title,
    message,
    priority, // "HIGH", "MEDIUM", "LOW"
    data,
    is_read: false,
    read_at: null,
    created_at: new Date().toISOString(),
    expires_at,
  };

  await db.collection("notifications").insertOne(notification);
  return notification;
}

/**
 * Scan and process due reminders for a pharmacy (or all pharmacies)
 */
async function checkAndProcessDueReminders(db, targetPharmacyId = null) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const query = {
    is_active: true,
    status: "PENDING",
    reminder_date: { $lte: todayStr },
  };

  if (targetPharmacyId) {
    query.pharmacy_id = targetPharmacyId;
  }

  const dueReminders = await db
    .collection("reminders")
    .find(query)
    .toArray();

  let createdCount = 0;

  for (const reminder of dueReminders) {
    // Check if an unread notification for this reminder already exists
    const existingNotification = await db.collection("notifications").findOne({
      pharmacy_id: reminder.pharmacy_id,
      "data.reminder_id": reminder.id,
      is_read: false,
    });

    if (!existingNotification) {
      const itemsText = (reminder.items || [])
        .map((i) => i.product_name)
        .filter(Boolean)
        .join(", ");

      const title = `Restock Refill Due: ${reminder.customer_name || "Customer"}`;
      const message = `${reminder.customer_name || "Customer"} will need ${itemsText || "their medicines"} again around ${reminder.refill_target_date || "soon"}. Tap to see it in Restock, check stock and order what is short.`;

      await createNotification(db, {
        pharmacy_id: reminder.pharmacy_id,
        type: "REFILL_REMINDER",
        title,
        message,
        priority: "HIGH",
        data: {
          reminder_id: reminder.id,
          customer_id: reminder.customer_id,
          customer_name: reminder.customer_name,
          customer_mobile: reminder.customer_mobile,
          bill_id: reminder.bill_id,
          bill_no: reminder.bill_no,
          items: reminder.items || [],
          refill_target_date: reminder.refill_target_date,
          reminder_date: reminder.reminder_date,
          link: `/customers?highlight_id=${reminder.customer_id}`,
        },
      });

      createdCount++;
    }

    // Update reminder status to NOTIFIED
    await db.collection("reminders").updateOne(
      { id: reminder.id },
      {
        $set: {
          status: "NOTIFIED",
          notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }
    );
  }

  return { processed: dueReminders.length, created: createdCount };
}

module.exports = {
  createNotification,
  checkAndProcessDueReminders,
};
