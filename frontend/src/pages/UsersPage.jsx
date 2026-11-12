import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../App";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../components/ui/input-otp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Plus, UserCog, Trash2, Loader2, Shield, ShieldCheck, KeyRound, BadgeCheck, Circle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import Loader from "../components/Loader";
import AccessEditor, { accessSummary, fromPreset } from "../components/access/AccessEditor";
import BuySeatsDialog from "../components/billing/BuySeatsDialog";
import { formatDay } from "../lib/checkout";

const EMPTY_FORM = { name: "", email: "", mobile: "", password: "" };

function CopyFrom({ users, onPick, exclude }) {
  const options = users.filter((u) => !u.is_primary_admin && u.role !== "ADMIN" && u.id !== exclude && u.access);
  if (!options.length) return null;
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
      Copy access from
      <select className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-bold text-foreground" value="" onChange={(e) => e.target.value && onPick(options.find((u) => u.id === e.target.value))} data-testid="copy-access-from">
        <option value="">Choose a user…</option>
        {options.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const permsOf = (u) => {
  const a = u.access || {};
  return { preset: a.preset || "CUSTOM", modules: a.modules || {}, restrictions: a.restrictions || {}, pharmacies: a.pharmacies || "ALL" };
};

export default function UsersPage() {
  const { isAdmin, isOwner, user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, userId: null });
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState("");
  const [otp, setOtp] = useState("");
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [newPerms, setNewPerms] = useState(null);
  const [editing, setEditing] = useState(null); // { user, perms }
  const [seatsOpen, setSeatsOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const location = useLocation();

  const fetchUsers = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([axios.get(`${API}/users`), axios.get(`${API}/users/access/schema`)]);
      setUsers(u.data.users);
      setSchema(s.data);
    } catch (error) {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
    if (location.state?.highlightId) {
      setTimeout(() => {
        window.history.replaceState({}, document.title);
      }, 1000);
    }
  }, [isAdmin]); // eslint-disable-line

  const openAdd = () => {
    if (schema && schema.seats.free <= 0) {
      toast.info("All your user licences are in use. Add another user licence first.");
      setSeatsOpen(true);
      return;
    }
    setNewPerms(schema ? fromPreset(schema, "BILLING_COUNTER") : null);
    setDialogOpen(true);
  };

  const handleCreateUser = async () => {
    if (!formData.name || !formData.email || !formData.mobile || !formData.password) {
      toast.error("Please fill all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/users`, { ...formData, permissions: newPerms });
      setPendingId(response.data.pending_id);
      setDialogOpen(false);
      setVerifyDialog(true);
      toast.success(response.data.message || `We've sent a code to ${formData.email}`);
    } catch (error) {
      if (error.response?.data?.code === "SEAT_REQUIRED") {
        setDialogOpen(false);
        setSeatsOpen(true);
      }
      if (!error.permissionToastShown) toast.error(error.response?.data?.detail || "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyUser = async () => {
    if (otp.length !== 6) {
      toast.error("Please enter complete OTP");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/users/verify`, { pending_id: pendingId, otp });
      toast.success("User created successfully!");
      setVerifyDialog(false);
      setOtp("");
      setPendingId("");
      setFormData(EMPTY_FORM);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteUser = async () => {
    const { userId } = deleteConfirm;
    if (!userId) return;
    try {
      await axios.delete(`${API}/users/${userId}`);
      toast.success("User deleted. Their licence is free for someone else.");
      setDeleteConfirm({ open: false, userId: null });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete user");
    }
  };

  const saveAccess = async () => {
    setSubmitting(true);
    try {
      const r = await axios.put(`${API}/users/${editing.user.id}/permissions`, { permissions: editing.perms });
      toast.success(r.data.message);
      setEditing(null);
      fetchUsers();
    } catch (error) {
      if (!error.permissionToastShown) toast.error(error.response?.data?.detail || "Couldn't save access");
    } finally {
      setSubmitting(false);
    }
  };

  const setEnabled = async (u, enabled) => {
    setBusy(u.id);
    try {
      const r = await axios.post(`${API}/users/${u.id}/status`, { enabled });
      toast.success(r.data.message);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Couldn't change this user");
    } finally {
      setBusy(null);
    }
  };

  const giveSeat = async (u) => {
    setBusy(u.id);
    try {
      const r = await axios.post(`${API}/users/${u.id}/seat`);
      toast.success(r.data.message);
      fetchUsers();
    } catch (error) {
      if (error.response?.data?.code === "SEAT_REQUIRED") setSeatsOpen(true);
      toast.error(error.response?.data?.detail || "Couldn't give a licence");
    } finally {
      setBusy(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="bg-card/50 backdrop-blur-sm border-white/5 p-8 text-center">
          <Shield className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">Only administrators can access user management</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <Loader size="lg" text="Loading User Directory..." />;
  }

  const seatText = (u) => {
    if (u.is_primary_admin) return <span className="text-xs font-bold text-primary">Owner</span>;
    if (u.role === "ADMIN") return <span className="text-xs text-muted-foreground">Admin</span>;
    const s = u.seat;
    if (!s || s.kind === "NONE") return <span className="text-xs font-bold text-rose-600">No licence</span>;
    if (s.kind === "LEGACY") return <span className="text-xs text-muted-foreground">Existing user</span>;
    if (s.kind === "INCLUDED") return <span className="text-xs text-muted-foreground">Included with plan</span>;
    return s.active ? (
      <span className="text-xs text-muted-foreground">
        {s.cycle === "MONTHLY" ? "Monthly" : "Yearly"} · until {formatDay(s.ends_at)}
      </span>
    ) : (
      <span className="text-xs font-bold text-rose-600">Expired {formatDay(s.ends_at)}</span>
    );
  };
  const seatProblem = (u) => !u.is_primary_admin && u.role !== "ADMIN" && u.seat && !u.seat.active;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="users-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            {users.length} user{users.length === 1 ? "" : "s"}
            {schema?.seats ? ` · ${schema.seats.used} of ${schema.seats.total} pharmacist licence${schema.seats.total === 1 ? "" : "s"} in use` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {isOwner && (
            <Button variant="outline" className="rounded-xl" onClick={() => setSeatsOpen(true)} data-testid="buy-seats-users-btn">
              <UserPlus className="w-4 h-4 mr-2" /> Add licence
            </Button>
          )}
          <Button className="btn-primary" onClick={openAdd} data-testid="add-user-btn">
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {/* Add user */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setFormData(EMPTY_FORM);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a pharmacist</DialogTitle>
            <DialogDescription>They sign in with their own email and password and see only what you allow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input placeholder="John Doe" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="user-name-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" placeholder="user@pharmacy.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} data-testid="user-email-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Mobile *</Label>
                <Input placeholder="+91 9876543210" value={formData.mobile} onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} data-testid="user-mobile-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Password *</Label>
                <Input type="password" placeholder="Min 8 characters" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} data-testid="user-password-input" />
              </div>
            </div>
            {schema && newPerms && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-base font-bold">Access</Label>
                  <CopyFrom users={users} onPick={(u) => setNewPerms(permsOf(u))} />
                </div>
                <AccessEditor schema={schema} value={newPerms} onChange={setNewPerms} />
              </div>
            )}
            <Button onClick={handleCreateUser} disabled={submitting} className="w-full btn-primary" data-testid="create-user-btn">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create User"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit access */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && !submitting && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[92dvh] overflow-y-auto" data-testid="edit-access-dialog">
          {editing && schema && (
            <>
              <DialogHeader>
                <DialogTitle>Access for {editing.user.name}</DialogTitle>
                <DialogDescription>Changes apply straight away, including on devices they're signed in on.</DialogDescription>
              </DialogHeader>
              <div className="flex justify-end">
                <CopyFrom users={users} exclude={editing.user.id} onPick={(u) => setEditing({ ...editing, perms: permsOf(u) })} />
              </div>
              <AccessEditor schema={schema} value={editing.perms} onChange={(p) => setEditing({ ...editing, perms: p })} />
              <Button onClick={saveAccess} disabled={submitting} className="w-full btn-primary" data-testid="save-access-btn">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save access"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* OTP Verification Dialog */}
      <Dialog open={verifyDialog} onOpenChange={setVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <p className="text-muted-foreground text-center">
              We've emailed a 6-digit code to {formData.email || "the new user"}. Ask them for it and enter it below to finish adding them.
            </p>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="user-otp-input">
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button onClick={handleVerifyUser} disabled={submitting || otp.length !== 6} className="w-full btn-primary" data-testid="verify-user-btn">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & Create User"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this user? Their access will be immediately revoked and their licence freed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {seatsOpen && <BuySeatsDialog open={seatsOpen} onOpenChange={setSeatsOpen} />}

      <Card className="data-table">
        <Table mobileCards>
          <TableHeader>
            <TableRow>
              <TableHead data-card="title">User</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Licence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead data-card="actions">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <UserCog className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const pharmacist = !user.is_primary_admin && user.role !== "ADMIN";
                const off = !!user.disabled_at;
                return (
                  <TableRow key={user.id} id={`record-${user.id}`} data-testid={`user-row-${user.id}`} className={off ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          {user.role === "ADMIN" ? <ShieldCheck className="w-4 h-4 text-primary" /> : <span className="font-medium text-primary">{user.name?.charAt(0)?.toUpperCase()}</span>}
                        </div>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.is_primary_admin ? "Owner" : user.role === "ADMIN" ? "Admin" : "Pharmacist"}
                            {user.verified === false ? " · invite pending" : ""}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <p>{user.email}</p>
                      <p className="font-mono text-xs text-muted-foreground">{user.mobile}</p>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {pharmacist && schema ? (
                        <p className="text-xs font-semibold text-muted-foreground line-clamp-2" title={accessSummary(schema, user.access)}>
                          {accessSummary(schema, user.access)}
                        </p>
                      ) : (
                        <Badge className="bg-primary/20 text-primary border-primary/50">Full access</Badge>
                      )}
                    </TableCell>
                    <TableCell>{seatText(user)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.session ? (
                          <span className="flex items-center gap-1 text-xs font-bold text-emerald-600" title={`${user.session.device}${user.session.location ? ` · ${user.session.location}` : ""}`}>
                            <Circle className="w-2 h-2 fill-current" /> Online
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{off ? "Switched off" : "Signed out"}</span>
                        )}
                        {pharmacist && user.id !== me?.id && (
                          <Switch checked={!off} disabled={busy === user.id} onCheckedChange={(v) => setEnabled(user, v)} aria-label={off ? "Switch on" : "Switch off"} data-testid={`user-enabled-${user.id}`} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {pharmacist && (
                          <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setEditing({ user, perms: permsOf(user) })} data-testid={`edit-access-${user.id}`}>
                            <KeyRound className="w-4 h-4 mr-1" /> Access
                          </Button>
                        )}
                        {seatProblem(user) && (
                          <Button variant="ghost" size="sm" className="rounded-lg text-orange-600" disabled={busy === user.id} onClick={() => giveSeat(user)}>
                            <BadgeCheck className="w-4 h-4 mr-1" /> Give licence
                          </Button>
                        )}
                        {!user.is_primary_admin && user.id !== me?.id && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm({ open: true, userId: user.id })} className="text-destructive hover:text-destructive" data-testid={`delete-user-${user.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
