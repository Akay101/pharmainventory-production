// What each kind of import can bring in, and the column headings other billing
// software uses for each field. Headings are compared after `headerKey`, so
// "Exp. Date", "EXP DATE" and "exp_date" are all "expdate".

const headerKey = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9%]/g, "");

const F = (key, label, synonyms, extra = {}) => ({ key, label, synonyms: synonyms.map(headerKey), ...extra });

const PRODUCT_FIELDS = [
  F("product_name", "Product name", ["item name", "itemname", "item", "product", "product name", "name", "item description", "medicine", "medicine name", "drug name", "particulars", "description", "item desc"], { required: true }),
  F("packing", "Packing", ["packing", "pack", "pack size", "pck", "pkg", "packing size", "unit", "uom", "pack type"]),
  F("units_per_pack", "Units per pack", ["units per pack", "conversion", "conv", "conv factor", "unit per pack", "tabs per strip", "per pack"]),
  F("manufacturer", "Manufacturer", ["company", "company name", "mfg", "mfr", "manufacturer", "mfg name", "mfg co", "make", "mfg company", "comp", "co name"]),
  F("salt_composition", "Salt", ["salt", "composition", "generic", "generic name", "content", "contents", "molecule", "salt name", "salt composition", "drug"]),
  F("mrp", "MRP (per pack)", ["mrp", "m r p", "mrp per pack", "mrp rs", "new mrp"]),
  F("purchase_rate", "Purchase rate (per pack)", ["purchase rate", "pur rate", "prate", "p rate", "purrate", "cost", "cost rate", "purchase price", "landing cost", "ptr", "net rate", "purchase", "cost price"]),
  F("hsn_no", "HSN code", ["hsn", "hsn code", "hsn sac", "hsnsac", "hsn no", "hsncode"]),
  F("gst_rate", "GST %", ["gst", "gst%", "gst %", "tax", "tax%", "gst rate", "igst", "igst%", "tax rate", "gst per"]),
  F("barcode", "Barcode", ["barcode", "bar code", "ean", "ean code"]),
  F("rack", "Rack", ["rack", "rack no", "shelf", "location", "rack location"]),
];

const STOCK_FIELDS = [
  ...PRODUCT_FIELDS.slice(0, 1),
  F("batch_no", "Batch", ["batch", "batch no", "batchno", "b no", "bno", "batch number", "lot", "lot no", "batch #"], { required: true }),
  F("expiry_date", "Expiry", ["expiry", "exp", "exp date", "expiry date", "expdt", "exp dt", "expiry dt", "expiry mm yy"], { required: true }),
  F("quantity", "Stock quantity", ["qty", "quantity", "stock", "closing stock", "cl stock", "closing qty", "cl qty", "balance", "bal qty", "current stock", "stock qty", "qty in hand", "closing", "clqty", "balance qty", "stock in hand"], { required: true }),
  F("loose_units", "Loose units", ["loose", "loose qty", "loose units", "lqty"]),
  ...PRODUCT_FIELDS.slice(1),
];

const SUPPLIER_FIELDS = [
  F("name", "Supplier name", ["supplier", "supplier name", "party", "party name", "name", "account name", "ledger name", "ledger", "distributor", "distributor name", "account"], { required: true }),
  F("contact", "Mobile / phone", ["mobile", "phone", "mobile no", "contact", "contact no", "phone no", "tel", "telephone", "mob", "mob no", "mobile number", "phone number", "contact number"]),
  F("email", "Email", ["email", "e mail", "email id", "mail"]),
  F("address", "Address", ["address", "addr", "address1", "address 1", "full address"]),
  F("city", "City", ["city", "town", "station", "area", "place"]),
  F("gst_no", "GSTIN", ["gstin", "gst no", "gst number", "gstn", "gst in", "gstin no", "gst"]),
  F("dl_no", "Drug licence no.", ["dl no", "dl", "drug licence", "drug license", "dl number", "licence no", "license no", "dlno"]),
];

const CUSTOMER_FIELDS = [
  F("name", "Customer name", ["customer", "customer name", "party", "party name", "name", "account name", "ledger name", "patient", "patient name", "account"], { required: true }),
  F("mobile", "Mobile", ["mobile", "phone", "mobile no", "contact", "contact no", "phone no", "tel", "mob", "mob no", "mobile number", "phone number"]),
  F("email", "Email", ["email", "e mail", "email id", "mail"]),
  F("address", "Address", ["address", "addr", "address1", "address 1", "full address"]),
  F("city", "City", ["city", "town", "area", "place"]),
];

const ENTITIES = {
  stock: { label: "Stock with batches", fields: STOCK_FIELDS },
  products: { label: "Product list", fields: PRODUCT_FIELDS },
  suppliers: { label: "Suppliers", fields: SUPPLIER_FIELDS },
  customers: { label: "Customers", fields: CUSTOMER_FIELDS },
};

// Where each source's export steps live. The headings themselves are covered by
// the synonyms above; a source only adds how to get the file out.
const SOURCES = {
  marg: {
    label: "Marg ERP",
    guides: {
      stock: "Marg: Stocks › Current Stock (batch-wise), then the Excel button. Or Masters › Opening Balances › Stock Openings, Stock Status Whole, Alt+P › Excel.",
      products: "Marg: Reports › Management Report › Utilities › Data Import/Export › Product Export (Excel).",
      suppliers: "Marg: Reports › Management Report › Utilities › Data Import/Export › Ledger Export (Excel), suppliers only.",
      customers: "Marg: Reports › Management Report › Utilities › Data Import/Export › Ledger Export (Excel), customers only.",
    },
  },
  other: { label: "Other software or a spreadsheet", guides: {} },
};

module.exports = { ENTITIES, SOURCES, headerKey };
