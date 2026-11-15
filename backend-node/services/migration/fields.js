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

const PURCHASE_FIELDS = [
  F("supplier_name", "Supplier", ["supplier", "supplier name", "party", "party name", "distributor", "distributor name", "vendor", "account name"], { required: true }),
  F("supplier_gst", "Supplier GSTIN", ["gst no", "gstin", "gst number", "party gstin", "supplier gstin", "gstin no"]),
  F("bill_type", "Entry type", ["type", "vch type", "voucher type", "entry type", "bill type", "trans type"]),
  F("invoice_no", "Bill / invoice no.", ["bill no", "bill", "invoice no", "invoice", "inv no", "invoice number", "bill number", "voucher no", "vch no"]),
  F("invoice_date", "Bill date", ["bill date", "invoice date", "date", "inv date", "voucher date", "vch date", "purchase date"]),
  F("product_name", "Product name", ["item name", "item", "product", "product name", "item description", "medicine", "medicine name", "particulars", "description"], { required: true }),
  F("packing", "Packing", ["packing", "pack", "pack size", "unit", "uom"]),
  F("batch_no", "Batch", ["batch no", "batch", "batchno", "b no", "batch number", "lot no"]),
  F("expiry_date", "Expiry", ["expiry", "exp", "exp date", "expiry date", "expdt"]),
  F("quantity", "Quantity", ["qty", "quantity", "pur qty", "billed qty"], { required: true }),
  F("free", "Free quantity", ["free", "free qty", "sch qty", "scheme qty", "bonus"]),
  F("purchase_rate", "Rate (per pack)", ["rate", "purchase rate", "pur rate", "p rate", "ptr", "cost", "purchase price"], { required: true }),
  F("discount", "Discount %", ["discount %", "dis1 %", "dis1%", "dis", "disc", "dis%", "disc%", "disc %", "cd%"]),
  F("amount", "Line amount", ["amount", "bill amount", "net amount", "taxable amount", "taxable value", "value", "net value"]),
  F("tax_amount", "GST amount", ["tax amount", "gst amount", "tax amt", "gst amt"]),
  F("discount_amount", "Discount (₹)", ["discount amount", "disc amt", "discount rs", "dis amt"]),
  F("units", "Total units", ["units", "total units", "loose", "loos", "qty in units"]),
  F("gst_rate", "GST %", ["gst %", "gst", "gst%", "tax", "tax%", "gst rate", "igst%"]),
  F("mrp", "MRP (per pack)", ["mrp", "m r p", "mrp per pack"]),
  F("mrp_amount", "MRP value of the line", ["mrp amt", "mrp amount", "mrp value", "mrp val"]),
  F("manufacturer", "Manufacturer", ["company", "company name", "compnay name", "mfg", "mfr", "manufacturer"]),
  F("hsn_no", "HSN code", ["hsn", "hsn code", "hsn sac", "hsnsac"]),
];

const SALES_FIELDS = [
  F("invoice_no", "Bill no.", ["bill no", "bill no#", "bill", "invoice no", "invoice", "inv no", "bill number", "voucher no", "vch no"]),
  F("invoice_date", "Bill date", ["bill date", "date", "invoice date", "inv date", "voucher date", "sale date"]),
  F("customer_name", "Customer / party", ["customer", "customer name", "party", "party name", "account name"]),
  F("patient_name", "Patient", ["patient", "patient name", "patient nm"]),
  F("bill_type", "Entry type", ["type", "vch type", "voucher type", "entry type", "bill type", "trans type"]),
  F("customer_mobile", "Customer mobile", ["mobile", "phone", "mobile no", "contact", "contact no"]),
  F("product_name", "Product name", ["item name", "item", "product", "product name", "item description", "medicine", "particulars", "description"], { required: true }),
  F("packing", "Packing", ["packing", "pack", "pack size", "unit", "uom"]),
  F("batch_no", "Batch", ["batch no", "batch", "batchno", "b no", "batch number"]),
  F("expiry_date", "Expiry", ["expiry", "expriy date", "exp", "exp date", "expiry date", "expdt"]),
  F("quantity", "Quantity", ["qty", "quantity", "sale qty", "billed qty"], { required: true }),
  F("free", "Free quantity", ["free", "free qty", "sch qty", "scheme qty"]),
  F("sale_rate", "Selling rate (per pack)", ["rate", "sale rate", "s rate", "selling price", "price"]),
  F("discount", "Discount %", ["discount %", "dis1 %", "dis1%", "dis%", "disc%", "disc %"]),
  F("amount", "Line amount", ["amount", "bill amount", "net amount", "value", "total"]),
  F("tax_amount", "GST amount", ["tax amount", "gst amount", "tax amt"]),
  F("discount_amount", "Discount (₹)", ["discount amount", "disc amt", "discount rs", "dis amt"]),
  F("gst_rate", "GST %", ["gst %", "gst", "gst%", "tax%", "gst rate"]),
  F("mrp", "MRP (per pack)", ["mrp", "m r p", "mrp per pack"]),
  F("mrp_amount", "MRP value of the line", ["mrp amt", "mrp amount", "mrp value", "mrp val"]),
  F("units", "Total units", ["units", "total units", "loose", "loos"]),
  F("manufacturer", "Manufacturer", ["company", "company name", "compnay name", "mfg", "mfr", "manufacturer"]),
];

