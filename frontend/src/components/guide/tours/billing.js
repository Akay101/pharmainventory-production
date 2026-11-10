// Guided tour: Billing. Format: see ./README.md.
// No imports here: the audio script (backend-node/scripts/build-guide-audio.js)
// reads this file on its own to record the narration.

const row = (text) => ({ sel: '[data-testid^="bill-row-"]', text });
const inRow = (prefix, text) => ({ sel: `[data-testid^="${prefix}"]`, within: row(text) });
const popper = { sel: "[data-radix-popper-content-wrapper]", last: true };
const sugg = '[data-suggestions-dropdown="true"]';
const nth = (g, n) => ({ sel: `[data-guide="${g}"]`, nth: n });
const pickProduct = (rowIndex, query, name, batch) => [
  { type: query, into: `[data-testid="item-product-${rowIndex}"]` },
  { wait: { sel: '[data-testid="suggestion-row"]', text: name } },
  { pause: 500 },
  { click: { sel: '[data-testid="suggestion-row"]', text: name } },
  { wait: { sel: "button", text: batch, within: popper } },
  { pause: 700 },
  { click: { sel: "button", text: batch, within: popper } },
  { gone: popper },
];

export default {
  id: "billing",
  route: "/billing",
  ready: '[data-testid="new-bill-btn"]',
  clearKeys: ["pharmalogy_billing_drafts_*"],
  title: { en: "Billing", hi: "बिलिंग" },
  next: "purchases",
  outro: {
    en: "Close the tour and make your first real bill, or replay any chapter from the bar.",
    hi: "टूर बंद कीजिए और अपना पहला असली bill बनाइए, या bar से कोई भी chapter दोबारा देखिए।",
  },
  chapters: [
    {
      id: "page",
      title: { en: "The Billing page", hi: "बिलिंग पेज" },
      beats: [
        {
          id: "welcome",
          focus: null,
          look: "wide",
          fx: { type: "title", text: { en: "Billing", hi: "बिलिंग" }, sub: { en: "Customer · Medicines · Discount · Payment", hi: "ग्राहक · दवाइयाँ · Discount · Payment" } },
          say: {
            en: "Welcome to Billing. This is where every sale becomes a proper GST bill: the customer, the medicines, discounts and payment, all on one screen. Let me show you everything, one control at a time.",
            hi: "Billing में आपका स्वागत है। यहाँ हर बिक्री एक पक्का GST bill बनती है: ग्राहक, दवाइयाँ, discount और payment, सब एक ही स्क्रीन पर। चलिए, एक-एक बटन करके सब देखते हैं।",
          },
        },
        {
          id: "count",
          focus: '[data-guide="bill-count"]',
          say: {
            en: "This counter shows how many bills you've made. Right now we're inside a demo pharmacy, so these are sample bills. Nothing in this tour touches your real data.",
            hi: "यह गिनती बताती है कि अब तक कितने bills बने हैं। अभी हम एक demo pharmacy में हैं, इसलिए ये सैंपल bills हैं। इस टूर में आपका असली डेटा बिल्कुल नहीं बदलेगा।",
          },
        },
        {
          id: "shortcuts",
          focus: '[data-testid="shortcuts-btn"]',
          phone: { skip: true },
          fx: { type: "keys", combo: ["?"], label: "Shortcuts" },
          say: {
            en: "Shortcuts lists every keyboard shortcut on this page. Press the question mark key any time to open it. Billing is fastest from the keyboard.",
            hi: "Shortcuts में इस पेज की सारी keyboard shortcuts हैं। कभी भी question mark वाली key दबाइए, यह खुल जाएगा। कीबोर्ड से billing सबसे तेज़ होती है।",
          },
        },
        {
          id: "upi-qr",
          focus: '[data-testid="upi-qr-btn"]',
          fx: { type: "keys", combo: ["Alt", "Q"], desktopOnly: true },
          say: {
            en: "UPI QR shows a payment QR for any amount, even without a bill. Type the amount, and the customer scans it and pays straight into your UPI ID.",
            hi: "UPI QR किसी भी रकम का payment QR दिखाता है, bill के बिना भी। रकम डालिए, ग्राहक scan करेगा और पैसे सीधे आपके UPI ID में आ जाएँगे।",
          },
        },
        {
          id: "new-bill-btn",
          focus: '[data-testid="new-bill-btn"]',
          fx: [{ type: "keys", combo: ["Alt", "N"], desktopOnly: true }, { type: "rings" }],
          say: {
            en: "New Bill starts a fresh bill. Alt plus N does the same, or Option plus N on a Mac. We'll make one together in a minute.",
            hi: "New Bill से नया bill शुरू होता है। Alt और N दबाने से भी यही होता है, Mac पर Option और N। थोड़ी देर में हम साथ मिलकर एक bill बनाएँगे।",
          },
        },
        {
          id: "search",
          focus: 'input[data-shortcut="search"]',
          during: [{ pause: 2600 }, { type: "Dolo", into: 'input[data-shortcut="search"]' }],
          after: [{ pause: 1200 }, { type: "", into: 'input[data-shortcut="search"]' }, { blur: true }],
          say: {
            en: "Search finds any old bill by bill number, customer, doctor, batch, medicine, even notes. Watch: I'll type Dolo, and only the bills with Dolo stay.",
            hi: "Search से कोई भी पुराना bill मिल जाता है: bill number, ग्राहक, doctor, batch, दवा का नाम, यहाँ तक कि notes से भी। देखिए, मैं Dolo लिखती हूँ, सिर्फ़ Dolo वाले bills बचेंगे।",
          },
        },
        {
          id: "scan-list",
          optional: true,
          focus: '[data-testid="scan-bill-list-btn"]',
          fx: { type: "scan" },
          say: {
            en: "Scan for Bill opens the camera. Show it a prescription or a handwritten list, and the AI reads the medicines and starts the bill for you.",
            hi: "Scan for Bill से camera खुलता है। Prescription या हाथ से लिखी पर्ची दिखाइए, AI दवाइयाँ पढ़कर आपके लिए bill शुरू कर देगा।",
          },
        },
        {
          id: "customer-filter",
          focus: '[data-testid="customer-filter"]',
          say: {
            en: "All Customers narrows the list to one customer's bills. Handy when someone asks what they bought last month.",
            hi: "All Customers से list में किसी एक ग्राहक के bills ही दिखते हैं। जब कोई पूछे कि पिछले महीने क्या लिया था, तब बहुत काम आता है।",
          },
        },
        {
          id: "bill-type",
          focus: '[data-guide="bill-type"]',
          during: [{ pause: 3800 }, { select: "Advance Bills", trigger: '[data-guide="bill-type"]' }],
          after: [{ pause: 1400 }, { select: "All Bills", trigger: '[data-guide="bill-type"]' }],
          say: {
            en: "This menu switches between all bills, regular bills and advance bills. An advance bill is one where the customer paid part of the money upfront. Here are the advance bills, and back to all.",
            hi: "इस menu से सारे bills, regular bills या advance bills देख सकते हैं। Advance bill वह है जिसमें ग्राहक ने पहले से कुछ पैसे दे दिए हों। ये रहे advance bills, और वापस सारे bills।",
          },
        },
        {
          id: "drafts",
          focus: { sel: "button", text: "Draft Bills" },
          say: {
            en: "Draft Bills holds bills that were started but not finished, for example ones the AI assistant prepared for you to check. Open a draft to finish it, or delete it.",
            hi: "Draft Bills में वो bills रहते हैं जो शुरू हुए पर पूरे नहीं हुए, जैसे AI assistant ने आपके देखने के लिए तैयार किए हों। Draft खोलकर पूरा कीजिए, या delete कर दीजिए।",
          },
        },
        {
          id: "more-filters",
          before: [{ click: { sel: "button", text: "More Filters" } }, { wait: { sel: '[role="dialog"]', text: "Date Range" } }],
          focus: { sel: '[role="dialog"]', text: "Date & Filter Options", closest: '[role="dialog"]' },
          during: [{ pause: 5200 }, { click: { sel: "button", text: "This Month", within: { sel: '[role="dialog"]', text: "Quick Presets", closest: '[role="dialog"]' } } }],
          after: [{ pause: 600 }, { key: "Escape" }],
          say: {
            en: "More Filters picks a date range. Choose From and To dates, or a quick preset: Today, Yesterday or This Month. I'll pick This Month.",
            hi: "More Filters से तारीख़ की range चुनते हैं। From और To date डालिए, या सीधे Today, Yesterday या This Month दबाइए। मैं This Month चुनती हूँ।",
          },
        },
        {
          id: "insights",
          before: [{ wait: '[data-guide="bill-insights"]' }, { pause: 900 }],
          focus: '[data-guide="bill-insights"]',
          look: "wide",
          say: {
            en: "With a date range on, Billing becomes a report: total revenue, net profit, number of bills, the money still unpaid, and your ten best sellers for that period. Download Report saves it as a file.",
            hi: "Date range लगते ही Billing एक report बन जाती है: कुल बिक्री, net profit, कितने bills बने, कितना पैसा बाकी है, और उस समय की दस सबसे ज़्यादा बिकने वाली दवाइयाँ। Download Report से इसे file में सेव कर सकते हैं।",
          },
          after: [
            { click: { sel: "button", text: "More Filters" } },
            { click: { sel: "button", text: "Reset All" } },
            { key: "Escape" },
            { gone: '[data-guide="bill-insights"]' },
            { scrollTop: true },
          ],
        },
        {
          id: "rows",
          focus: { sel: '[data-testid^="bill-row-"]' },
          during: [{ pause: 4800 }, { click: { sel: '[data-testid^="bill-row-"]' } }, { focusOn: [{ union: { sel: '[data-testid^="bill-row-"]' } }, { union: '[data-guide="bill-expanded"]' }] }],
          say: {
            en: "Each row is one bill: number and date, customer, items, amount, profit, and whether it's paid. Click a row to open it and see every medicine sold, with batch, quantity, price and GST.",
            hi: "हर row एक bill है: number और तारीख़, ग्राहक, items, रकम, मुनाफ़ा, और payment हुआ या नहीं। Row पर click करते ही bill खुलता है और हर बिकी दवा दिखती है, batch, quantity, दाम और GST के साथ।",
          },
          after: [{ click: { sel: '[data-testid^="bill-row-"]' } }],
        },
        {
          id: "row-actions",
          focus: { sel: '[data-testid^="edit-bill-"]', closest: "td" },
          fx: {
            type: "chips",
            items: [
              { label: "Edit", value: "E", tone: "sky" },
              { label: "PDF", value: "P", tone: "violet" },
              { label: "WhatsApp", value: "W", tone: "green" },
              { label: "UPI QR", value: "Q", tone: "orange" },
              { label: "Mark paid", value: "M", tone: "green" },
              { label: "Delete", value: "Del", tone: "rose" },
            ],
          },
          say: {
            en: "These buttons act on that bill. Edit changes it, PDF prints or shares it, WhatsApp sends it to the customer, and Delete removes it. While money is due you also get a UPI QR for the balance and a tick to mark it paid. Each one has a single key shortcut.",
            hi: "ये बटन उसी bill पर काम करते हैं। Edit से बदलिए, PDF से print या share कीजिए, WhatsApp से ग्राहक को भेजिए, और Delete से हटाइए। जब पैसा बाकी हो तो बकाया रकम का UPI QR और paid करने का tick भी मिलता है। हर बटन की एक key वाली shortcut है।",
          },
        },
        {
          id: "mark-paid",
          focus: inRow("mark-paid-btn-", "Kavita Joshi"),
          look: "loupe",
          during: [{ pause: 4200 }, { click: inRow("mark-paid-btn-", "Kavita Joshi") }, { fx: { type: "stamp", text: "Paid", tone: "green", at: row("Kavita Joshi") } }],
          hold: 1400,
          say: {
            en: "Kavita Joshi took medicines on credit here. When she pays, one tap on the tick marks the bill paid.",
            hi: "Kavita Joshi ने यहाँ उधार पर दवाइयाँ ली थीं। जब वह पैसे दे दें, तो tick पर एक tap से bill paid हो जाता है।",
          },
        },
      ],
    },
    {
      id: "customer",
      title: { en: "A new bill: customer and doctor", hi: "नया bill: ग्राहक और doctor" },
      beats: [
        {
          id: "start",
          before: [{ scrollTop: true }],
          focus: '[data-testid="new-bill-btn"]',
          during: [{ pause: 3500 }, { click: '[data-testid="new-bill-btn"]' }, { wait: '[data-testid="new-bill-form"]' }],
          say: {
            en: "Now the main part. Let's make a bill for Ramesh Kumar, who has a prescription from Dr. Anil Mehta. I'll press New Bill.",
            hi: "अब असली काम। Ramesh Kumar का bill बनाते हैं, जिनके पास Dr. Anil Mehta का prescription है। मैं New Bill दबाती हूँ।",
          },
        },
        {
          id: "date",
          focus: '[data-guide="bill-date"]',
          say: {
            en: "The strip on top says who the bill is for. Billing Date is today by default. Change it only when you're entering an older bill.",
            hi: "ऊपर की पट्टी बताती है कि bill किसका है। Billing Date अपने आप आज की होती है। इसे सिर्फ़ तब बदलिए जब कोई पुराना bill डाल रहे हों।",
          },
        },
        {
          id: "customer-type",
          focus: '[data-testid="customer-search"]',
          during: [{ pause: 2500 }, { type: "Ram", into: '[data-testid="customer-search"]' }, { wait: '[data-testid="customer-dropdown"]' }, { focusOn: [{ union: '[data-testid="customer-search"]' }, { union: '[data-testid="customer-dropdown"]' }] }],
          say: {
            en: "Customer Name. Start typing and your saved customers appear with their mobile numbers. A new name is fine too: keep typing, choose New Customer, and it's saved with the bill. For a quick counter sale, leave it empty and press Tab to make it Walk-in.",
            hi: "Customer Name. नाम लिखना शुरू कीजिए, आपके saved ग्राहक mobile number के साथ दिखेंगे। नया नाम भी चलेगा: लिखते रहिए, New Customer चुनिए, और वह bill के साथ सेव हो जाएगा। काउंटर की छोटी बिक्री के लिए इसे खाली छोड़कर Tab दबाइए, Walk-in बन जाएगा।",
          },
        },
        {
          id: "customer-pick",
          focus: { sel: '[data-testid="customer-dropdown"] *', text: "Ramesh Kumar" },
          during: [{ pause: 800 }, { click: { sel: '[data-testid="customer-dropdown"] *', text: "Ramesh Kumar" } }],
          after: [{ wait: '[data-guide="customer-stats"]' }],
          say: {
            en: "I'll pick Ramesh Kumar, and his mobile number fills itself in.",
            hi: "मैं Ramesh Kumar चुनती हूँ, उनका mobile number अपने आप भर जाता है।",
          },
        },
        {
          id: "customer-stats",
          focus: '[data-guide="customer-stats"]',
          fx: { type: "chips", items: [{ label: "Debt", value: { en: "owes you", hi: "उधार बाकी" }, tone: "rose" }, { label: "Adv", value: { en: "paid ahead", hi: "पहले दिया" }, tone: "green" }, { label: "Bills", value: { en: "so far", hi: "अब तक" }, tone: "ink" }] },
          say: {
            en: "Straight away you see his account. Debt is money he still owes you, Adv is advance he has paid, and Bills is how many bills he has. The Profile link next to his name opens his full history.",
            hi: "तुरंत उनका हिसाब दिख जाता है। Debt यानी उन पर कितना उधार बाकी है, Adv यानी उन्होंने कितना advance दिया है, और Bills यानी अब तक कितने bills बने। नाम के पास वाला Profile link उनकी पूरी history खोलता है।",
          },
        },
        {
          id: "mobile",
          focus: [{ union: '[data-testid="customer-mobile"]' }, { union: { sel: 'input[type="email"]', within: '[data-testid="new-bill-form"]' } }],
          say: {
            en: "Mobile is needed, so the bill can go out on WhatsApp and reminders reach the right person. Email is optional.",
            hi: "Mobile ज़रूरी है, ताकि bill WhatsApp पर भेजा जा सके और reminder सही इंसान तक पहुँचे। Email डालना ज़रूरी नहीं है।",
          },
        },
        {
          id: "doctor",
          focus: '[data-testid="doctor-search"]',
          during: [
            { pause: 1500 },
            { type: "Mehta", into: '[data-testid="doctor-search"]' },
            { wait: { sel: "p", text: "Dr. Anil Mehta" } },
            { focusOn: [{ union: '[data-testid="doctor-search"]' }, { union: { sel: "p", text: "Dr. Anil Mehta", closest: ".absolute" } }] },
            { pause: 5200 },
            { click: { sel: "p", text: "Dr. Anil Mehta" } },
          ],
          say: {
            en: "Doctor is the one who wrote the prescription. Type a name and pick from the list. Verified doctors come from the medical register with their registration number. My Doctor means one you added yourself.",
            hi: "Doctor यानी जिन्होंने prescription लिखा है। नाम लिखिए और list से चुनिए। Verified वाले doctors medical register से आते हैं, registration number के साथ। My Doctor यानी जिन्हें आपने ख़ुद जोड़ा है।",
          },
        },
        {
          id: "summary",
          focus: '[data-guide="bill-summary"]',
          say: {
            en: "This pill keeps count while you work: how many lines are on the bill, and the total so far.",
            hi: "यह छोटी पट्टी काम करते-करते गिनती रखती है: bill में कितनी lines हैं, और अब तक का total कितना है।",
          },
        },
      ],
    },
    {
      id: "items",
      title: { en: "Adding medicines", hi: "दवाइयाँ जोड़ना" },
      beats: [
        {
          id: "table",
          focus: '[data-guide="bill-items"]',
          look: "wide",
          say: {
            en: "Medicines go in this table, one row each: product, salt, batch, stock available, quantity, cost, MRP, discount, the two parts of GST, and the line total.",
            hi: "दवाइयाँ इस table में आती हैं, हर दवा की एक row: product, salt, batch, कितना stock है, quantity, cost, MRP, discount, GST के दो हिस्से, और line का total।",
          },
        },
        {
          id: "product-type",
          focus: '[data-testid="item-product-0"]',
          during: [{ pause: 1800 }, { type: "dolo", into: '[data-testid="item-product-0"]' }, { wait: { sel: '[data-testid="suggestion-row"]', text: "Dolo 650" } }],
          say: {
            en: "In Product, type a few letters of the medicine, or of its salt. I'll type dolo.",
            hi: "Product में दवा के या उसके salt के कुछ अक्षर लिखिए। मैं dolo लिखती हूँ।",
          },
        },
        {
          id: "suggestions",
          focus: sugg,
          look: "wide",
          during: [{ pause: 9500 }, { click: { sel: '[data-testid="suggestion-row"]', text: "Dolo 650" } }],
          say: {
            en: "Your stock appears instantly, with salt, units left and the nearest expiry. The chips on top filter the list. The info button shows full details and cheaper alternatives. And if a medicine isn't in stock, you can still add it as a manual item.",
            hi: "आपका stock तुरंत दिखता है, salt, बचे हुए units और सबसे नज़दीकी expiry के साथ। ऊपर के chips से list छाँट सकते हैं। Info बटन पूरी जानकारी और सस्ते विकल्प दिखाता है। और अगर दवा stock में न हो, तो भी उसे manual item बनाकर जोड़ सकते हैं।",
          },
        },
        {
          id: "batch",
          before: [{ wait: { sel: "button", text: "DL24091", within: popper } }],
          focus: popper,
          during: [{ pause: 8500 }, { click: { sel: "button", text: "DL24091", within: popper } }, { gone: popper }],
          say: {
            en: "Dolo has two batches, so the batch picker opens by itself, with each batch's expiry, stock and supplier. Near Expiry puts the soonest to expire on top, so old stock goes first. I'll take batch DL24091.",
            hi: "Dolo के दो batches हैं, इसलिए batch picker अपने आप खुलता है, हर batch की expiry, stock और supplier के साथ। Near Expiry से जल्दी expire होने वाला batch ऊपर आता है, ताकि पुराना माल पहले निकले। मैं batch DL24091 लेती हूँ।",
          },
        },
        {
          id: "salt-stock",
          focus: [{ union: nth("salt", 0) }, { union: nth("avail", 0) }],
          say: {
            en: "The salt and the stock fill in: 145 tablets of this batch are available.",
            hi: "Salt और stock अपने आप भर गए: इस batch की 145 tablets मौजूद हैं।",
          },
        },
        {
          id: "qty",
          focus: nth("qty", 0),
          during: [{ pause: 2600 }, { type: "10", into: nth("qty", 0) }],
          say: {
            en: "Quantity is in units, here tablets. Ramesh needs 10.",
            hi: "Quantity units में होती है, यहाँ tablets में। Ramesh को 10 चाहिए।",
          },
        },
        {
          id: "pack",
          focus: nth("pack", 0),
          look: "loupe",
          say: {
            en: "Tick Pack to sell a full strip in one go. For Dolo that's 15 tablets. We'll use it on the next medicine.",
            hi: "पूरी strip देनी हो तो Pack पर tick कीजिए। Dolo की एक strip में 15 tablets हैं। अगली दवा में हम इसे इस्तेमाल करेंगे।",
          },
        },
        {
          id: "price",
          focus: [{ union: nth("cost", 0) }, { union: nth("mrp", 0) }],
          fx: { type: "equation", parts: ["₹2.13", "×", "10", "=", "₹21.30"], delay: 3500 },
          say: {
            en: "Cost per unit is what you paid, shown so you always know your margin. MRP per unit is the selling price. It comes from the batch, and you can change it. 2 rupees 13 times 10 makes 21 rupees 30.",
            hi: "Cost per unit वह है जो आपने ख़रीद में दिया, ताकि आपको हमेशा अपना margin पता रहे। MRP per unit बेचने का दाम है। यह batch से आता है, और आप इसे बदल भी सकते हैं। 2 रुपये 13 पैसे गुणा 10, यानी 21 रुपये 30 पैसे।",
          },
        },
        {
          id: "discount",
          focus: nth("disc", 0),
          during: [{ pause: 1800 }, { type: "10", into: nth("disc", 0) }],
          fx: { type: "equation", parts: ["₹21.30", "−", "10%", "=", "₹19.17"], delay: 2600 },
          say: {
            en: "Disc is a discount on this line only. 10 percent brings it to 19 rupees 17.",
            hi: "Disc सिर्फ़ इस line का discount है। 10 percent देने पर यह 19 रुपये 17 पैसे हो जाता है।",
          },
        },
        {
          id: "gst",
          focus: [{ union: nth("cgst", 0) }, { union: nth("sgst", 0) }],
          fx: { type: "split", from: "GST 12%", into: ["CGST 6%", "SGST 6%"] },
          say: {
            en: "CGST and SGST are the two halves of GST, filled in from the batch. MRP already includes GST, so the tax sits inside the price. You'll rarely need to touch these.",
            hi: "CGST और SGST, GST के दो आधे हिस्से हैं, जो batch से अपने आप भरते हैं। MRP में GST पहले से शामिल है, यानी tax दाम के अंदर ही है। इन्हें छूने की ज़रूरत कम ही पड़ती है।",
          },
        },
        {
          id: "line-total",
          focus: [{ union: nth("line-total", 0) }, { union: nth("remove-line", 0) }],
          say: {
            en: "Total is the final amount for this line, and the bin removes the row.",
            hi: "Total इस line की आख़िरी रकम है, और कूड़ेदान वाला बटन row हटा देता है।",
          },
        },
        {
          id: "add-item",
          focus: '[data-testid="add-item-btn"]',
          fx: { type: "keys", combo: ["Alt", "A"], desktopOnly: true },
          during: [{ pause: 3600 }, { click: '[data-testid="add-item-btn"]' }, { wait: '[data-testid="item-product-1"]' }],
          say: {
            en: "Add Item adds the next row. Alt plus A does it from the keyboard, and pressing Enter on the last field moves you on too.",
            hi: "Add Item से अगली row जुड़ती है। कीबोर्ड पर Alt और A से भी, और आख़िरी field पर Enter दबाने से भी आगे बढ़ जाते हैं।",
          },
        },
        {
          id: "second",
          focus: '[data-testid="item-product-1"]',
          during: pickProduct(1, "pan", "Pan-D", "PD3318"),
          say: {
            en: "Next, Pan-D. Type, pick it, and choose the batch.",
            hi: "अगली दवा, Pan-D. लिखिए, चुनिए, और batch चुन लीजिए।",
          },
        },
        {
          id: "full-pack",
          focus: nth("pack", 1),
          look: "loupe",
          during: [{ pause: 2400 }, { click: { sel: '[data-guide="pack"] input', nth: 1 } }, { focusOn: [{ union: nth("qty", 1) }, { union: nth("pack", 1) }] }],
          say: {
            en: "Ramesh takes one full strip, so I tick Pack, and the quantity becomes 15 by itself.",
            hi: "Ramesh पूरी एक strip लेंगे, इसलिए मैं Pack पर tick करती हूँ, और quantity अपने आप 15 हो जाती है।",
          },
        },
        {
          id: "negative",
          before: [
            { click: '[data-testid="add-item-btn"]' },
            { wait: '[data-testid="item-product-2"]' },
            ...pickProduct(2, "okacet", "Okacet", "OK1209"),
            { type: "10", into: nth("qty", 2) },
          ],
          focus: '[data-guide="avail-neg"]',
          say: {
            en: "One more: Okacet. We have only 8 in stock, and he wants 10. The row turns amber: 8 come from stock and 2 are billed in negative, meaning you're selling stock you'll buy later.",
            hi: "एक और: Okacet. Stock में सिर्फ़ 8 हैं, और उन्हें 10 चाहिए। Row पीली हो जाती है: 8 stock से गईं और 2 negative में billed हुईं, यानी जो माल आप बाद में ख़रीदेंगे, वह पहले बिक गया।",
          },
        },
        {
          id: "negative-alert",
          focus: { text: "Negative Billing Alert", closest: "div" },
          say: {
            en: "The alert below sums it up, so you remember to reorder Okacet.",
            hi: "नीचे का alert यही बताता है, ताकि आप Okacet दोबारा मँगवाना न भूलें।",
          },
        },
        {
          id: "scan-buttons",
          focus: [{ union: '[data-testid="scan-for-bill-btn"]' }, { union: '[data-testid="scan-item-qr-btn"]' }],
          fx: { type: "scan" },
          say: {
            en: "Two more ways to add items. Scan for Bill reads a prescription or a list with the camera, and Scan item QR reads the QR label you printed for a pack in Purchases.",
            hi: "Items जोड़ने के दो और तरीके। Scan for Bill camera से prescription या पर्ची पढ़ता है, और Scan item QR उस QR label को पढ़ता है जो आपने Purchases में pack के लिए print किया था।",
          },
        },
        {
          id: "keys",
          focus: '[data-guide="bill-tip"]',
          phone: { skip: true },
          fx: { type: "keys", combo: ["Ctrl", "Enter"], label: "save" },
          say: {
            en: "And the keys to remember: Enter moves to the next field, Alt A adds a row, and Control Enter saves the bill.",
            hi: "और ये keys याद रखिए: Enter से अगला field, Alt A से नई row, और Control Enter से bill सेव।",
          },
        },
      ],
    },
    {
      id: "totals",
      title: { en: "Discount and total", hi: "Discount और total" },
      beats: [
        {
          id: "subtotal",
          focus: '[data-guide="bill-totals"]',
          say: {
            en: "On the right are the totals. Subtotal is all the lines added together.",
            hi: "दाईं तरफ़ totals हैं। Subtotal यानी सारी lines का जोड़।",
          },
        },
        {
          id: "bill-discount",
          focus: '[data-guide="bill-discount"]',
          during: [{ pause: 2800 }, { type: "2", into: '[data-guide="bill-discount"]' }],
          say: {
            en: "Bill Discount takes a percentage off the whole bill, on top of any line discounts. I'll give 2 percent.",
            hi: "Bill Discount पूरे bill पर percent में छूट देता है, line वाले discount के ऊपर से। मैं 2 percent देती हूँ।",
          },
        },
        {
          id: "grand-total",
          focus: '[data-guide="grand-total"]',
          during: [
            { pause: 3800 },
            {
              run: async ({ find, type }) => {
                const el = find('[data-guide="grand-total"]');
                const v = parseFloat(el?.value || "0");
                if (el && v > 10) type(el, String(Math.floor(v / 5) * 5));
              },
            },
            { fx: { type: "count", toFrom: '[data-guide="grand-total"]', prefix: "₹", label: "Grand Total" } },
          ],
          say: {
            en: "Or type the amount you want to charge straight into Grand Total. Say you round it down: the discount adjusts itself to match.",
            hi: "या जो रकम लेनी है, वह सीधे Grand Total में लिख दीजिए। मान लीजिए आपने रकम round कर दी: discount अपने आप उसी हिसाब से बदल जाता है।",
          },
        },
        {
          id: "profit",
          focus: '[data-guide="bill-profit"]',
          look: "loupe",
          fx: { type: "rings" },
          say: {
            en: "Estimated Profit is what you earn on this bill after cost and discounts. It's for you, not for the customer.",
            hi: "Estimated Profit बताता है कि cost और discount के बाद इस bill पर आपको कितना मिला। यह आपके लिए है, ग्राहक के लिए नहीं।",
          },
        },
      ],
    },
    {
      id: "payment",
      title: { en: "Payment", hi: "Payment" },
      beats: [
        {
          id: "paid",
          focus: { sel: "#isPaid", closest: "div" },
          look: "loupe",
          say: {
            en: "Paid is ticked by default: the customer pays the full amount now.",
            hi: "Paid पहले से tick रहता है: यानी ग्राहक अभी पूरे पैसे दे रहा है।",
          },
        },
        {
          id: "advance",
          before: [{ check: false, target: "#isPaid" }, { check: true, target: "#isAdvancePaid" }],
          focus: [{ union: { sel: "#isAdvancePaid", closest: "div" } }, { union: 'input[placeholder="Advance Amount *"]' }],
          during: [{ pause: 2200 }, { type: "100", into: 'input[placeholder="Advance Amount *"]' }],
          after: [{ check: false, target: "#isAdvancePaid" }],
          say: {
            en: "Advance Paid is for orders. The customer pays part now, say 100 rupees, and the rest when the medicines are handed over. You record the rest later, right from the bill.",
            hi: "Advance Paid orders के लिए है। ग्राहक अभी कुछ पैसे देता है, मान लीजिए 100 रुपये, और बाकी दवा मिलने पर। बाकी रकम बाद में उसी bill से दर्ज कर लेते हैं।",
          },
        },
        {
          id: "udhar",
          before: [{ check: true, target: "#isCredit" }],
          focus: [{ union: { sel: "#isCredit", closest: "div" } }, { union: '[data-testid="udhar-amount"]' }],
          during: [{ pause: 2500 }, { type: "100", into: '[data-testid="paid-now"]' }, { fx: { type: "stamp", text: "Udhar", tone: "rose", at: '[data-testid="udhar-amount"]' } }],
          after: [{ pause: 600 }, { check: false, target: "#isCredit" }],
          say: {
            en: "Udhar, or credit, is for regular customers who pay later. Enter what they pay now. The rest is added to their dues automatically, and shows up in their account.",
            hi: "Udhar यानी credit, उन पक्के ग्राहकों के लिए जो बाद में पैसे देते हैं। अभी जितना दे रहे हैं वह लिखिए। बाकी रकम अपने आप उनके उधार में जुड़ जाती है, और उनके खाते में दिखती है।",
          },
        },
        {
          id: "mode",
          focus: '[data-guide="payment-mode"]',
          during: [{ pause: 2800 }, { select: "UPI", trigger: '[data-guide="payment-mode"]', exact: true }],
          say: {
            en: "Payment Mode records how they paid: Cash, UPI or Card, so you always know where the money came in. Ramesh pays by UPI.",
            hi: "Payment Mode में लिखते हैं कि पैसे कैसे मिले: Cash, UPI या Card, ताकि हमेशा पता रहे कि पैसा कहाँ से आया। Ramesh UPI से दे रहे हैं।",
          },
        },
        {
          id: "refill",
          focus: '[data-guide="refill"]',
          during: [{ pause: 2500 }, { check: true, target: "#enable-refill-reminder" }, { wait: '[data-testid="refill-card"]' }],
          say: {
            en: "Patient Refill Reminder. For medicines taken every day, tell the app the dose and it works out when they'll run out.",
            hi: "Patient Refill Reminder. रोज़ ली जाने वाली दवाइयों के लिए dose बताइए, और app हिसाब लगा लेगा कि दवा कब ख़त्म होगी।",
          },
        },
        {
          id: "dose",
          focus: '[data-testid="refill-card"]',
          look: "wide",
          during: [{ pause: 2200 }, { click: { sel: "button", text: "2", exact: true, within: '[data-testid="refill-card"]' } }],
          say: {
            en: "Ramesh takes Dolo twice a day, so 10 tablets last 5 days. Pick a dose for each medicine, untick any that don't need a reminder, and set how much to restock.",
            hi: "Ramesh दिन में दो बार Dolo लेते हैं, तो 10 tablets 5 दिन चलेंगी। हर दवा का dose चुनिए, जिसका reminder नहीं चाहिए उसका tick हटाइए, और कितना restock करना है वह लिखिए।",
          },
        },
        {
          id: "remind",
          focus: { sel: "div", text: "Remind me", within: '[data-testid="refill-card"]', closest: ".rounded-xl" },
          during: [{ pause: 2600 }, { click: { sel: "button", text: "1 day before", within: '[data-testid="refill-card"]' } }],
          say: {
            en: "Then choose when to be reminded: on the day, or a few days before. That day you get a reminder, and tapping it opens a purchase ready to restock, so the medicine is waiting when Ramesh comes back.",
            hi: "फिर चुनिए कि याद कब दिलाया जाए: उसी दिन, या कुछ दिन पहले। उस दिन आपको reminder मिलेगा, और उस पर tap करते ही restock के लिए purchase तैयार खुलेगी, ताकि Ramesh के लौटने पर दवा तैयार मिले।",
          },
        },
      ],
    },
    {
      id: "save",
      title: { en: "Saving the bill", hi: "Bill सेव करना" },
      beats: [
        {
          id: "bar",
          focus: '[data-guide="bill-bar"]',
          say: {
            en: "The bar at the bottom saves the bill. Its tabs keep several bills open at once: if a second customer walks in, press New Tab, bill them, and come back to this one.",
            hi: "नीचे की bar से bill सेव होता है। इसके tabs में एक साथ कई bills खुले रह सकते हैं: दूसरा ग्राहक आ जाए तो New Tab दबाइए, उसका bill बनाइए, और फिर इस bill पर लौट आइए।",
          },
        },
        {
          id: "cancel",
          focus: { sel: "button", text: "Cancel", within: '[data-guide="bill-bar"]' },
          look: "loupe",
          say: {
            en: "Cancel, or the Escape key, throws this bill away.",
            hi: "Cancel, या Escape key, इस bill को छोड़ देता है।",
          },
        },
        {
          id: "create",
          focus: '[data-shortcut="save"]',
          fx: [{ type: "keys", combo: ["Ctrl", "Enter"], desktopOnly: true }, { type: "rings" }],
          during: [{ pause: 5800 }, { click: '[data-shortcut="save"]' }, { wait: '[role="alertdialog"]' }],
          say: {
            en: "Create Bill saves it. Control plus Enter works too, or Command plus Enter on a Mac. The stock goes down the moment it's saved.",
            hi: "Create Bill से bill सेव होता है। Control और Enter से भी, Mac पर Command और Enter से। सेव होते ही stock कम हो जाता है।",
          },
        },
        {
          id: "pdf",
          focus: '[role="alertdialog"]',
          look: "wide",
          fx: { type: "receipt", title: "TAX INVOICE", lines: [["Dolo 650 ×10", "₹19.17"], ["Pan-D ×15", "₹199.05"], ["Okacet 10 ×10", "₹19.90"]], total: "UPI ✓", side: "right", delay: 2500 },
          during: [{ pause: 4500 }, { click: { sel: "button", text: "Receipt 80mm", within: '[role="alertdialog"]' } }],
          say: {
            en: "Saved! Now it offers the printout. Pick the paper: A4, A5, or a thermal receipt roll of 80 or 58 millimetres. With UPI QR prints a code the customer can scan to pay. Generate PDF opens it to print or share.",
            hi: "सेव हो गया! अब printout का विकल्प आता है। Paper चुनिए: A4, A5, या thermal receipt की 80 या 58 millimetre वाली roll। With UPI QR से bill पर code छपता है, जिसे scan करके ग्राहक पैसे दे सकता है। Generate PDF से bill print या share के लिए खुलता है।",
          },
        },
        {
          id: "saved",
          before: [{ click: { sel: "button", text: "Skip", within: '[role="alertdialog"]' } }, { gone: '[role="alertdialog"]' }, { wait: row("INV-1046") }, { scrollTop: true }],
          focus: row("INV-1046"),
          fx: [
            { type: "stamp", text: "New", tone: "orange" },
            { type: "chips", delay: 3200, items: [{ label: "Dolo 650", value: "145 → 135", tone: "ink" }, { label: "Pan-D", value: "90 → 75", tone: "ink" }, { label: "Okacet 10", value: "8 → 0", tone: "rose" }] },
          ],
          say: {
            en: "I'll skip the printout for now. And there's our new bill, right on top. Look at the stock too: Dolo went from 145 to 135, Pan-D from 90 to 75, and Okacet down to zero.",
            hi: "अभी printout छोड़ देती हूँ। और ये रहा हमारा नया bill, सबसे ऊपर। Stock भी देखिए: Dolo 145 से 135, Pan-D 90 से 75, और Okacet शून्य पर।",
          },
        },
      ],
    },
    {
      id: "after",
      title: { en: "After the bill", hi: "Bill के बाद" },
      beats: [
        {
          id: "whatsapp",
          focus: inRow("whatsapp-bill-", "INV-1046"),
          look: "loupe",
          say: {
            en: "WhatsApp sends this bill to Ramesh's number as a link he can open and download. No printing needed.",
            hi: "WhatsApp यह bill Ramesh के number पर link बनाकर भेजता है, जिसे वह खोलकर download कर सकते हैं। Print की ज़रूरत ही नहीं।",
          },
        },
        {
          id: "edit",
          before: [{ click: inRow("edit-bill-", "INV-1046") }, { wait: '[data-testid="edit-bill-form"]' }, { scrollTop: true }],
          focus: { sel: '[data-testid="edit-bill-form"] > div' },
          say: {
            en: "Made a mistake? Edit opens the bill again. The amber border means you're changing a saved bill. Fix anything, add notes or a due date, then press Update Bill.",
            hi: "कोई गलती हो गई? Edit से bill फिर खुल जाता है। पीली border का मतलब है कि आप सेव हुआ bill बदल रहे हैं। जो ठीक करना है कीजिए, notes या due date डालिए, फिर Update Bill दबाइए।",
          },
          after: [{ click: { sel: "button", text: "Cancel", within: '[data-guide="bill-bar"]' } }, { gone: '[data-testid="edit-bill-form"]' }],
        },
        {
          id: "record-payment",
          before: [{ scrollTop: true }, { click: row("INV-1041") }, { wait: { sel: "button", text: "Record Payment" } }],
          focus: { sel: "button", text: "Record Payment", closest: ".rounded-xl" },
          during: [
            { pause: 4200 },
            { click: { sel: "button", text: "Record Payment" } },
            { wait: '[role="alertdialog"]' },
            { focusOn: '[role="alertdialog"]' },
            { pause: 3200 },
            { select: "UPI", trigger: { sel: 'button[role="combobox"]', within: '[role="alertdialog"]' }, exact: true },
            { click: { sel: "button", text: "Record Payment", within: '[role="alertdialog"]', last: true } },
            { gone: '[role="alertdialog"]' },
            { fx: { type: "stamp", text: "Paid", tone: "green", at: row("INV-1041") } },
          ],
          hold: 1200,
          say: {
            en: "For an advance bill, open the row to see what's still due. When the customer comes back, Record Payment takes the balance. It fills in the remaining amount; choose how they paid, and save.",
            hi: "Advance bill की row खोलिए, कितना बाकी है दिख जाएगा। ग्राहक लौटे तो Record Payment से बाकी रकम लीजिए। रकम अपने आप भरी होती है; बस चुनिए कि पैसे कैसे दिए, और सेव कीजिए।",
          },
        },
        {
          id: "delete",
          before: [{ click: row("INV-1041") }, { scrollTop: true }, { click: inRow("delete-bill-btn-", "INV-1046") }, { wait: '[role="alertdialog"]' }],
          focus: '[role="alertdialog"]',
          during: [{ pause: 9800 }, { click: { sel: "button", text: "Cancel", within: '[role="alertdialog"]' } }],
          say: {
            en: "Delete always asks first. Delete Only removes the bill. Delete and Restore Inventory also puts the medicines back in stock, which is what you want when a sale is cancelled. I'll press Cancel; we're keeping this one.",
            hi: "Delete हमेशा पहले पूछता है। Delete Only सिर्फ़ bill हटाता है। Delete & Restore Inventory दवाइयाँ भी वापस stock में डाल देता है, जो sale cancel होने पर सही है। मैं Cancel दबाती हूँ, यह bill हमें रखना है।",
          },
        },
        {
          id: "finale",
          focus: null,
          look: "wide",
          fx: { type: "title", text: { en: "You're ready to bill", hi: "अब आप bill बना सकते हैं" }, sub: { en: "Customer → Medicines → Discount → Payment → Create Bill", hi: "ग्राहक → दवाइयाँ → Discount → Payment → Create Bill" } },
          say: {
            en: "That's Billing from start to finish. Close the tour and try it on your own data, or replay any chapter from the bar.",
            hi: "यह थी Billing, शुरू से आख़िर तक। टूर बंद कीजिए और अपने डेटा पर ख़ुद आज़माइए, या bar से कोई भी chapter दोबारा देखिए।",
          },
        },
      ],
    },
  ],
};
