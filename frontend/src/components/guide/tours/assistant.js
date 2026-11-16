// Guided tour: the AI assistant. Format: see ./README.md.
// No imports here: the audio script reads this file on its own.
// In demo mode the assistant's replies are scripted from the demo pharmacy
// (sandbox/assistantDemo.js), so no AI is called and no credits are used.

const box = '[data-guide="ai-composer"] textarea';
const send = 'button[title="Send"]';
const lastMsg = { sel: "main .space-y-6 > div", last: true };
const inLast = (sel, text) => ({ sel, text, within: lastMsg });
const ask = (text, until) => [
  { type: text, into: box, cps: 22 },
  { pause: 500 },
  { click: send },
  { wait: until, timeout: 15000 },
  { pause: 600 },
];
const PURCHASE = "Shree Ganesh se Dolo 650 ki 10 strip purchase chadha do, batch DL25110, expiry 09/28, rate 21.30";
const MEDI = "Azithromycin kab nahi leni chahiye?";

export default {
  id: "assistant",
  route: "/assistant",
  ready: box,
  title: { en: "AI Assistant", hi: "AI असिस्टेंट" },
  next: null,
  outro: {
    en: "Close the tour and ask your first question, in Hindi, English or Hinglish.",
    hi: "टूर बंद कीजिए और अपना पहला सवाल पूछिए, हिंदी, English या Hinglish में।",
  },
  chapters: [
    {
      id: "meet",
      title: { en: "Meet your assistant", hi: "आपका AI असिस्टेंट" },
      beats: [
        {
          id: "welcome",
          focus: null,
          look: "wide",
          fx: { type: "title", text: { en: "Your AI co-pilot", hi: "आपका AI साथी" }, sub: { en: "Ask · Find · Create · Check", hi: "पूछिए · ढूँढिए · बनाइए · जाँचिए" } },
          say: {
            en: "This is your AI assistant, and the one who has been guiding you. Ask it anything about your pharmacy, in Hindi, English or Hinglish, by typing or speaking. It finds your data, makes bills and purchases for you, and answers medicine questions.",
            hi: "यह आपका AI असिस्टेंट है, वही जो आपको यह टूर करा रहा है। अपनी pharmacy के बारे में कुछ भी पूछिए, हिंदी, English या Hinglish में, लिखकर या बोलकर। यह आपका डेटा ढूँढता है, आपके लिए bills और purchases बनाता है, और दवाइयों के सवालों का जवाब देता है।",
          },
        },
        {
          id: "suggestions",
          focus: '[data-guide="ai-suggestions"]',
          look: "wide",
          say: {
            en: "A new chat starts with ideas to try. Each card is one of its specialists: purchase, billing, stock, customers, suppliers, the medicine expert, and a business overview. Tap a card to ask it.",
            hi: "नई chat कुछ सुझावों से शुरू होती है। हर card इसका एक specialist है: purchase, billing, stock, customers, suppliers, medicine expert, और business overview. Card पर tap कीजिए, सवाल पूछ लिया जाएगा।",
          },
        },
        {
          id: "sidebar",
          focus: '[data-guide="ai-sidebar"]',
          phone: { focus: '[aria-label="Chats"]', look: "loupe" },
          say: {
            en: "Your chats are kept on the side: New chat starts fresh, and you can search old chats. Chats are kept for 30 days, then deleted automatically.",
            hi: "आपकी chats साइड में रहती हैं: New chat से नई शुरुआत, और पुरानी chats search कर सकते हैं। Chats 30 दिन रहती हैं, फिर अपने आप हट जाती हैं।",
          },
        },
        {
          id: "engine",
          optional: true,
          focus: 'header [role="status"]',
          say: {
            en: "This shows which AI engine is answering. It's picked automatically for each task, a quick one for simple questions and a stronger one for harder work.",
            hi: "यह दिखाता है कि कौन सा AI engine जवाब दे रहा है। हर काम के लिए यह अपने आप चुना जाता है: आसान सवाल के लिए तेज़ वाला, मुश्किल काम के लिए ताक़तवर वाला।",
          },
        },
        {
          id: "credits",
          optional: true,
          focus: 'header button[title="AI credits"]',
          look: "loupe",
          say: {
            en: "AI credits pay for answers, photos and spoken replies. Tap here to see your balance, what each answer cost, and to buy more.",
            hi: "AI credits से जवाब, photos और आवाज़ वाले जवाब चलते हैं। यहाँ tap करके balance, हर जवाब का ख़र्च देखिए, और और credits ख़रीदिए।",
          },
        },
        {
          id: "composer",
          focus: '[data-guide="ai-composer"]',
          say: {
            en: "This is where you ask. Type your question and press Enter, or the send arrow.",
            hi: "यहाँ सवाल पूछते हैं। सवाल लिखिए और Enter दबाइए, या send वाला तीर।",
          },
        },
        {
          id: "attach",
          focus: 'button[title="Attach photo (invoice or medicine pack)"]',
          look: "loupe",
          fx: { type: "scan", at: '[data-guide="ai-composer"]' },
          say: {
            en: "The clip adds photos: a supplier's invoice, a prescription, or a medicine pack. Then just say what to do, like: iski purchase chadha do.",
            hi: "Clip से photo जोड़िए: supplier का invoice, prescription, या दवा का pack. फिर बस बताइए क्या करना है, जैसे: इसकी purchase चढ़ा दो।",
          },
        },
        {
          id: "voice",
          optional: 'button[aria-label="Start voice typing"]',
          focus: [{ union: 'button[aria-label="Voice typing script"]' }, { union: 'button[aria-label="Start voice typing"]' }],
          say: {
            en: "The mic is voice typing. The button beside it picks the script: Hindi letters, or Hinglish and English in Roman letters. Speak, check the text, then send. Ask by voice, and the answer is read out to you too.",
            hi: "Mic से बोलकर लिखते हैं। उसके पास वाला बटन लिपि चुनता है: हिंदी अक्षर, या Hinglish और English रोमन अक्षरों में। बोलिए, text देख लीजिए, फिर भेजिए। आवाज़ से पूछेंगे, तो जवाब भी बोलकर सुनाया जाएगा।",
          },
        },
        {
          id: "hints",
          focus: '[data-guide="ai-hints"]',
          say: {
            en: "And remember this line: nothing is saved until you confirm it on a card. The assistant prepares, you decide.",
            hi: "और यह line याद रखिए: जब तक आप card पर confirm न करें, कुछ भी सेव नहीं होता। असिस्टेंट तैयार करता है, फ़ैसला आपका।",
          },
        },
      ],
    },
    {
      id: "ask",
      title: { en: "Ask about your business", hi: "अपने business के बारे में पूछिए" },
      beats: [
        {
          id: "sales-ask",
          focus: { sel: '[data-guide="ai-suggestions"] button', text: "Aaj ki sale" },
          during: [{ pause: 2400 }, { click: { sel: '[data-guide="ai-suggestions"] button', text: "Aaj ki sale" } }, { wait: { sel: "button", text: "Chart" }, timeout: 15000 }, { pause: 500 }],
          say: {
            en: "Let's ask how today went. I'll tap Today's sales. Watch the reply: it names the specialist handling it, shows what it's doing, and then builds the answer.",
            hi: "पूछते हैं कि आज कैसा रहा। मैं Today's sales पर tap करती हूँ। जवाब देखिए: पहले बताता है कौन सा specialist काम कर रहा है, क्या कर रहा है, फिर जवाब बनाता है।",
          },
        },
        {
          id: "stats",
          focus: { sel: ".grid", within: lastMsg, closest: ".rounded-2xl" },
          say: {
            en: "Numbers come as tiles: today's sale, how many bills, the profit and its margin, and money still owed. All from your own billing data.",
            hi: "आँकड़े tiles में आते हैं: आज की बिक्री, कितने bills, मुनाफ़ा और margin, और कितना पैसा बाकी है। सब आपके अपने billing डेटा से।",
          },
        },
        {
          id: "table",
          focus: { sel: "table", within: lastMsg, closest: ".rounded-2xl" },
          during: [{ pause: 4200 }, { click: inLast("button", "Chart") }, { pause: 2600 }, { click: inLast("button", "Table") }],
          say: {
            en: "Lists come as tables. Chart turns them into a graph, and Open jumps to that page in the app with the same records.",
            hi: "Lists table में आती हैं। Chart से graph बन जाता है, और Open से app का वही पेज उन्हीं records के साथ खुल जाता है।",
          },
        },
        {
          id: "answer-tools",
          focus: [{ union: inLast('button[title="Copy"]') }, { union: inLast('button[title="Bad answer"]') }],
          look: "loupe",
          fx: { type: "chips", items: [{ label: "Copy", tone: "ink" }, { label: { en: "Read aloud", hi: "सुनिए" }, tone: "violet" }, { label: "👍 👎", tone: "sky" }] },
          say: {
            en: "Under every answer: Copy, Read aloud, and thumbs up or down. Your thumbs help it answer better next time.",
            hi: "हर जवाब के नीचे: Copy, Read aloud, और thumbs up या down. आपके thumbs से अगली बार बेहतर जवाब मिलता है।",
          },
        },
        {
          id: "follow-up",
          focus: inLast("button", "Kin customers ka udhaar"),
          during: [{ pause: 3600 }, { click: inLast("button", "Kin customers ka udhaar") }, { wait: { sel: "p", text: "Udhaar baaki" }, timeout: 15000 }, { pause: 500 }, { focusOn: lastMsg, look: "wide" }],
          say: {
            en: "It also suggests what to ask next. One tap: who still owes us money? And there's the list, with mobile numbers and the total.",
            hi: "यह अगला सवाल भी सुझाता है। एक tap: किन customers का उधार बाकी है? और ये रही list, mobile number और कुल रकम के साथ।",
          },
        },
      ],
    },
    {
      id: "work",
      title: { en: "Let it do the work", hi: "काम इसे सौंपिए" },
      beats: [
        {
          id: "purchase-ask",
          focus: '[data-guide="ai-composer"]',
          during: ask(PURCHASE, { sel: "button", text: "Save purchase" }),
          say: {
            en: "Now real work. I'll type it the way you'd say it: Shree Ganesh se Dolo 650 ki 10 strip purchase chadha do, with the batch, expiry and rate.",
            hi: "अब असली काम। मैं वैसे ही लिखती हूँ जैसे आप बोलते: Shree Ganesh से Dolo 650 की 10 strip purchase चढ़ा दो, batch, expiry और rate के साथ।",
          },
        },
        {
          id: "draft",
          focus: { sel: ".ai-glow-border", within: lastMsg },
          look: "wide",
          say: {
            en: "It builds a draft card: supplier, date and payment on top, the medicine with batch, expiry, quantity, rate and MRP below, and the total. It matched Dolo to your stock and the supplier to your list.",
            hi: "यह draft card बनाता है: ऊपर supplier, तारीख़ और payment, नीचे दवा, batch, expiry, quantity, rate और MRP के साथ, और total. इसने Dolo को आपके stock से और supplier को आपकी list से मिला लिया।",
          },
        },
        {
          id: "draft-missing",
          focus: inLast("span", "Invoice number not given"),
          look: "loupe",
          say: {
            en: "Anything missing is flagged in amber, like the invoice number here. Reply in plain words to fix things, like: qty 12 kar do, or invoice SGP 457.",
            hi: "जो कमी हो, वह पीले रंग में दिखती है, जैसे यहाँ invoice number. सीधे शब्दों में लिखकर ठीक कराइए, जैसे: qty 12 कर दो, या invoice SGP 457.",
          },
        },
        {
          id: "draft-actions",
          focus: { sel: "button", text: "Save purchase", within: lastMsg, closest: ".flex" },
          during: [{ pause: 6200 }, { click: inLast("button", "Save purchase") }, { wait: { sel: "p", text: "Purchase saved" }, timeout: 15000 }, { pause: 400 }, { focusOn: lastMsg }],
          say: {
            en: "You choose: Save purchase adds it to stock now, Save as draft keeps it in Drafts for later, Discard throws it away. I'll save it. Done, 150 tablets are in stock, and Open takes you to the purchase.",
            hi: "फ़ैसला आपका: Save purchase से अभी stock में जुड़ता है, Save as draft से Drafts में बाद के लिए रहता है, Discard से हट जाता है। मैं सेव करती हूँ। हो गया, 150 tablets stock में हैं, और Open से purchase खुल जाती है।",
          },
        },
        {
          id: "bills-too",
          focus: '[data-guide="ai-composer"]',
          say: {
            en: "Bills work the same way: say Ramesh ko Dolo ki ek strip ka bill bana do, and you get a bill card to check and save. It can also show a UPI QR for any amount.",
            hi: "Bills भी ऐसे ही बनते हैं: बोलिए Ramesh को Dolo की एक strip का bill बना दो, और जाँचकर सेव करने के लिए bill card मिल जाएगा। यह किसी भी रकम का UPI QR भी दिखा सकता है।",
          },
        },
      ],
    },
    {
      id: "medi",
      title: { en: "The medicine expert", hi: "Medicine expert" },
      beats: [
        {
          id: "medi-ask",
          focus: '[data-guide="ai-composer"]',
          during: ask(MEDI, { sel: "p", text: "Course poora" }),
          say: {
            en: "Questions about medicines go to the medicine expert. Let's ask: when should azithromycin not be taken?",
            hi: "दवाइयों के सवाल medicine expert के पास जाते हैं। पूछते हैं: azithromycin कब नहीं लेनी चाहिए?",
          },
        },
        {
          id: "medi-answer",
          focus: lastMsg,
          look: "wide",
          say: {
            en: "A clear answer, with the cautions to check at the counter, and a reminder that it's general information: the patient's doctor has the final word.",
            hi: "साफ़ जवाब, काउंटर पर ध्यान रखने वाली सावधानियों के साथ, और याद दिलाता है कि यह आम जानकारी है: आख़िरी बात मरीज़ के doctor की है।",
          },
        },
      ],
    },
    {
      id: "chats",
      title: { en: "Your chats", hi: "आपकी chats" },
      beats: [
        {
          id: "history",
          focus: '[data-guide="ai-sidebar"]',
          phone: { skip: true },
          say: {
            en: "This chat now sits in your list, under Today. Open any old chat to carry on. The three-dot menu on a chat lets you rename it, pin it to the top, or delete it.",
            hi: "यह chat अब आपकी list में Today के नीचे है। कोई भी पुरानी chat खोलकर आगे बात कीजिए। Chat के तीन-बिंदु menu से नाम बदलिए, ऊपर pin कीजिए, या delete कीजिए।",
          },
        },
        {
          id: "finale",
          focus: null,
          look: "wide",
          fx: { type: "title", text: { en: "Just ask", hi: "बस पूछिए" }, sub: { en: "Hindi · English · Hinglish · voice · photos", hi: "हिंदी · English · Hinglish · आवाज़ · photos" } },
          say: {
            en: "That's your AI assistant. Ask about sales, stock, expiry, dues or medicines, or hand it a purchase or a bill. It prepares everything, and you confirm.",
            hi: "यह था आपका AI असिस्टेंट. बिक्री, stock, expiry, उधार या दवाइयों के बारे में पूछिए, या purchase और bill का काम सौंपिए। यह सब तैयार करता है, और आप confirm करते हैं।",
          },
        },
      ],
    },
  ],
};