// What each field means, for the AI that reads a file's layout
const HINTS = {
  supplier_name: "the distributor/party the goods were bought from",
  customer_name: "the party/ledger account the sale was billed to (CASH means a walk-in sale); if the file also has a patient column, map the patient there, not here",
  patient_name: "the patient's / customer's own name typed on the bill (e.g. a 'Patient Name' column); this is who the pharmacy's customer is",
  supplier_gst: "the supplier's GSTIN (15 characters, e.g. 09AAHCM0651P1Z1)",
  bill_type: "the entry type column (e.g. Purc, Sale, Stk., P/Re, S/Re, Brk/) that tells purchases or sales from returns",
  mrp_amount: "the line's MRP value (MRP x packs, sometimes without GST); NOT the line amount",
  invoice_no: "the bill/invoice/voucher number; several lines share one",
  invoice_date: "the bill date (not the month column, not expiry)",
  product_name: "the item/medicine name",
  packing: "pack description such as 1X10, 10'S, 100ML",
  batch_no: "batch/lot number",
  expiry_date: "expiry date of the batch",
  quantity: "quantity billed (say in quantity_unit whether it counts loose units/tablets or packs/strips)",
  free: "free/scheme quantity",
  purchase_rate: "purchase rate per pack/strip before discount",
  sale_rate: "selling rate per pack/strip before discount",
  discount: "discount as a PERCENT (a column headed like 'Dis %', 'Disc%', 'Dis1 %'); only map a column whose values are percentages",
  discount_amount: "discount in RUPEES for the line. Marg's plain 'Discount' column is rupees (e.g. 18.6 on a Rs 155 line), so it goes here, not to discount",
  amount: "the line's own amount column ('Amount', 'Bill Amount', 'Net Amt'), never the MRP value column",
  tax_amount: "GST/tax amount of the line in rupees",
  gst_rate: "GST/tax PERCENT",
  mrp: "MRP per pack",
  units: "total loose units including free (only if the file has such a column)",
  manufacturer: "company/manufacturer",
  hsn_no: "HSN code",
  name: "the person's or firm's name",
  contact: "phone/mobile",
  mobile: "phone/mobile",
  stock_quantity: "stock quantity",
};

const ENTITIES = {
  stock: { label: "Stock with batches", fields: STOCK_FIELDS },
  products: { label: "Product list", fields: PRODUCT_FIELDS },
  suppliers: { label: "Suppliers", fields: SUPPLIER_FIELDS },
  customers: { label: "Customers", fields: CUSTOMER_FIELDS },
  purchases: { label: "Purchase history", fields: PURCHASE_FIELDS },
  sales: { label: "Sales history (bills)", fields: SALES_FIELDS },
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
      purchases: "Marg: Purchase › Supplier/Item wise Purchase Statement, or the Bill Wise Purchase Analysis, then Excel. Upload the .xls or .xlsx as it is.",
      sales: "Marg: Sale › Bill Wise Sale Analysis (or any sale register), then Excel. Upload the .xls or .xlsx as it is.",
    },
  },
  other: { label: "Other software or a spreadsheet", guides: {} },
};

module.exports = { ENTITIES, SOURCES, HINTS, headerKey };
