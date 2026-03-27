const { v4: uuidv4 } = require("uuid");

async function logActivity(db, pharmacy_id, user_id, user_name, type, module_name, entity_id, description, link) {
  try {
    if (!pharmacy_id) return;
    
    await db.collection("activities").insertOne({
      id: uuidv4(),
      pharmacy_id,
      user_id,
      user_name,
      type, // 'CREATE', 'UPDATE', 'DELETE'
      module: module_name, // e.g., 'BILLING', 'PURCHASES', 'CUSTOMERS', 'INVENTORY', 'PRODUCTS', 'SUPPLIERS'
      entity_id,
      description,
      link,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error("Activity logging failed:", error);
  }
}

module.exports = { logActivity };
