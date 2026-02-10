import { useState, useRef } from "react";
import axios from "axios";
import { API, useAuth } from "../App";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
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
import { Settings, Building2, User, Camera, Loader2, Save, Upload, Database, Download, FileJson, Edit2, KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, pharmacy, setUser, setPharmacy, isAdmin } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [importingMedicines, setImportingMedicines] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const logoInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const migrationFileRef = useRef(null);

  const [pharmacyData, setPharmacyData] = useState({
    name: pharmacy?.name || "",
    location: pharmacy?.location || "",
    license_no: pharmacy?.license_no || "",
    years_old: pharmacy?.years_old || "",
  });

  const [migrationData, setMigrationData] = useState({
    dataType: "suppliers",
    file: null,
  });

  // Profile update state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || "",
    phone: user?.mobile || user?.phone || "",
  });
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [showOtpDialog, setShowOtpDialog] = useState(false);
  const [otp, setOtp] = useState("");
  const [displayedOtp, setDisplayedOtp] = useState(null); // For fallback when email fails
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const handleSavePharmacy = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      if (pharmacyData.name) formData.append("name", pharmacyData.name);
      if (pharmacyData.location) formData.append("location", pharmacyData.location);
      if (pharmacyData.license_no) formData.append("license_no", pharmacyData.license_no);
      if (pharmacyData.years_old) formData.append("years_old", pharmacyData.years_old);

      const response = await axios.put(`${API}/pharmacy`, formData);
      setPharmacy(response.data.pharmacy);
      toast.success("Pharmacy details updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update pharmacy");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post(`${API}/pharmacy/logo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setPharmacy({ ...pharmacy, logo_url: response.data.logo_url });
      toast.success("Logo uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post(`${API}/users/avatar`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setUser({ ...user, image_url: response.data.image_url });
      toast.success("Avatar uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
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

  // Profile update handlers
  const handleStartEditProfile = () => {
    setProfileData({
      name: user?.name || "",
      phone: user?.mobile || user?.phone || "",
    });
    setEditingProfile(true);
  };

  const handleCancelEditProfile = () => {
    setEditingProfile(false);
    setProfileData({
      name: user?.name || "",
      phone: user?.mobile || user?.phone || "",
    });
  };

  const handleRequestOtp = async () => {
    if (!profileData.name.trim()) {
      toast.error("Name is required");
      return;
    }
    
    setRequestingOtp(true);
    try {
      const response = await axios.post(`${API}/users/request-profile-update`, {
        name: profileData.name.trim(),
        phone: profileData.phone.trim() || null,
      });
      
      if (response.data.email_sent) {
        toast.success("OTP sent to your email");
        setDisplayedOtp(null);
      } else {
        toast.info("Email service unavailable - OTP shown below");
        setDisplayedOtp(response.data.otp);
      }
      setShowOtpDialog(true);
      setOtp("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request OTP");
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleVerifyOtpAndUpdate = async () => {
    if (!otp.trim()) {
      toast.error("Please enter the OTP");
      return;
    }
    
    setVerifyingOtp(true);
    try {
      const response = await axios.post(`${API}/users/verify-profile-update`, {
        otp: otp.trim(),
        name: profileData.name.trim(),
        phone: profileData.phone.trim() || null,
      });
      
      setUser(response.data.user);
      toast.success("Profile updated successfully");
      setShowOtpDialog(false);
      setEditingProfile(false);
      setOtp("");
      setDisplayedOtp(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Invalid OTP");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleCancelOtpDialog = () => {
    setShowOtpDialog(false);
    setOtp("");
    setDisplayedOtp(null);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your pharmacy, profile, and data settings</p>
      </div>

      <Tabs defaultValue="pharmacy" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pharmacy">
            <Building2 className="w-4 h-4 mr-2" />
            Pharmacy
          </TabsTrigger>
          <TabsTrigger value="profile">
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="data">
              <Database className="w-4 h-4 mr-2" />
              Data Migration
            </TabsTrigger>
          )}
        </TabsList>

        {/* Pharmacy Tab */}
        <TabsContent value="pharmacy">
          <Card className="bg-card/50 backdrop-blur-sm border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Pharmacy Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Logo Upload */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  {pharmacy?.logo_url ? (
                    <img
                      src={pharmacy.logo_url}
                      alt="Pharmacy Logo"
                      className="w-20 h-20 rounded-xl object-cover border border-white/10"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center border border-white/10">
                      <Building2 className="w-8 h-8 text-primary/50" />
                    </div>
                  )}

                  {isAdmin && (
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    data-testid="logo-upload-input"
                  />
                </div>

                <div>
                  <p className="font-medium">Pharmacy Logo</p>
                  <p className="text-sm text-muted-foreground">Upload your pharmacy logo (appears on bills)</p>
                </div>
              </div>

              <Separator className="bg-white/5" />

              {/* Pharmacy Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Pharmacy Name</Label>
                  <Input
                    value={pharmacyData.name}
                    onChange={(e) => setPharmacyData({ ...pharmacyData, name: e.target.value })}
                    disabled={!isAdmin}
                    data-testid="pharmacy-name-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input
                    value={pharmacyData.location}
                    onChange={(e) => setPharmacyData({ ...pharmacyData, location: e.target.value })}
                    disabled={!isAdmin}
                    data-testid="pharmacy-location-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>License Number</Label>
                    <Input
                      value={pharmacyData.license_no}
                      onChange={(e) => setPharmacyData({ ...pharmacyData, license_no: e.target.value })}
                      disabled={!isAdmin}
                      data-testid="pharmacy-license-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Years in Business</Label>
                    <Input
                      type="number"
                      value={pharmacyData.years_old}
                      onChange={(e) => setPharmacyData({ ...pharmacyData, years_old: e.target.value })}
                      disabled={!isAdmin}
                      data-testid="pharmacy-years-input"
                    />
                  </div>
                </div>

                {isAdmin && (
                  <Button
                    onClick={handleSavePharmacy}
                    disabled={saving}
                    className="w-full btn-primary"
                    data-testid="save-pharmacy-btn"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="bg-card/50 backdrop-blur-sm border-white/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Your Profile
                </CardTitle>
                {!editingProfile && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleStartEditProfile}
                    data-testid="edit-profile-btn"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Profile
                  </Button>
                )}
              </div>
              <CardDescription>
                Update your personal information. Changes require OTP verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar Upload */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="w-20 h-20 border border-white/10">
                    <AvatarImage src={user?.image_url} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                      {user?.name?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </button>

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    data-testid="avatar-upload-input"
                  />
                </div>

                <div>
                  <p className="font-medium">Profile Photo</p>
                  <p className="text-sm text-muted-foreground">Upload your profile picture</p>
                </div>
              </div>

              <Separator className="bg-white/5" />

              {/* User Info - Editable or Read-only */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name {editingProfile && <span className="text-destructive">*</span>}</Label>
                  {editingProfile ? (
                    <Input 
                      value={profileData.name} 
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      placeholder="Enter your full name"
                      data-testid="edit-name-input"
                    />
                  ) : (
                    <Input value={user?.name || ""} disabled data-testid="user-name-display" />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user?.email || ""} disabled data-testid="user-email-display" />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>

                <div className="space-y-2">
                  <Label>Mobile / Phone</Label>
                  {editingProfile ? (
                    <Input 
                      value={profileData.phone} 
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      placeholder="Enter your mobile number"
                      data-testid="edit-phone-input"
                    />
                  ) : (
                    <Input value={user?.mobile || user?.phone || ""} disabled data-testid="user-mobile-display" />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value={user?.role || ""} disabled data-testid="user-role-display" />
                </div>

                {/* Edit Mode Actions */}
                {editingProfile && (
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      onClick={handleCancelEditProfile}
                      data-testid="cancel-edit-profile-btn"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleRequestOtp}
                      disabled={requestingOtp}
                      className="btn-primary"
                      data-testid="request-otp-btn"
                    >
                      {requestingOtp ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending OTP...
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4 mr-2" />
                          Verify & Save
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* OTP Verification Dialog */}
          <Dialog open={showOtpDialog} onOpenChange={handleCancelOtpDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-primary" />
                  Verify OTP
                </DialogTitle>
                <DialogDescription>
                  Enter the OTP sent to your email ({user?.email}) to confirm profile changes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {displayedOtp && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-yellow-500 mb-2">
                      <Mail className="w-4 h-4" />
                      <span className="text-sm font-medium">Email service unavailable</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your OTP is: <span className="font-mono font-bold text-lg text-foreground">{displayedOtp}</span>
                    </p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label>Enter OTP</Label>
                  <Input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    maxLength={6}
                    className="text-center text-lg font-mono tracking-widest"
                    data-testid="otp-input"
                    autoFocus
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={handleCancelOtpDialog}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleVerifyOtpAndUpdate}
                    disabled={verifyingOtp || !otp.trim()}
                    className="flex-1 btn-primary"
                    data-testid="verify-otp-btn"
                  >
                    {verifyingOtp ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Update Profile
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
    </div>
  );
}
