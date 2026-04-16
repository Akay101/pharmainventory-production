const fs = require('fs');

const handlePurchases = () => {
  const filePath = 'frontend/src/pages/PurchasesPage.jsx';
  let content = fs.readFileSync(filePath, 'utf8');

  if (!content.includes('import { v4 as uuidv4 } from "uuid";')) {
    content = content.replace(
      'import { useSearchParams } from "react-router-dom";',
      'import { useSearchParams } from "react-router-dom";\nimport { v4 as uuidv4 } from "uuid";'
    );
  }

  if (!content.includes('useAuth } from "../App";')) {
    content = content.replace(
      'import { API } from "../App";',
      'import { API, useAuth } from "../App";'
    );
  }

  if (!content.includes('const [tabs, setTabs]')) {
    content = content.replace(
      'const [submitting, setSubmitting] = useState(false);',
      'const [submitting, setSubmitting] = useState(false);\n  const { user } = useAuth();\n  const [tabs, setTabs] = useState([]);\n  const [activeTabId, setActiveTabId] = useState(null);'
    );
  }

  // Remove local storage logic
  content = content.replace(/const LOCAL_STORAGE_KEY = "pharmalogy_purchase_draft";\n/g, '');

  const oldStorageRegex = /\/\/ ============ AUTO-SAVE TO LOCALSTORAGE ============[^]*?\/\/ ============ CSV UPLOAD ============/m;
  
  const newLogic = `// ============ MULTI-TAB DRAFTS ============
  useEffect(() => {
    if (!user?.id) return;
    const STORAGE_KEY = \`pharmalogy_purchase_drafts_\${user.id}\`;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setTabs(parsed);
          const active = parsed[0];
          setActiveTabId(active.id);
          setSelectedSupplier(active.data.selectedSupplier || "");
          setInvoiceNo(active.data.invoiceNo || "");
          setPurchaseDate(active.data.purchaseDate || new Date().toISOString().slice(0, 10));
          setPurchaseItems(active.data.purchaseItems || []);
          setPaymentStatus(active.data.paymentStatus || "Unpaid");
          setAmountPaid(active.data.amountPaid || "");
        }
      } catch (e) {}
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !activeTabId) return;
    const delay = setTimeout(() => {
      setTabs((prev) => {
        const newTabs = prev.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                data: {
                  selectedSupplier,
                  invoiceNo,
                  purchaseDate,
                  purchaseItems,
                  paymentStatus,
                  amountPaid,
                },
              }
            : t
        );
        localStorage.setItem(
          \`pharmalogy_purchase_drafts_\${user.id}\`,
          JSON.stringify(newTabs)
        );
        return newTabs;
      });
    }, 500);
    return () => clearTimeout(delay);
  }, [
    selectedSupplier,
    invoiceNo,
    purchaseDate,
    purchaseItems,
    paymentStatus,
    amountPaid,
    activeTabId,
    user?.id,
  ]);

  const createNewTab = () => {
    if (tabs.length >= 10) {
      toast.error("Maximum 10 tabs allowed");
      return;
    }
    const newId = uuidv4();
    const newTab = {
      id: newId,
      data: {
        selectedSupplier: "",
        invoiceNo: "",
        purchaseDate: new Date().toISOString().slice(0, 10),
        purchaseItems: [],
        paymentStatus: "Unpaid",
        amountPaid: "",
      },
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setSelectedSupplier("");
    setInvoiceNo("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseItems([]);
    setPaymentStatus("Unpaid");
    setAmountPaid("");
    setShowNewPurchase(true);
  };

  const switchTab = (tabId) => {
    const target = tabs.find((t) => t.id === tabId);
    if (!target) return;
    setActiveTabId(tabId);
    setSelectedSupplier(target.data.selectedSupplier);
    setInvoiceNo(target.data.invoiceNo);
    setPurchaseDate(target.data.purchaseDate);
    setPurchaseItems(target.data.purchaseItems);
    setPaymentStatus(target.data.paymentStatus);
    setAmountPaid(target.data.amountPaid);
    setShowNewPurchase(true);
  };

  const closeTab = (tabId) => {
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      if (filtered.length > 0) {
        if (activeTabId === tabId) {
          const next = filtered[0];
          setActiveTabId(next.id);
          setSelectedSupplier(next.data.selectedSupplier);
          setInvoiceNo(next.data.invoiceNo);
          setPurchaseDate(next.data.purchaseDate);
          setPurchaseItems(next.data.purchaseItems);
          setPaymentStatus(next.data.paymentStatus);
          setAmountPaid(next.data.amountPaid);
        }
      } else {
        setActiveTabId(null);
        setSelectedSupplier("");
        setInvoiceNo("");
        setPurchaseDate(new Date().toISOString().slice(0, 10));
        setPurchaseItems([]);
        setPaymentStatus("Unpaid");
        setAmountPaid("");
        setShowNewPurchase(false);
      }
      if (user?.id) {
        localStorage.setItem(
          \`pharmalogy_purchase_drafts_\${user.id}\`,
          JSON.stringify(filtered)
        );
      }
      return filtered;
    });
  };

  // Clear current active tab draft explicitly if needed
  const clearDraft = () => {
    if (activeTabId) closeTab(activeTabId);
  };

  // ============ CSV UPLOAD ============`;

  content = content.replace(oldStorageRegex, newLogic);
  
  // replace handleStartNewPurchase behavior
  content = content.replace(
    /const handleStartNewPurchase = \(\) => \{\n\s+setShowNewPurchase\([^]+\n\s+setTimeout\([^]+focus[^]+\n\s+\};\n/m,
    `const handleStartNewPurchase = () => {
    if (!showNewPurchase && tabs.length === 0) {
      createNewTab();
    } else {
      setShowNewPurchase(true);
      setTimeout(() => document.getElementById("search-medicine-input")?.focus(), 100);
    }
  };
`
  );

  // remove showRestoreDialog completely from states
  content = content.replace(/const \[showRestoreDialog, setShowRestoreDialog\].*\n/g, '');
  content = content.replace(/const \[draftData, setDraftData\].*\n/g, '');

  content = content.replace(/<AlertDialog open=\{showRestoreDialog\}[^]+\/AlertDialog>/gm, '');

  // Add the UI bottom bar!
  if (!content.includes('TABS NAVBAR FOR NEW PURCHASES')) {
    const bottomBarUI = `
      {/* TABS NAVBAR FOR NEW PURCHASES */}
      {showNewPurchase && (
        <div className="fixed bottom-0 left-[25px] md:left-[250px] right-0 z-[100] flex items-center bg-card/95 backdrop-blur border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-4 py-3 gap-2 overflow-x-auto scroller-hide overflow-y-hidden">
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            let tabName = \`Tab \${idx + 1}\`;
            if (tab.data?.purchaseItems?.length > 0) {
              const firstProduct = tab.data.purchaseItems[0].product_name || "Unknown";
              const extra = tab.data.purchaseItems.length - 1;
              tabName = extra > 0 ? \`\${firstProduct} +\${extra}\` : firstProduct;
            }
            return (
              <div key={tab.id} className="relative group shrink-0">
                <Button
                  variant={isActive ? "default" : "secondary"}
                  size="sm"
                  onClick={(e) => { e.preventDefault(); switchTab(tab.id); }}
                  className={\`pr-8 \${isActive ? "shadow-md ring-1 ring-primary/50" : "opacity-80 hover:opacity-100"}\`}
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                  {tabName}
                </Button>
                {tabs.length > 0 && (
                  <div
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-background/50 hover:bg-destructive hover:text-destructive-foreground cursor-pointer transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </div>
                )}
              </div>
            );
          })}
          {tabs.length < 10 && (
            <Button
              variant="outline"
              size="sm"
              onClick={createNewTab}
              className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary shrink-0 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1" /> New Tab
            </Button>
          )}
        </div>
      )}
    </Layout>
  `;
    content = content.replace(/<\/Layout>\s*$/m, bottomBarUI);
  }

  fs.writeFileSync(filePath, content);
};

const handleBilling = () => {
    const filePath = 'frontend/src/pages/BillingPage.jsx';
    let content = fs.readFileSync(filePath, 'utf8');
  
    if (!content.includes('import { v4 as uuidv4 } from "uuid";')) {
      content = content.replace(
        'import { useSearchParams } from "react-router-dom";',
        'import { useSearchParams } from "react-router-dom";\nimport { v4 as uuidv4 } from "uuid";'
      );
    }
  
    if (!content.includes('useAuth } from "../App";')) {
      content = content.replace(
        'import { API } from "../App";',
        'import { API, useAuth } from "../App";'
      );
    }
  
    if (!content.includes('const [tabs, setTabs]')) {
      content = content.replace(
        'const [loading, setLoading] = useState(true);',
        'const [loading, setLoading] = useState(true);\n  const { user } = useAuth();\n  const [tabs, setTabs] = useState([]);\n  const [activeTabId, setActiveTabId] = useState(null);'
      );
    }
  
    // Remove local storage logic
    content = content.replace(/const LOCAL_STORAGE_KEY_BILL = "pharmalogy_billing_draft";\n/g, '');
  
    const oldStorageRegex = /\/\/ ============ AUTO-SAVE TO LOCALSTORAGE ============[^]*?\/\/ ============ CSV UPLOAD ============/m;
    
    // We don't have CSV UPLOAD in Billing, let's use a different boundary
    const billRegex = /\/\/ ============ AUTO-SAVE TO LOCALSTORAGE ============[^]*?\/\/ Execute Search/m;
  
    const newLogic = `// ============ MULTI-TAB DRAFTS ============
    useEffect(() => {
      if (!user?.id) return;
      const STORAGE_KEY = \`pharmalogy_billing_drafts_\${user.id}\`;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.length > 0) {
            setTabs(parsed);
            const active = parsed[0];
            setActiveTabId(active.id);
            setCustomerName(active.data.customerName || "");
            setCustomerMobile(active.data.customerMobile || "");
            setCustomerEmail(active.data.customerEmail || "");
            setBillingDate(active.data.billingDate || new Date().toISOString().slice(0, 10));
            setBillingItems(active.data.billingItems || []);
            setPaymentStatus(active.data.paymentStatus || "Paid");
            setAmountPaid(active.data.amountPaid || "");
            setDiscountType(active.data.discountType || "percent");
            setDiscountValue(active.data.discountValue || 0);
          }
        } catch (e) {}
      }
    }, [user?.id]);
  
    useEffect(() => {
      if (!user?.id || !activeTabId) return;
      const delay = setTimeout(() => {
        setTabs((prev) => {
          const newTabs = prev.map((t) =>
            t.id === activeTabId
              ? {
                  ...t,
                  data: {
                    customerName,
                    customerMobile,
                    customerEmail,
                    billingDate,
                    billingItems,
                    paymentStatus,
                    amountPaid,
                    discountType,
                    discountValue,
                  },
                }
              : t
          );
          localStorage.setItem(
            \`pharmalogy_billing_drafts_\${user.id}\`,
            JSON.stringify(newTabs)
          );
          return newTabs;
        });
      }, 500);
      return () => clearTimeout(delay);
    }, [
      customerName,
      customerMobile,
      customerEmail,
      billingDate,
      billingItems,
      paymentStatus,
      amountPaid,
      discountType,
      discountValue,
      activeTabId,
      user?.id,
    ]);
  
    const createNewTab = () => {
      if (tabs.length >= 10) {
        toast.error("Maximum 10 tabs allowed");
        return;
      }
      const newId = uuidv4();
      const newTab = {
        id: newId,
        data: {
          customerName: "",
          customerMobile: "",
          customerEmail: "",
          billingDate: new Date().toISOString().slice(0, 10),
          billingItems: [],
          paymentStatus: "Paid",
          amountPaid: "",
          discountType: "percent",
          discountValue: 0
        },
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newId);
      setCustomerName("");
      setCustomerMobile("");
      setCustomerEmail("");
      setBillingDate(new Date().toISOString().slice(0, 10));
      setBillingItems([]);
      setPaymentStatus("Paid");
      setAmountPaid("");
      setDiscountType("percent");
      setDiscountValue(0);
      setShowNewBill(true);
    };
  
    const switchTab = (tabId) => {
      const target = tabs.find((t) => t.id === tabId);
      if (!target) return;
      setActiveTabId(tabId);
      setCustomerName(target.data.customerName || "");
      setCustomerMobile(target.data.customerMobile || "");
      setCustomerEmail(target.data.customerEmail || "");
      setBillingDate(target.data.billingDate || new Date().toISOString().slice(0, 10));
      setBillingItems(target.data.billingItems || []);
      setPaymentStatus(target.data.paymentStatus || "Paid");
      setAmountPaid(target.data.amountPaid || "");
      setDiscountType(target.data.discountType || "percent");
      setDiscountValue(target.data.discountValue || 0);
      setShowNewBill(true);
    };
  
    const closeTab = (tabId) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        if (filtered.length > 0) {
          if (activeTabId === tabId) {
            const next = filtered[0];
            setActiveTabId(next.id);
            setCustomerName(next.data.customerName || "");
            setCustomerMobile(next.data.customerMobile || "");
            setCustomerEmail(next.data.customerEmail || "");
            setBillingDate(next.data.billingDate || new Date().toISOString().slice(0, 10));
            setBillingItems(next.data.billingItems || []);
            setPaymentStatus(next.data.paymentStatus || "Paid");
            setAmountPaid(next.data.amountPaid || "");
            setDiscountType(next.data.discountType || "percent");
            setDiscountValue(next.data.discountValue || 0);
          }
        } else {
          setActiveTabId(null);
          setCustomerName("");
          setCustomerMobile("");
          setCustomerEmail("");
          setBillingDate(new Date().toISOString().slice(0, 10));
          setBillingItems([]);
          setPaymentStatus("Paid");
          setAmountPaid("");
          setDiscountType("percent");
          setDiscountValue(0);
          setShowNewBill(false);
        }
        if (user?.id) {
          localStorage.setItem(
            \`pharmalogy_billing_drafts_\${user.id}\`,
            JSON.stringify(filtered)
          );
        }
        return filtered;
      });
    };
  
    // Clear current active tab draft explicitly if needed
    const clearDraft = () => {
      if (activeTabId) closeTab(activeTabId);
    };
  
    // Execute Search`;
  
    content = content.replace(billRegex, newLogic);
    
    // replace handleStartNewBill behavior
    content = content.replace(
      /const handleStartNewBill = \(\) => \{\n\s+setShowNewBill\([^]+\n\s+setTimeout\([^]+focus[^]+\n\s+\};\n/m,
      `const handleStartNewBill = () => {
      if (!showNewBill && tabs.length === 0) {
        createNewTab();
      } else {
        setShowNewBill(true);
        setTimeout(() => document.getElementById("search-inventory-input")?.focus(), 100);
      }
    };
  `
    );
  
    // remove showRestoreDialog completely from states
    content = content.replace(/const \[showRestoreDialog, setShowRestoreDialog\].*\n/g, '');
    content = content.replace(/const \[draftData, setDraftData\].*\n/g, '');
  
    content = content.replace(/<AlertDialog open=\{showRestoreDialog\}[^]+\/AlertDialog>/gm, '');
  
    // Add the UI bottom bar!
    if (!content.includes('TABS NAVBAR FOR NEW BILLS')) {
      const bottomBarUI = `
        {/* TABS NAVBAR FOR NEW BILLS */}
        {showNewBill && (
          <div className="fixed bottom-0 left-[25px] md:left-[250px] right-0 z-[100] flex items-center bg-card/95 backdrop-blur border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-4 py-3 gap-2 overflow-x-auto scroller-hide overflow-y-hidden">
            {tabs.map((tab, idx) => {
              const isActive = tab.id === activeTabId;
              let tabName = \`Tab \${idx + 1}\`;
              if (tab.data?.billingItems?.length > 0) {
                const firstProduct = tab.data.billingItems[0].product_name || "Unknown";
                const extra = tab.data.billingItems.length - 1;
                tabName = extra > 0 ? \`\${firstProduct} +\${extra}\` : firstProduct;
              }
              return (
                <div key={tab.id} className="relative group shrink-0">
                  <Button
                    variant={isActive ? "default" : "secondary"}
                    size="sm"
                    onClick={(e) => { e.preventDefault(); switchTab(tab.id); }}
                    className={\`pr-8 \${isActive ? "shadow-md ring-1 ring-primary/50" : "opacity-80 hover:opacity-100"}\`}
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                    {tabName}
                  </Button>
                  {tabs.length > 0 && (
                    <div
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-background/50 hover:bg-destructive hover:text-destructive-foreground cursor-pointer transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </div>
                  )}
                </div>
              );
            })}
            {tabs.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                onClick={createNewTab}
                className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary shrink-0 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4 mr-1" /> New Tab
              </Button>
            )}
          </div>
        )}
      </Layout>
    `;
      content = content.replace(/<\/Layout>\s*$/m, bottomBarUI);
    }
  
    fs.writeFileSync(filePath, content);
  };
  

handlePurchases();
handleBilling();
