import { useState, useEffect } from "react";
import axios from "axios";
import { API, useAuth } from "../App";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../components/ui/input-otp";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Plus, UserCog, Trash2, Loader2, Shield, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState("");
  const [otp, setOtp] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    role: "PHARMACIST",
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/users`);
      setUsers(response.data.users);
    } catch (error) {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.name || !formData.email || !formData.mobile || !formData.password) {
      toast.error("Please fill all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/users`, formData);
      setPendingId(response.data.pending_id);
      setDialogOpen(false);
      setVerifyDialog(true);
      toast.success("OTP sent to primary admin for verification");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create user");
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
      const formDataObj = new FormData();
      formDataObj.append("pending_id", pendingId);
      formDataObj.append("otp", otp);

      await axios.post(`${API}/users/verify`, formDataObj);
      toast.success("User created successfully!");
      setVerifyDialog(false);
      setOtp("");
      setPendingId("");
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    try {
      await axios.delete(`${API}/users/${userId}`);
      toast.success("User deleted successfully");
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete user");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      mobile: "",
      password: "",
      role: "PHARMACIST",
    });
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="users-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">{users.length} users in your pharmacy</p>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-user-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  data-testid="user-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="user@pharmacy.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="user-email-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Mobile *</Label>
                <Input
                  placeholder="+91 9876543210"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  data-testid="user-mobile-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Password *</Label>
                <Input
                  type="password"
                  placeholder="Min 6 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  data-testid="user-password-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v })}
                >
                  <SelectTrigger data-testid="user-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="PHARMACIST">Pharmacist</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pharmacists have restricted access to user management and settings
                </p>
              </div>

              <Button
                onClick={handleCreateUser}
                disabled={submitting}
                className="w-full btn-primary"
                data-testid="create-user-btn"
              >
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

        {/* OTP Verification Dialog */}
        <Dialog open={verifyDialog} onOpenChange={setVerifyDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Verify New User</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 pt-4">
              <p className="text-muted-foreground text-center">
                An OTP has been sent to the primary admin's email. Enter it below to complete user creation.
              </p>

              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="user-otp-input">
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button
                onClick={handleVerifyUser}
                disabled={submitting || otp.length !== 6}
                className="w-full btn-primary"
                data-testid="verify-user-btn"
              >
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
      </div>

      {/* Users Table */}
      <Card className="data-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
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
              users.map((user) => (
                <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        {user.role === "ADMIN" ? (
                          <ShieldCheck className="w-4 h-4 text-primary" />
                        ) : (
                          <span className="font-medium text-primary">
                            {user.name?.charAt(0)?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        {user.is_primary_admin && (
                          <p className="text-xs text-primary">Primary Admin</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{user.email}</TableCell>
                  <TableCell className="font-mono text-sm">{user.mobile}</TableCell>
                  <TableCell>
                    {user.role === "ADMIN" ? (
                      <Badge className="bg-primary/20 text-primary border-primary/50">Admin</Badge>
                    ) : (
                      <Badge className="bg-accent/20 text-accent border-accent/50">Pharmacist</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {!user.is_primary_admin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`delete-user-${user.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
