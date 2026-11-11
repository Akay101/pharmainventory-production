import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { KeyRound, Loader2, Save, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { API, useAuth } from "../../App";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import ImageCropField from "./ImageCropField";
import { Field, SectionCard, UpdateBar, uploadStatus } from "./SettingsKit";

const MOBILE_RE = /^(?:\+91|91|0)?[6-9]\d{9}$/;

const savedPhone = (user) => user?.mobile || user?.phone || "";
const toDraft = (user) => ({ name: user?.name || "", phone: savedPhone(user) });

export default function ProfileSettings({ active, onDirtyChange }) {
  const { user, setUser } = useAuth();
  const [draft, setDraft] = useState(() => toDraft(user));
  const [avatarDraft, setAvatarDraft] = useState(null);
  const [status, setStatus] = useState(null);
  const [avatarPercent, setAvatarPercent] = useState(null);
  const [error, setError] = useState(null);
  const [requestingCode, setRequestingCode] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(null);

  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const nameChanged = name !== (user?.name || "");
  const phoneChanged = phone !== savedPhone(user);
  const detailsChanged = nameChanged || phoneChanged;
  const changes = (nameChanged ? 1 : 0) + (phoneChanged ? 1 : 0) + (avatarDraft ? 1 : 0);
  const dirty = changes > 0;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) setDraft(toDraft(user));
  }, [user]);

  const nameError = name ? null : "Name is required";
  const phoneError = useMemo(() => {
    if (!phoneChanged) return null;
    if (!phone) return "Mobile number can't be removed";
    return MOBILE_RE.test(phone.replace(/[\s-]/g, "")) ? null : "Enter a valid 10-digit mobile number";
  }, [phone, phoneChanged]);

  const edit = (key) => (e) => {
    setDraft((prev) => ({ ...prev, [key]: e.target.value }));
    setError(null);
  };

  const save = async (code) => {
    setError(null);
    setOtpError(null);
    const hasImage = !!avatarDraft?.blob;
    setStatus(hasImage ? uploadStatus("photo", 0) : uploadStatus(null, null));
    setAvatarPercent(hasImage ? 0 : null);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("phone", phone);
      if (code) formData.append("otp", code);
      if (hasImage) formData.append("avatar", avatarDraft.blob, "avatar.jpg");
      if (avatarDraft?.removed) formData.append("remove_avatar", "true");

      const response = await axios.post(`${API}/users/me/profile`, formData, {
        onUploadProgress: (e) => {
          if (!hasImage || !e.total) return;
          const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
          setAvatarPercent(percent);
          setStatus(uploadStatus("photo", percent));
        },
      });
      setUser(response.data.user);
      setDraft(toDraft(response.data.user));
      setAvatarDraft(null);
      setOtpOpen(false);
      setOtp("");
      toast.success("Profile updated");
    } catch (err) {
      const message = err.response?.data?.detail || "We couldn't reach the server, so nothing was saved. Check your connection and try again.";
      if (otpOpen) setOtpError(message);
      else setError(message);
      toast.error(message);
    } finally {
      setStatus(null);
      setAvatarPercent(null);
    }
  };

  const handleUpdate = async () => {
    if (!detailsChanged) {
      await save(null);
      return;
    }
    setError(null);
    setRequestingCode(true);
    try {
      await axios.post(`${API}/users/request-profile-update`, { name, phone: phoneChanged ? phone : "" });
      toast.success("We've emailed you a code");
      setOtp("");
      setOtpError(null);
      setOtpOpen(true);
    } catch (err) {
      // A code sent moments ago is still good, so let them use it
      if (err.response?.data?.code === "OTP_COOLDOWN") {
        setOtpError(null);
        setOtpOpen(true);
      } else {
        const message = err.response?.data?.detail || "We couldn't send the code. Please try again.";
        setError(message);
        toast.error(message);
      }
    } finally {
      setRequestingCode(false);
    }
  };

  const handleDiscard = () => {
    setDraft(toDraft(user));
    setAvatarDraft(null);
    setError(null);
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <SectionCard icon={User} title="Profile photo" description="Shown beside your name across the app.">
        <ImageCropField
          label="Profile photo"
          currentUrl={user?.image_url}
          fallback={<span className="text-3xl font-bold text-primary">{user?.name?.charAt(0)?.toUpperCase()}</span>}
          shape="round"
          outputType="image/jpeg"
          draft={avatarDraft}
          onDraftChange={(next) => {
            setAvatarDraft(next);
            setError(null);
          }}
          busy={!!status && !!avatarDraft?.blob}
          percent={avatarPercent}
          testId="avatar"
        />
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <SectionCard icon={User} title="Personal details" description="Changing your name or mobile asks for a code sent to your email.">
          <Field label="Full name" required error={nameError} value={draft.name} onChange={edit("name")} disabled={!!status || requestingCode} placeholder="Enter your full name" data-testid="edit-name-input" />
          <Field label="Mobile" error={phoneError} value={draft.phone} onChange={edit("phone")} disabled={!!status || requestingCode} inputMode="tel" placeholder="Enter your mobile number" data-testid="edit-phone-input" />
        </SectionCard>

        <SectionCard icon={ShieldCheck} title="Account" description="These can't be changed here.">
          <Field label="Email" value={user?.email || ""} disabled data-testid="user-email-display" />
          <Field label="Role" value={user?.role || ""} disabled data-testid="user-role-display" />
        </SectionCard>
      </div>

      <UpdateBar
        active={active && !otpOpen}
        changes={changes}
        blocked={!!nameError || !!phoneError || requestingCode}
        status={otpOpen ? null : status}
        error={error}
        onUpdate={handleUpdate}
        onDiscard={handleDiscard}
        testId="save-profile-btn"
      />

      <Dialog open={otpOpen} onOpenChange={(open) => !open && !status && setOtpOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Enter the code
            </DialogTitle>
            <DialogDescription>We sent a 6-digit code to {user?.email}. Enter it to save your changes.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (otp.length === 6 && !status) save(otp);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="profile-otp">Code</Label>
              <Input
                id="profile-otp"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, ""));
                  setOtpError(null);
                }}
                placeholder="6-digit code"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                disabled={!!status}
                className="text-center text-lg font-mono tracking-widest"
                data-testid="otp-input"
              />
              {otpError && <p className="text-xs text-rose-500" role="alert" data-testid="otp-error">{otpError}</p>}
            </div>
            {status && (
              <div className="space-y-1.5" data-testid="otp-progress">
                <p className="text-sm font-semibold">{status.text}</p>
                {status.percent !== null ? <Progress value={status.percent} className="h-1.5" /> : <div className="h-1.5 rounded-full bg-primary/40 animate-pulse" />}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={!!status} onClick={() => setOtpOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 btn-primary" disabled={!!status || otp.length !== 6} data-testid="verify-otp-btn">
                {status ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {otpError ? "Try again" : "Update"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
