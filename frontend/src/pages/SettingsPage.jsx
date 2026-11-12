import { IS_DESKTOP, openCounters } from "../lib/desktop";
import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { API, useAuth } from "../App";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Settings, Building2, User, Loader2, Save, Upload, Database, Download, FileJson, KeyRound, Mail, Layout, Sliders, Search } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "../components/ui/switch";
import PharmacySettings from "../components/settings/PharmacySettings";
import ProfileSettings from "../components/settings/ProfileSettings";
import DeviceManager from "../components/settings/DeviceManager";
import BillingPlanSettings from "../components/settings/BillingPlanSettings";
import { useSearchParams } from "react-router-dom";
import { Laptop, Lock, Receipt } from "lucide-react";

export default function SettingsPage() {
  const { user, isAdmin, settings, settingsDefinitions, updateSetting, fetchSettings, can } = useAuth();
  // Pharmacy details are shared by everyone: hidden without access, view-only without edit
  const canSeePharmacy = can("settings", "read");
  const canEditPharmacy = can("settings", "update");
  const [numberDrafts, setNumberDrafts] = useState({}); // typed text, so a number field can be cleared
  const [searchParams] = useSearchParams();
  const TABS = ["pharmacy", "profile", "preferences", "devices", "billing", "data"];
  const [tab, setTab] = useState(() => {
    const asked = TABS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "pharmacy";
    return asked === "pharmacy" && !can("settings", "read") ? "profile" : asked;
  });
  const [pharmacyDirty, setPharmacyDirty] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [importingMedicines, setImportingMedicines] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [lockOtpDialog, setLockOtpDialog] = useState({
    open: false,
    key: "",
    value: false,
    otp: "",
    displayedOtp: "",
    requesting: false,
    verifying: false,
  });

  const handleRequestLockOtp = async (key, value) => {
    setLockOtpDialog({
      open: true,
      key,
      value,
      otp: "",
      displayedOtp: "",
      requesting: true,
      verifying: false,
    });

    try {
      const res = await axios.post(`${API}/settings/request-lock-otp`);
      setLockOtpDialog((prev) => ({
        ...prev,
        requesting: false,
        displayedOtp: res.data.otp || "",
      }));
      toast.success("OTP sent to your email");
    } catch (err) {
      setLockOtpDialog((prev) => ({ ...prev, open: false, requesting: false }));
      toast.error(err.response?.data?.detail || "Failed to send OTP");
    }
  };

  const handleVerifyLockOtp = async () => {
    if (!lockOtpDialog.otp.trim()) {
      toast.error("Please enter the OTP");
      return;
    }
    setLockOtpDialog((prev) => ({ ...prev, verifying: true }));
    try {
      await axios.post(`${API}/settings/verify-and-update-lock`, {
        key: lockOtpDialog.key,
        value: lockOtpDialog.value,
        otp: lockOtpDialog.otp,
      });
      toast.success("Setting updated successfully");
      await fetchSettings();
      setLockOtpDialog({
        open: false,
        key: "",
        value: false,
        otp: "",
        displayedOtp: "",
        requesting: false,
        verifying: false,
      });
    } catch (err) {
      setLockOtpDialog((prev) => ({ ...prev, verifying: false }));
      toast.error(err.response?.data?.detail || "Failed to verify OTP");
    }
  };

  const migrationFileRef = useRef(null);

  const [migrationData, setMigrationData] = useState({
    dataType: "suppliers",
    file: null,
  });

  const [customThresholdModalOpen, setCustomThresholdModalOpen] = useState(false);
  const [productsForThreshold, setProductsForThreshold] = useState([]);
  const [thresholdSearch, setThresholdSearch] = useState("");
  const [savingProductId, setSavingProductId] = useState("");
  const [loadingThresholdProducts, setLoadingThresholdProducts] = useState(false);
  const [loadingMoreThresholdProducts, setLoadingMoreThresholdProducts] = useState(false);
  const [thresholdInputValues, setThresholdInputValues] = useState({});
  const [thresholdProductsPage, setThresholdProductsPage] = useState(1);
  const [hasMoreThresholdProducts, setHasMoreThresholdProducts] = useState(true);

  const fetchInitialThresholdProducts = async () => {
    setLoadingThresholdProducts(true);
    setThresholdProductsPage(1);
    setHasMoreThresholdProducts(true);
    try {
      const response = await axios.get(`${API}/inventory`, {
        params: {
          search: thresholdSearch,
          page: 1,
          limit: 30
        }
      });
      const items = response.data.inventory || [];
      setProductsForThreshold(items);
      
      const initialVals = {};
      items.forEach(p => {
        initialVals[p.id] = p.custom_threshold !== undefined && p.custom_threshold !== null ? String(p.custom_threshold) : "";
      });
      setThresholdInputValues(initialVals);

      const total = response.data.pagination?.total || 0;
      setHasMoreThresholdProducts(items.length < total);
    } catch (error) {
      toast.error("Failed to load inventory items");
    } finally {
      setLoadingThresholdProducts(false);
    }
  };

  useEffect(() => {
    if (!customThresholdModalOpen) return;
    const debounce = setTimeout(fetchInitialThresholdProducts, 300);
    return () => clearTimeout(debounce);
  }, [customThresholdModalOpen, thresholdSearch]);

  const loadMoreThresholdProducts = async () => {
    if (loadingMoreThresholdProducts || !hasMoreThresholdProducts) return;
    setLoadingMoreThresholdProducts(true);
    const nextPage = thresholdProductsPage + 1;
    try {
      const response = await axios.get(`${API}/inventory`, {
        params: {
          search: thresholdSearch,
          page: nextPage,
          limit: 30
        }
      });
      const items = response.data.inventory || [];
      if (items.length > 0) {
        setProductsForThreshold(prev => [...prev, ...items]);
        
        setThresholdInputValues(prev => {
          const updated = { ...prev };
          items.forEach(p => {
            updated[p.id] = p.custom_threshold !== undefined && p.custom_threshold !== null ? String(p.custom_threshold) : "";
          });
          return updated;
        });

        setThresholdProductsPage(nextPage);
      }
      
      const total = response.data.pagination?.total || 0;
      const loadedCount = productsForThreshold.length + items.length;
      setHasMoreThresholdProducts(loadedCount < total);
    } catch (error) {
      toast.error("Failed to load more items");
    } finally {
      setLoadingMoreThresholdProducts(false);
    }
  };

  const handleScrollThresholdProducts = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 50) {
      loadMoreThresholdProducts();
    }
  };

  const handleImportMedicineDatabase = async () => {
    setImportingMedicines(true);
    try {
      const response = await axios.post(`${API}/medicines/import`);
      if (response.data.imported) {
        toast.success(response.data.message);
      } else {
        toast.info(response.data.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to import medicine database");
    } finally {
      setImportingMedicines(false);
    }
  };

  const handleMigrationFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setMigrationData({ ...migrationData, file });
    }
  };

  const handleDataMigration = async () => {
    if (!migrationData.file) {
      toast.error("Please select a file");
      return;
    }

    setMigrating(true);
    try {
      const formData = new FormData();
      formData.append("file", migrationData.file);
      formData.append("data_type", migrationData.dataType);

      const response = await axios.post(`${API}/migrate/data`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success(`Migration complete: ${response.data.imported}/${response.data.total} items imported`);
      
      if (response.data.errors?.length > 0) {
        console.log("Migration errors:", response.data.errors);
        toast.warning(`${response.data.errors.length} items had errors - check console`);
      }
      
      setMigrationData({ dataType: "suppliers", file: null });
      if (migrationFileRef.current) {
        migrationFileRef.current.value = "";
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  const handleDownloadTemplate = async (dataType) => {
    try {
      const response = await axios.get(`${API}/migrate/template/${dataType}`);
      const blob = new Blob([JSON.stringify([response.data.template], null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dataType}_template.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Failed to download template");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/75 bg-clip-text text-transparent">Settings</h1>
        <p className="text-muted-foreground">Manage your pharmacy, profile, and data settings</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="max-md:flex max-md:w-full max-md:justify-start max-md:overflow-x-auto [scrollbar-width:none]">
          {canSeePharmacy && (
            <TabsTrigger value="pharmacy" data-testid="settings-tab-pharmacy">
              <Building2 className="w-4 h-4 mr-2" />
              Pharmacy
              {pharmacyDirty && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved changes" />}
            </TabsTrigger>
          )}
          <TabsTrigger value="profile" data-testid="settings-tab-profile">
            <User className="w-4 h-4 mr-2" />
            Profile
            {profileDirty && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved changes" />}
          </TabsTrigger>
          <TabsTrigger value="preferences">
            <Sliders className="w-4 h-4 mr-2" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="devices" data-testid="settings-tab-devices">
            <Laptop className="w-4 h-4 mr-2" />
            Devices
          </TabsTrigger>
          {isAdmin && !IS_DESKTOP && (
            <TabsTrigger value="billing" data-testid="settings-tab-billing">
              <Receipt className="w-4 h-4 mr-2" />
              Billing &amp; plan
            </TabsTrigger>
          )}
          {isAdmin && !IS_DESKTOP && (
            <TabsTrigger value="data">
              <Database className="w-4 h-4 mr-2" />
              Data Migration
            </TabsTrigger>
          )}
        </TabsList>

        {/* Kept mounted so edits survive switching tabs */}
        {canSeePharmacy && (
          <TabsContent value="pharmacy" forceMount className="data-[state=inactive]:hidden">
            {!canEditPharmacy && (
              <p className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-300" data-testid="settings-view-only">
                <Lock className="w-4 h-4 shrink-0" /> View only. Ask the pharmacy owner if you need to change these details.
              </p>
            )}
            {/* A disabled fieldset turns off every field and button inside */}
            <fieldset disabled={!canEditPharmacy} className="min-w-0 disabled:opacity-90">
              <PharmacySettings active={tab === "pharmacy"} onDirtyChange={setPharmacyDirty} />
            </fieldset>
          </TabsContent>
        )}

        <TabsContent value="profile" forceMount className="data-[state=inactive]:hidden">
          <ProfileSettings active={tab === "profile"} onDirtyChange={setProfileDirty} />
        </TabsContent>
        <TabsContent value="devices">
          <DeviceManager active={tab === "devices"} />
        </TabsContent>
        {isAdmin && !IS_DESKTOP && (
          <TabsContent value="billing">
            <BillingPlanSettings active={tab === "billing"} />
          </TabsContent>
        )}
        {/* Preferences Tab */}
        <TabsContent value="preferences">
          {IS_DESKTOP && (
            <Card className="bg-card/50 backdrop-blur-sm border-white/5 mb-6" data-testid="desktop-counters-card">
              <CardHeader>
                <CardTitle>Counters and network</CardTitle>
                <CardDescription>Optional. Connect other computers in the shop so all counters share the same stock and bills.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={openCounters}>Set up counters</Button>
              </CardContent>
            </Card>
          )}
          <Card className="bg-card/50 backdrop-blur-sm border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-primary" />
                User Preferences
              </CardTitle>
              <CardDescription>
                Personalize your workspace. These settings are saved to your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Grouping by Category */}
              {Array.from(new Set(settingsDefinitions.map(s => s.category))).map(category => (
                <div key={category} className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{category}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {settingsDefinitions.filter(s => s.category === category).map(setting => (
                      <div key={setting.key} className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/5 hover:border-primary/20 transition-all group">
                        <div className="space-y-1 pr-4">
                          <Label className="text-base cursor-pointer" htmlFor={setting.key}>
                            {setting.label}
                          </Label>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {setting.description}
                          </p>
                        </div>
                        
                        {setting.type === 'boolean' && (
                          <Switch
                            id={setting.key}
                            checked={settings[setting.key] !== undefined ? settings[setting.key] : setting.default}
                            onCheckedChange={async (val) => {
                              if (setting.key === "lock_unpaid_purchases" || setting.key === "lock_unpaid_bills") {
                                await handleRequestLockOtp(setting.key, val);
                              } else {
                                await updateSetting(setting.key, val);
                                if (setting.key === "purchase_payment_mode_mandatory" && val && settings.purchase_payment_status === "Unpaid") {
                                  await updateSetting("purchase_payment_status", "Paid");
                                }
                              }
                            }}
                          />
                        )}
                        
                        {setting.type === 'select' && (
                          <Select
                            value={settings[setting.key] || setting.default}
                            onValueChange={(val) => updateSetting(setting.key, val)}
                          >
                            <SelectTrigger className="w-[120px] bg-background/50">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {setting.options
                                .filter(opt => {
                                  if (setting.key === "purchase_payment_status" && settings.purchase_payment_mode_mandatory && opt === "Unpaid") {
                                    return false;
                                  }
                                  if (setting.key === "purchase_payment_mode_default" && settings.purchase_payment_mode_mandatory && opt === "none") {
                                    return false;
                                  }
                                  if (setting.key === "billing_payment_mode_default" && settings.billing_payment_mode_mandatory && opt === "none") {
                                    return false;
                                  }
                                  return true;
                                })
                                .map(opt => (
                                  <SelectItem key={opt} value={opt} className="capitalize">{opt}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        {setting.type === 'number' && (
                          <div className="flex flex-col items-end gap-1.5">
                            <Input
                              type="number"
                              value={numberDrafts[setting.key] !== undefined ? numberDrafts[setting.key] : settings[setting.key] !== undefined ? settings[setting.key] : setting.default}
                              placeholder={String(setting.default ?? 0)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setNumberDrafts((d) => ({ ...d, [setting.key]: v }));
                                if (v !== "" && !isNaN(Number(v))) updateSetting(setting.key, Number(v));
                              }}
                              onBlur={() => setNumberDrafts((d) => { const n = { ...d }; delete n[setting.key]; return n; })}
                              className="w-[120px] bg-background/50 h-9 rounded-xl border border-border/50 text-xs font-semibold text-right pr-3"
                            />
                            {setting.key === 'shortage_threshold' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCustomThresholdModalOpen(true)}
                                className="h-7 text-[10px] font-bold border-primary/40 hover:bg-primary/10 text-primary mt-1 px-2.5 rounded-lg shadow-sm"
                              >
                                Set custom thresholds per product
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <Separator className="bg-white/5" />
                </div>
              ))}
              
              {settingsDefinitions.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 opacity-20" />
                  <p>Loading personalizations...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Migration Tab */}
        {isAdmin && (
          <TabsContent value="data" className="space-y-6">
            {/* Medicine Database */}
            <Card className="bg-card/50 backdrop-blur-sm border-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary" />
                  Medicine Database
                </CardTitle>
                <CardDescription>
                  Import Indian medicine database for product suggestions (253,973 medicines)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleImportMedicineDatabase}
                  disabled={importingMedicines}
                  className="btn-primary"
                  data-testid="import-medicines-btn"
                >
                  {importingMedicines ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Import Medicine Database
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Data Migration */}
            <Card className="bg-card/50 backdrop-blur-sm border-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  Data Migration
                </CardTitle>
                <CardDescription>
                  Import data from other software via JSON files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Type</Label>
                    <Select
                      value={migrationData.dataType}
                      onValueChange={(v) => setMigrationData({ ...migrationData, dataType: v })}
                    >
                      <SelectTrigger data-testid="migration-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suppliers">Suppliers</SelectItem>
                        <SelectItem value="customers">Customers</SelectItem>
                        <SelectItem value="products">Products</SelectItem>
                        <SelectItem value="inventory">Inventory</SelectItem>
                        <SelectItem value="purchases">Purchases</SelectItem>
                        <SelectItem value="bills">Bills</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>JSON File</Label>
                    <Input
                      ref={migrationFileRef}
                      type="file"
                      accept=".json"
                      onChange={handleMigrationFileSelect}
                      data-testid="migration-file-input"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadTemplate(migrationData.dataType)}
                    data-testid="download-template-btn"
                  >
                    <FileJson className="w-4 h-4 mr-2" />
                    Download Template
                  </Button>

                  <Button
                    onClick={handleDataMigration}
                    disabled={migrating || !migrationData.file}
                    className="btn-primary"
                    data-testid="migrate-data-btn"
                  >
                    {migrating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Migrating...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Import Data
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Tip: Download the template first to see the required JSON structure for each data type.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Info Card */}
      <Card className="bg-muted/30 border-white/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">
                Only administrators can modify pharmacy details and perform data migrations.
                All users can update their own profile (name and phone) with OTP verification.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Threshold Modal */}
      <Dialog open={customThresholdModalOpen} onOpenChange={setCustomThresholdModalOpen}>
        <DialogContent className="max-w-2xl bg-card border border-border shadow-2xl rounded-2xl p-6">
          <DialogHeader className="border-b border-border/40 pb-4">
            <DialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-2">
              <Sliders className="w-5 h-5 text-primary" />
              Custom Shortage Thresholds per Product
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Set custom shortage quantities for individual products. If left empty, the global threshold ({settings?.shortage_threshold || 10}) will be used.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <Input
                placeholder="Search products by name..."
                value={thresholdSearch}
                onChange={(e) => setThresholdSearch(e.target.value)}
                className="pl-9 h-10 text-sm border-border/80 focus:border-primary bg-card/25 rounded-xl"
              />
            </div>

            <div 
              onScroll={handleScrollThresholdProducts}
              className="max-h-[350px] overflow-y-auto border border-border/40 rounded-xl bg-card/10 p-2 space-y-2"
            >
              {loadingThresholdProducts ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : productsForThreshold.length === 0 ? (
                <div className="text-center py-10 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  No products found
                </div>
              ) : (
                <>
                  {productsForThreshold.map((prod) => (
                    <div
                      key={prod.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/20 bg-muted/5 hover:bg-muted/10 transition-all"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-sm text-foreground">{prod.product_name}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Batch: {prod.batch_no} | Qty: {prod.available_quantity} units
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder={`${settings?.shortage_threshold || 10} (Global)`}
                          value={thresholdInputValues[prod.id] !== undefined ? thresholdInputValues[prod.id] : ""}
                          onChange={(e) => {
                            setThresholdInputValues((prev) => ({
                              ...prev,
                              [prod.id]: e.target.value,
                            }));
                          }}
                          className="w-[100px] h-8 text-xs font-semibold text-center border-border focus:border-primary bg-background/50"
                        />
                        <Button
                          size="sm"
                          disabled={savingProductId === prod.id}
                          onClick={async () => {
                            setSavingProductId(prod.id);
                            try {
                              const val = thresholdInputValues[prod.id];
                              await axios.put(`${API}/inventory/threshold`, {
                                product_id: prod.product_id || null,
                                product_name: prod.product_name,
                                threshold: val === "" || val === null ? null : Number(val),
                              });
                              toast.success(`Updated shortage threshold for ${prod.product_name}`);
                            } catch (err) {
                              toast.error("Failed to update threshold");
                            } finally {
                              setSavingProductId("");
                            }
                          }}
                          className="h-8 px-3 text-xs bg-primary text-primary-foreground font-bold rounded-lg"
                        >
                          {savingProductId === prod.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {loadingMoreThresholdProducts && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lock Settings OTP Verification Dialog */}
      <Dialog
        open={lockOtpDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setLockOtpDialog({
              open: false,
              key: "",
              value: false,
              otp: "",
              displayedOtp: "",
              requesting: false,
              verifying: false,
            });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Verify Lock Settings Change
            </DialogTitle>
            <DialogDescription>
              Enter the OTP sent to your email ({user?.email}) to confirm changing the lock preference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {lockOtpDialog.displayedOtp && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-500 mb-2">
                  <Mail className="w-4 h-4" />
                  <span className="text-sm font-medium">Email service unavailable</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your OTP is: <span className="font-mono font-bold text-lg text-foreground">{lockOtpDialog.displayedOtp}</span>
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Enter OTP</Label>
              <Input
                value={lockOtpDialog.otp}
                onChange={(e) =>
                  setLockOtpDialog((prev) => ({ ...prev, otp: e.target.value }))
                }
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                className="text-center text-lg font-mono tracking-widest"
                data-testid="lock-otp-input"
                autoFocus
              />
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() =>
                  setLockOtpDialog({
                    open: false,
                    key: "",
                    value: false,
                    otp: "",
                    displayedOtp: "",
                    requesting: false,
                    verifying: false,
                  })
                }
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleVerifyLockOtp}
                disabled={lockOtpDialog.verifying || !lockOtpDialog.otp.trim()}
                className="flex-1 btn-primary"
                data-testid="verify-lock-otp-btn"
              >
                {lockOtpDialog.verifying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Confirm Change
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
