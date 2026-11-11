// Guided tour: Purchases. Format: see ./README.md.
// No imports here: the audio script reads this file on its own.

const F = '[data-testid="new-purchase-form"]';
const field = (prefix, n = 0) => ({ sel: `${F} [id^="${prefix}-"]`, nth: n });
const free = (n = 0) => ({ sel: `${F} input[id^="scheme-"]:not([id^="scheme-disc-"])`, nth: n });
const row = (text) => ({ sel: '[id^="record-"]', text });
const inRow = (prefix, text) => ({ sel: `[data-testid^="${prefix}"]`, within: row(text) });
const sugg = '[data-suggestions-dropdown="true"]';
const batchDrop = '[data-batch-dropdown="true"]';
const supplierPicker = { sel: '[data-testid="supplier-selector"]', within: F };
const supplierSearch = 'input[placeholder="Search suppliers or global distributors..."]';
const INVOICE = "SGP/2611/0457";

export default {
  id: "purchases",
  route: "/purchases",
  ready: '[data-testid="add-purchase-btn"]',
  clearKeys: ["pharmalogy_purchase_drafts_*"],
  title: { en: "Purchases", hi: "ख़रीद (Purchases)" },
  next: "assistant",
  outro: {
    en: "Close the tour and enter your next supplier bill, or replay any chapter from the bar.",
    hi: "टूर बंद कीजिए और अपना अगला supplier bill डालिए, या bar से कोई भी chapter दोबारा देखिए।",
  },
  chapters: [
    {
      id: "page",
      title: { en: "The Purchases page", hi: "Purchases पेज" },
      beats: [
        {
          id: "welcome",
          focus: null,
          look: "wide",
          fx: { type: "title", text: { en: "Purchases", hi: "ख़रीद" }, sub: { en: "Supplier bill → stock, batches and expiry", hi: "Supplier का bill → stock, batch और expiry" } },
          say: {
            en: "Welcome to Purchases. Every bill from your supplier is entered here, and the moment you save it, the medicines land in your stock with their batch, expiry, cost and MRP. Let me show you everything.",
            hi: "Purchases में आपका स्वागत है। Supplier का हर bill यहाँ डाला जाता है, और सेव करते ही दवाइयाँ अपने batch, expiry, cost और MRP के साथ आपके stock में आ जाती हैं। चलिए, सब देखते हैं।",
          },
        },
        {
          id: "count",
          focus: '[data-guide="purchase-count"]',
          say: {
            en: "This counter shows how many purchases you've recorded. Stock is always tracked in units, so a strip of 15 tablets counts as 15. This is a demo pharmacy, so nothing here touches your real data.",
            hi: "यह गिनती बताती है कि कितनी purchases दर्ज हुई हैं। Stock हमेशा units में गिना जाता है, यानी 15 tablets की एक strip 15 units है। यह demo pharmacy है, आपका असली डेटा नहीं बदलेगा।",
          },
        },
        {
          id: "shortcuts",
          focus: '[data-testid="shortcuts-btn"]',
          phone: { skip: true },
          fx: { type: "keys", combo: ["?"], label: "Shortcuts" },
          say: {
            en: "Shortcuts lists every keyboard shortcut on this page. Press the question mark key to open it any time.",
            hi: "Shortcuts में इस पेज की सारी keyboard shortcuts हैं। कभी भी question mark वाली key दबाकर इसे खोलिए।",
          },
        },
        {
          id: "scan",
          optional: true,
          focus: '[data-testid="scan-products-btn"]',
          fx: { type: "scan" },
          say: {
            en: "Scan is the fastest way in. Take a photo of the supplier's printed bill, and the AI reads every line, with batch, expiry, quantity, free packs and rates, and fills the purchase for you to check.",
            hi: "Scan सबसे तेज़ तरीका है। Supplier के bill की photo लीजिए, AI हर line पढ़ लेगा, batch, expiry, quantity, free packs और rate के साथ, और purchase भर देगा, आपको बस जाँचना है।",
          },
        },
        {
          id: "csv",
          focus: '[data-testid="csv-import-btn"]',
          say: {
            en: "CSV Import takes the bill file many distributors send. You match its columns once, and the rows come in as a purchase.",
            hi: "CSV Import उस file के लिए है जो कई distributors bill के साथ भेजते हैं। एक बार columns मिलाइए, और सारी rows purchase बनकर आ जाती हैं।",
          },
        },
        {
          id: "drafts",
          focus: '[data-testid="purchase-drafts-btn"]',
          say: {
            en: "Drafts keeps purchases you saved to finish later, including ones the AI assistant or the scanner prepared. A draft doesn't add stock until you save it as a purchase.",
            hi: "Drafts में वो purchases रहती हैं जिन्हें आपने बाद में पूरा करने के लिए रखा, AI assistant या scanner की बनाई हुई भी। Draft से stock तब तक नहीं जुड़ता जब तक आप उसे purchase के रूप में सेव न करें।",
          },
        },
        {
          id: "new-btn",
          focus: '[data-testid="add-purchase-btn"]',
          fx: [{ type: "keys", combo: ["Alt", "N"], desktopOnly: true }, { type: "rings" }],
          say: {
            en: "New starts a purchase by hand. Alt plus N does the same, or Option plus N on a Mac. We'll enter one together in a moment.",
            hi: "New से हाथ से purchase शुरू होती है। Alt और N से भी, Mac पर Option और N से। थोड़ी देर में हम साथ मिलकर एक purchase डालेंगे।",
          },
        },
        {
          id: "search",
          focus: 'input[placeholder="Search purchases by supplier, invoice..."]',
          during: [{ pause: 2800 }, { type: "Arihant", into: 'input[placeholder="Search purchases by supplier, invoice..."]' }],
          after: [{ pause: 1300 }, { type: "", into: 'input[placeholder="Search purchases by supplier, invoice..."]' }, { blur: true }],
          say: {
            en: "Search finds a purchase by supplier, invoice number or medicine. Watch: Arihant, and only Arihant's bills stay.",
            hi: "Search से purchase मिलती है: supplier, invoice number या दवा के नाम से। देखिए: Arihant, और सिर्फ़ Arihant के bills बचते हैं।",
          },
        },
        {
          id: "filters",
          focus: '[data-guide="purchase-filters"]',
          say: {
            en: "Next to it, pick one supplier, or a date range with the two date boxes. Clear resets everything.",
            hi: "उसके पास से एक supplier चुनिए, या दोनों date boxes से तारीख़ की range। Clear से सब हट जाता है।",
          },
        },
        {
          id: "rows",
          focus: { sel: '[id^="record-"]' },
          during: [{ pause: 5200 }, { click: { sel: '[id^="record-"]' } }],
          say: {
            en: "Each row is one supplier bill: invoice and date, supplier, items, payment status, and amount. Click a row to see every line: batch, expiry, packs, free packs, rate and MRP, plus its payment history.",
            hi: "हर row supplier का एक bill है: invoice और तारीख़, supplier, items, payment status और रकम। Row पर click कीजिए, हर line दिखेगी: batch, expiry, packs, free packs, rate और MRP, साथ में payment history।",
          },
          after: [{ pause: 1500 }, { click: { sel: '[id^="record-"]' } }],
        },
        {
          id: "row-actions",
          focus: { sel: '[data-testid^="pdf-purchase-"]', closest: "td" },
          fx: {
            type: "chips",
            items: [
              { label: "PDF", value: "P", tone: "violet" },
              { label: { en: "QR labels", hi: "QR labels" }, value: "L", tone: "orange" },
              { label: "Edit", value: "E", tone: "sky" },
              { label: "Delete", value: "Del", tone: "rose" },
            ],
          },
          say: {
            en: "The row buttons: PDF prints the purchase, the QR button prints small labels to stick on each pack so billing can scan them, Edit changes the purchase, and Delete removes it.",
            hi: "Row के बटन: PDF से purchase print होती है, QR बटन हर pack पर चिपकाने के छोटे labels print करता है ताकि billing में scan हो सकें, Edit से purchase बदलती है, और Delete से हटती है।",
          },
        },
      ],
    },
    {
      id: "header",
      title: { en: "A new purchase: supplier and invoice", hi: "नई purchase: supplier और invoice" },
      beats: [
        {
          id: "start",
          before: [{ scrollTop: true }],
          focus: '[data-testid="add-purchase-btn"]',
          during: [{ pause: 3400 }, { click: '[data-testid="add-purchase-btn"]' }, { wait: F }],
          say: {
            en: "Let's enter today's bill from Shree Ganesh Pharma: Dolo 650 that we already stock, and Azithral 500, which is new to us. I'll press New.",
            hi: "आज का Shree Ganesh Pharma वाला bill डालते हैं: Dolo 650, जो हमारे पास पहले से है, और Azithral 500, जो हमारे लिए नई है। मैं New दबाती हूँ।",
          },
        },
        {
          id: "supplier",
          focus: supplierPicker,
          during: [
            { pause: 2600 },
            { click: supplierPicker },
            { wait: supplierSearch },
            { type: "Shree", into: supplierSearch },
            { wait: { sel: "[data-index]", text: "Shree Ganesh Pharma" } },
            { focusOn: [{ union: supplierPicker }, { union: { sel: "[data-index]", text: "Shree Ganesh Pharma", closest: ".absolute" } }] },
            { pause: 4200 },
            { click: { sel: "[data-index]", text: "Shree Ganesh Pharma" } },
          ],
          say: {
            en: "Supplier comes first. Type a few letters and you'll see your own suppliers, plus distributors from our shared directory, marked Global, with their GST number and city. Pick one and it's added to your suppliers. Or add a new one at the bottom.",
            hi: "सबसे पहले Supplier. कुछ अक्षर लिखिए, आपके अपने suppliers दिखेंगे, और हमारी shared directory के distributors भी, Global लिखे हुए, GST number और शहर के साथ। चुनते ही वह आपके suppliers में जुड़ जाता है। नया supplier नीचे से जोड़ सकते हैं।",
          },
        },
        {
          id: "invoice",
          focus: '[data-testid="invoice-no-input"]',
          during: [{ pause: 2400 }, { type: INVOICE, into: '[data-testid="invoice-no-input"]' }],
          say: {
            en: "Invoice Number is the number printed on the supplier's bill. It lets you find this purchase later and match it with their statement.",
            hi: "Invoice Number वह है जो supplier के bill पर छपा है। इससे यह purchase बाद में मिल जाती है और supplier के hisaab से मिलान होता है।",
          },
        },
        {
          id: "date",
          focus: { sel: 'input[type="date"]', within: F },
          say: {
            en: "Purchase Date is today by default. Change it when you enter an older bill.",
            hi: "Purchase Date अपने आप आज की होती है। पुराना bill डालते समय इसे बदल दीजिए।",
          },
        },
      ],
    },
    {
      id: "items",
      title: { en: "Entering the medicines", hi: "दवाइयाँ डालना" },
      beats: [
        {
          id: "table",
          focus: '[data-guide="purchase-items"]',
          look: "wide",
          say: {
            en: "Each line of the supplier's bill is one row here: product, batch, expiry, MRP, rate, quantity, free packs, scheme discount, discount, GST, amount and margin. Prices are per pack, just as the supplier prints them.",
            hi: "Supplier के bill की हर line यहाँ एक row है: product, batch, expiry, MRP, rate, quantity, free packs, scheme discount, discount, GST, amount और margin. दाम pack के हिसाब से हैं, जैसे supplier छापता है।",
          },
        },
        {
          id: "product",
          focus: '[data-testid="item-name-0"]',
          during: [{ pause: 1800 }, { type: "dolo", into: '[data-testid="item-name-0"]' }, { wait: { sel: `${sugg} [id^="purchases-suggestion-"]`, text: "Dolo 650" } }],
          say: {
            en: "In Product, type the medicine's name. I'll type dolo.",
            hi: "Product में दवा का नाम लिखिए। मैं dolo लिखती हूँ।",
          },
        },
        {
          id: "suggestions",
          focus: sugg,
          look: "wide",
          during: [{ pause: 9000 }, { click: { sel: `${sugg} [id^="purchases-suggestion-"]`, text: "Dolo 650" } }],
          say: {
            en: "The list shows your own products first, tagged My Catalog or In Stock, then the shared medicine database. Each shows its maker, salt, pack size, MRP, trade rate and GST, so you pick the exact one. If it's nowhere, Create in Product Catalog adds it.",
            hi: "List में पहले आपके अपने products आते हैं, My Catalog या In Stock लिखे हुए, फिर shared medicine database. हर दवा के साथ company, salt, pack size, MRP, trade rate और GST दिखता है, ताकि आप सही दवा चुनें। कहीं न मिले, तो Create in Product Catalog से जोड़िए।",
          },
        },
        {
          id: "filled",
          focus: { sel: '[data-testid="item-name-0"]', closest: "td" },
          say: {
            en: "Picking it fills in the maker, salt, pack size, HSN, MRP, rate and GST. The info button opens its batches and past purchases, and Edit lets you correct the pack or salt.",
            hi: "चुनते ही company, salt, pack size, HSN, MRP, rate और GST भर जाते हैं। Info बटन से उसके batches और पुरानी purchases दिखती हैं, और Edit से pack या salt ठीक कर सकते हैं।",
          },
        },
        {
          id: "batch",
          before: [{ wait: batchDrop, timeout: 4000 }],
          focus: [{ union: field("batch") }, { union: batchDrop }],
          during: [{ pause: 6200 }, { type: "DL25110", into: field("batch") }],
          say: {
            en: "The cursor jumps to Batch, and your existing batches of Dolo appear with stock and expiry. If the bill has one of them, pick it. This one is a new batch, so I just type DL25110.",
            hi: "Cursor Batch पर पहुँच जाता है, और Dolo के मौजूदा batches stock और expiry के साथ दिखते हैं। Bill में वही batch हो तो चुन लीजिए। यह नया batch है, तो मैं DL25110 लिखती हूँ।",
          },
        },
        {
          id: "expiry",
          focus: field("expiry"),
          during: [{ pause: 1800 }, { click: field("expiry") }, { type: "09/28", into: field("expiry") }],
          say: {
            en: "Expiry goes in as month and year, like 09 slash 28. Billing uses it to sell the oldest batch first and to warn you before it expires.",
            hi: "Expiry महीना और साल में डालते हैं, जैसे 09 slash 28. Billing इसी से पहले पुराना batch बेचता है और expire होने से पहले चेतावनी देता है।",
          },
        },
        {
          id: "mrp-rate",
          focus: [{ union: field("mrp") }, { union: field("rate") }],
          fx: { type: "equation", parts: ["₹31.95", "÷", "15", "=", "₹2.13"], delay: 4200 },
          say: {
            en: "MRP and Rate are per pack. MRP is the printed price, 31 rupees 95 for a strip of 15, so 2 rupees 13 a tablet. Rate is what you pay the supplier, here 21 rupees 30. If a rate is higher than you paid before, a red badge warns you.",
            hi: "MRP और Rate pack के हिसाब से हैं। MRP छपा हुआ दाम है, 15 की strip के 31 रुपये 95 पैसे, यानी एक tablet 2 रुपये 13 पैसे। Rate वह है जो आप supplier को देते हैं, यहाँ 21 रुपये 30 पैसे। पहले से महँगा rate हो तो लाल badge चेतावनी देता है।",
          },
        },
        {
          id: "qty",
          focus: field("qty"),
          during: [{ pause: 2200 }, { type: "10", into: field("qty") }],
          say: {
            en: "Quantity is in packs, as on the bill: 10 strips. The small number under it is units per pack. Tap it if the pack size differs.",
            hi: "Quantity packs में होती है, जैसे bill पर: 10 strips. नीचे का छोटा number एक pack में units है। Pack size अलग हो तो उस पर tap कीजिए।",
          },
        },
        {
          id: "free",
          focus: free(0),
          during: [{ pause: 2600 }, { type: "1", into: free(0) }, { wait: '[data-testid="qty-calc-0"]' }, { focusOn: [{ union: free(0) }, { union: '[data-testid="qty-calc-0"]' }] }],
          fx: { type: "equation", parts: ["10", "+", "1 free", "=", "165 units"], delay: 5200 },
          say: {
            en: "Free is the supplier's scheme, like 10 plus 1. Part packs work too, like 1.75 plus 0.25. The line below works it out: pay for 10, get 11 strips, 165 tablets, and the real cost of each one.",
            hi: "Free यानी supplier की scheme, जैसे 10 पर 1. आधे-अधूरे pack भी चलते हैं, जैसे 1.75 पर 0.25. नीचे की line हिसाब दिखाती है: 10 का पैसा, 11 strips, यानी 165 tablets, और हर tablet की असली cost.",
          },
        },
        {
          id: "discounts",
          focus: [{ union: field("scheme-disc") }, { union: field("discount") }],
          say: {
            en: "Scheme discount is a supplier offer, as a percent or a rupee amount off the line. Disc is the cash discount percent. Both lower your cost.",
            hi: "Scheme discount supplier का offer है, line पर percent में या रुपयों में। Disc यानी cash discount percent में। दोनों से आपकी cost कम होती है।",
          },
        },
        {
          id: "gst",
          focus: field("gst"),
          fx: { type: "split", from: "GST 12%", into: ["CGST 6%", "SGST 6%"] },
          say: {
            en: "GST comes from the product. Tick All in the column header to give every row the same GST in one go.",
            hi: "GST product से आता है। Column के ऊपर All पर tick करें, तो एक बार में हर row पर वही GST लग जाता है।",
          },
        },
        {
          id: "amount",
          focus: field("total"),
          say: {
            en: "Amount is the line total with GST. It works both ways: enter the rate and it calculates the amount, or type the amount from the bill and it works out the rate.",
            hi: "Amount, GST के साथ line का total है। यह दोनों तरफ़ चलता है: rate डालिए तो amount बनता है, या bill का amount लिखिए तो rate निकल आता है।",
          },
        },
        {
          id: "margin",
          focus: field("margin"),
          during: [{ pause: 3200 }, { type: "25", into: field("margin") }],
          say: {
            en: "Margin is your markup over the real cost. Leave it blank and billing sells at MRP. Enter 25, and billing sells at cost plus 25 percent, shown right below, and never above MRP.",
            hi: "Margin यानी असली cost पर आपका मुनाफ़ा। खाली छोड़ेंगे तो billing MRP पर बेचेगा। 25 डालिए, तो billing cost से 25 percent ऊपर बेचेगा, जो ठीक नीचे दिखता है, और कभी MRP से ऊपर नहीं।",
          },
        },
        {
          id: "add-item",
          focus: '[data-testid="add-item-btn"]',
          during: [{ pause: 2400 }, { click: '[data-testid="add-item-btn"]' }, { wait: '[data-testid="item-name-1"]' }],
          say: {
            en: "Add Item gives the next row. Pressing Enter on the last field of a row does the same.",
            hi: "Add Item से अगली row आती है। Row के आख़िरी field पर Enter दबाने से भी।",
          },
        },
        {
          id: "new-product",
          before: [
            { type: "azithral", into: '[data-testid="item-name-1"]' },
            { wait: { sel: `${sugg} [id^="purchases-suggestion-"]`, text: "Azithral 500" } },
          ],
          focus: sugg,
          during: [
            { pause: 6500 },
            { click: { sel: `${sugg} [id^="purchases-suggestion-"]`, text: "Azithral 500" } },
            { pause: 900 },
            { type: "AZ7721", into: field("batch", 1) },
            { click: field("expiry", 1) },
            { type: "03/28", into: field("expiry", 1) },
            { type: "3", into: field("qty", 1) },
            { type: "2", into: field("discount", 1) },
          ],
          say: {
            en: "Azithral is new to our shop, so it comes from the Global Catalog. Picking it adds it to your own catalog with all its details. Then batch, expiry, 3 strips and a 2 percent discount.",
            hi: "Azithral हमारी दुकान में नई है, इसलिए यह Global Catalog से आती है। चुनते ही यह पूरी जानकारी के साथ आपके अपने catalog में जुड़ जाती है। फिर batch, expiry, 3 strips और 2 percent discount.",
          },
        },
        {
          id: "tip",
          focus: '[data-guide="purchase-tip"]',
          say: {
            en: "Only the product, quantity and rate are needed. Salt, HSN, batch and expiry are optional, but batch and expiry make billing and expiry alerts work best.",
            hi: "ज़रूरी सिर्फ़ product, quantity और rate हैं। Salt, HSN, batch और expiry ज़रूरी नहीं, पर batch और expiry होने से billing और expiry alerts सबसे अच्छे चलते हैं।",
          },
        },
        {
          id: "autofill",
          optional: true,
          focus: { sel: "button", text: "Autofill", within: F },
          say: {
            en: "When a product is missing its maker or salt, Autofill asks the AI to fill them in. Always check what it adds.",
            hi: "जब किसी product की company या salt न हो, तो Autofill AI से भरवा देता है। जो जोड़े, उसे एक बार ज़रूर देख लीजिए।",
          },
        },
      ],
    },
    {
      id: "payment",
      title: { en: "Paying for it", hi: "भुगतान" },
      beats: [
        {
          id: "status",
          before: [{ scrollTop: true }],
          focus: '[data-guide="pay-status"]',
          fx: {
            type: "chips",
            delay: 3000,
            items: [
              { label: "Unpaid", value: { en: "pay later", hi: "बाद में" }, tone: "rose" },
              { label: "Partial", value: { en: "part now", hi: "थोड़ा अभी" }, tone: "orange" },
              { label: "Fully Paid", value: { en: "all now", hi: "पूरा अभी" }, tone: "green" },
            ],
          },
          say: {
            en: "Payment Status says how much you've paid the supplier. Unpaid means it all goes on their account. Partial means you paid part now. Fully Paid means it's settled.",
            hi: "Payment Status बताता है कि supplier को कितना दिया। Unpaid यानी पूरा उनके खाते में बाकी। Partial यानी अभी थोड़ा दिया। Fully Paid यानी पूरा चुका दिया।",
          },
        },
        {
          id: "partial",
          before: [{ click: { sel: "button", text: "Partial", within: '[data-guide="pay-status"]' } }, { wait: 'input[placeholder="e.g. 500"]' }],
          focus: [{ union: '[data-guide="pay-status"]' }, { union: 'input[placeholder="e.g. 500"]' }],
          during: [{ pause: 2600 }, { type: "200", into: 'input[placeholder="e.g. 500"]' }],
          say: {
            en: "We're paying 200 rupees today, so I choose Partial and type 200 in Initial Paid. The rest stays on Shree Ganesh's account. If the amount covers the whole bill, it switches to Fully Paid by itself.",
            hi: "आज हम 200 रुपये दे रहे हैं, इसलिए मैं Partial चुनती हूँ और Initial Paid में 200 लिखती हूँ। बाकी Shree Ganesh के खाते में रहेगा। रकम पूरे bill जितनी हो, तो यह अपने आप Fully Paid हो जाता है।",
          },
        },
        {
          id: "mode",
          focus: '[data-guide="pay-mode"]',
          during: [{ pause: 2200 }, { select: "UPI", trigger: '[data-guide="pay-mode"]', exact: true }],
          say: {
            en: "Payment Mode records how you paid: Cash, UPI or Card. We paid by UPI.",
            hi: "Payment Mode में लिखते हैं कि पैसे कैसे दिए: Cash, UPI या Card. हमने UPI से दिए।",
          },
        },
        {
          id: "summary",
          focus: '[data-guide="purchase-summary"]',
          say: {
            en: "This pill keeps the running count of units and the bill total, and with a part payment it also shows the balance still owed.",
            hi: "यह पट्टी units की गिनती और bill का total दिखाती है, और थोड़ा भुगतान होने पर बकाया रकम भी।",
          },
        },
      ],
    },
    {
      id: "save",
      title: { en: "Saving the purchase", hi: "Purchase सेव करना" },
      beats: [
        {
          id: "bar",
          focus: '[data-guide="purchase-bar"]',
          say: {
            en: "The bar at the bottom saves it. Tabs let you keep several bills open. Save as draft keeps it for later without adding stock. Cancel throws it away.",
            hi: "नीचे की bar से सेव होता है। Tabs में कई bills एक साथ खुले रह सकते हैं। Save as draft बाद के लिए रख लेता है, stock जोड़े बिना। Cancel इसे छोड़ देता है।",
          },
        },
        {
          id: "save",
          focus: '[data-shortcut="save"]',
          fx: [{ type: "keys", combo: ["Ctrl", "Enter"], desktopOnly: true }, { type: "rings" }],
          during: [{ pause: 4600 }, { click: '[data-shortcut="save"]' }, { wait: { sel: '[role="alertdialog"]', text: "Generate Purchase PDF" } }],
          say: {
            en: "Save Purchase adds it all to stock. Control plus Enter works too, or Command plus Enter on a Mac.",
            hi: "Save Purchase से सब कुछ stock में जुड़ जाता है। Control और Enter से भी, Mac पर Command और Enter से।",
          },
        },
        {
          id: "pdf",
          focus: '[role="alertdialog"]',
          during: [{ pause: 4200 }, { click: { sel: "button", text: "Skip", within: '[role="alertdialog"]' } }, { gone: '[role="alertdialog"]' }],
          say: {
            en: "Saved! It offers a PDF of the purchase for your records. I'll skip it for now; you can print it any time from the row.",
            hi: "सेव हो गया! रिकॉर्ड के लिए purchase का PDF बनाने का विकल्प आता है। अभी मैं छोड़ देती हूँ, row से कभी भी print कर सकते हैं।",
          },
        },
        {
          id: "saved",
          before: [{ wait: row(INVOICE) }, { scrollTop: true }],
          focus: row(INVOICE),
          fx: [
            { type: "stamp", text: "Partial", tone: "orange" },
            { type: "chips", delay: 3000, items: [{ label: "Dolo 650 · DL25110", value: "+165 units", tone: "green" }, { label: "Azithral 500 · AZ7721", value: { en: "new · +15 units", hi: "नई · +15 units" }, tone: "green" }] },
          ],
          say: {
            en: "Here's the new purchase at the top, partly paid. The stock is already in: 165 Dolo tablets in the new batch, and 15 Azithral tablets, ready to bill.",
            hi: "ये रही नई purchase सबसे ऊपर, थोड़ा भुगतान हुआ। Stock पहुँच चुका है: नए batch में Dolo की 165 tablets, और Azithral की 15 tablets, billing के लिए तैयार।",
          },
        },
      ],
    },
    {
      id: "after",
      title: { en: "Paying the supplier", hi: "Supplier को भुगतान" },
      beats: [
        {
          id: "open",
          before: [{ click: row(INVOICE) }, { wait: { sel: "button", text: "Pay Part" } }],
          focus: { sel: "button", text: "Pay Part", closest: "div" },
          say: {
            en: "Open the row to see what's still owed. Pay Part records another instalment. Mark Paid settles the whole balance.",
            hi: "Row खोलिए, कितना बाकी है दिख जाएगा। Pay Part से अगली किश्त दर्ज होती है। Mark Paid से पूरा बकाया चुकता हो जाता है।",
          },
        },
        {
          id: "pay-part",
          before: [{ click: { sel: "button", text: "Pay Part" } }, { wait: '[data-testid="pay-part-amount"]' }],
          focus: '[role="dialog"]',
          during: [{ pause: 2600 }, { type: "100", into: '[data-testid="pay-part-amount"]' }, { pause: 5200 }, { click: '[role="dialog"] > button.absolute' }, { gone: '[role="dialog"]' }],
          say: {
            en: "Here you see the total, what's paid, and what's left. Enter the amount, choose the mode, add a reference if you like, and Save Payment. I'll close this one.",
            hi: "यहाँ total, दिया हुआ और बाकी, सब दिखता है। रकम डालिए, mode चुनिए, चाहें तो reference लिखिए, और Save Payment. इसे मैं बंद कर देती हूँ।",
          },
        },
        {
          id: "mark-paid",
          focus: { sel: "button", text: "Mark Paid" },
          look: "loupe",
          during: [{ pause: 3400 }, { click: { sel: "button", text: "Mark Paid" } }, { fx: { type: "stamp", text: "Paid", tone: "green", at: row(INVOICE) } }],
          hold: 1400,
          say: {
            en: "And when you clear the bill, Mark Paid. The supplier's account updates straight away.",
            hi: "और जब पूरा bill चुका दें, तो Mark Paid. Supplier का खाता तुरंत अपडेट हो जाता है।",
          },
        },
        {
          id: "labels",
          before: [{ click: row(INVOICE) }, { scrollTop: true }],
          focus: { sel: 'button[aria-label="Print item QR labels"]', within: row(INVOICE) },
          look: "loupe",
          fx: { type: "scan" },
          say: {
            en: "The QR button prints a small label for each pack. Stick it on, and at the billing counter, Scan item QR fills the exact batch in one go.",
            hi: "QR बटन हर pack के लिए छोटा label print करता है। चिपका दीजिए, और billing counter पर Scan item QR से सही batch एक बार में भर जाता है।",
          },
        },
        {
          id: "delete",
          before: [{ click: inRow("delete-purchase-", INVOICE) }, { wait: '[role="alertdialog"]' }, { wait: { sel: "th", text: "In stock" } }],
          focus: '[role="alertdialog"]',
          during: [{ pause: 10500 }, { click: { sel: "button", text: "Cancel", within: '[role="alertdialog"]' } }],
          say: {
            en: "Delete first shows the stock this purchase added: purchased, sold, and still on the shelf. Then choose: keep the stock and delete only the record, or delete and take the stock back out. I'll cancel.",
            hi: "Delete पहले दिखाता है कि इस purchase से कितना stock आया: ख़रीदा, बिका, और अभी shelf पर। फिर चुनिए: stock रखकर सिर्फ़ record हटाएँ, या record के साथ stock भी घटाएँ। मैं Cancel दबाती हूँ।",
          },
        },
        {
          id: "finale",
          focus: null,
          look: "wide",
          fx: { type: "title", text: { en: "Stock in, the right way", hi: "Stock सही तरीके से" }, sub: { en: "Supplier → Medicines → Batch & expiry → Payment → Save", hi: "Supplier → दवाइयाँ → Batch और expiry → Payment → Save" } },
          say: {
            en: "That's Purchases. Every saved bill keeps your stock, costs and supplier dues exact. Close the tour and enter your next bill, or scan it and let the AI do the typing.",
            hi: "यह थी Purchases. हर सेव bill से आपका stock, cost और supplier का बकाया बिल्कुल सही रहता है। टूर बंद कीजिए और अगला bill डालिए, या scan कीजिए और typing AI पर छोड़ दीजिए।",
          },
        },
      ],
    },
  ],
};
