import React, { useState, useEffect, useCallback } from "react";
import { AdminAPI, getActiveEnv, setActiveEnv, apiError } from "./api";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster, toast } from "sonner";
import { ShieldCheck, RefreshCw } from "lucide-react";

// Layout & Components
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import MobileBottomNav from "./components/MobileBottomNav";
import LeadNotesModal from "./components/LeadNotesModal";
import PharmacyDetailDrawer from "./components/PharmacyDetailDrawer";
import PromoGeneratorModal from "./components/PromoGeneratorModal";
import UserDetailDrawer from "./components/UserDetailDrawer";

// Pages
import LoginPage from "./pages/LoginPage";
import DashboardOverview from "./pages/DashboardOverview";
import LeadsCRM from "./pages/LeadsCRM";
import PharmaciesPage from "./pages/PharmaciesPage";
import PromoCodesPage from "./pages/PromoCodesPage";
import UsersPage from "./pages/UsersPage";
import AnalyticsFunnelPage from "./pages/AnalyticsFunnelPage";
import TeamManagementPage from "./pages/TeamManagementPage";
import PricingPage from "./pages/PricingPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import CreditsPage from "./pages/CreditsPage";
import SupportPage from "./pages/SupportPage";
import OfferLeadsPage from "./pages/OfferLeadsPage";
import GlobalDataPage from "./pages/GlobalDataPage";
import BroadcastsPage from "./pages/BroadcastsPage";

function MainDashboard() {
  const { isAuthenticated, isLoading } = useAuth();

  const [activeEnv, setEnvState] = useState(getActiveEnv());
  const [envStatus, setEnvStatus] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Data states
  const [metrics, setMetrics] = useState(null);
  const [trends, setTrends] = useState(null);
  const [leadsData, setLeadsData] = useState({ leads: [], summary: {} });
  const [pharmacies, setPharmacies] = useState([]);
  const [users, setUsers] = useState([]);
  const [promosData, setPromosData] = useState({ promo_codes: [], summary: {} });
  const [funnelData, setFunnelData] = useState(null);

  // Modal states
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadModalOpen, setLeadModalOpen] = useState(false);

  const [selectedPharmacyId, setSelectedPharmacyId] = useState(null);
  const [pharmacyModalOpen, setPharmacyModalOpen] = useState(false);

  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [supportUnread, setSupportUnread] = useState(0);
  const [offerPending, setOfferPending] = useState(0);
  const onOfferSummary = useCallback((s) => setOfferPending(s?.not_sent || 0), []);

  // 50-50 registrations still waiting for their code (sidebar badge)
  useEffect(() => {
    if (!isAuthenticated) return;
    AdminAPI.getOfferLeads({ limit: 1 })
      .then((r) => setOfferPending(r.data?.summary?.not_sent || 0))
      .catch(() => {});
  }, [isAuthenticated, activeEnv]);

  // Unread support queries for the sidebar badge
  useEffect(() => {
    if (!isAuthenticated) return;
    const check = () =>
      AdminAPI.getSupportTickets({ unread: 1, limit: 1 })
        .then((r) => setSupportUnread(r.data?.counts?.unread || 0))
        .catch(() => {});
    check();
    const t = setInterval(check, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [isAuthenticated, activeEnv]);

  // Fetch connection status
  const checkStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await AdminAPI.getEnvStatus();
      setEnvStatus(res.data.status);
    } catch (err) {
      console.warn("Could not fetch env status:", err);
    }
  }, [isAuthenticated]);

  // Fetch all dashboard data for active environment
  const loadAllData = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsRefreshing(true);
    try {
      const [
        metricsRes,
        trendsRes,
        leadsRes,
        pharmaciesRes,
        usersRes,
        promosRes,
        funnelRes,
      ] = await Promise.allSettled([
        AdminAPI.getMetrics(),
        AdminAPI.getTrends(),
        AdminAPI.getLeads({ limit: 100 }),
        AdminAPI.getPharmacies({ limit: 100 }),
        AdminAPI.getUsers({ limit: 1000 }), // the Users page filters client-side (incl. 50-50 users)
        AdminAPI.getPromos(),
        AdminAPI.getFunnel(),
      ]);

      if (metricsRes.status === "fulfilled") setMetrics(metricsRes.value.data);
      if (trendsRes.status === "fulfilled") setTrends(trendsRes.value.data);
      if (leadsRes.status === "fulfilled") {
        setLeadsData({
          leads: leadsRes.value.data.leads || [],
          summary: leadsRes.value.data.summary || {},
        });
      }
      if (pharmaciesRes.status === "fulfilled") {
        setPharmacies(pharmaciesRes.value.data.pharmacies || []);
      }
      if (usersRes.status === "fulfilled") {
        setUsers(usersRes.value.data.users || []);
      }
      if (promosRes.status === "fulfilled") {
        setPromosData({
          promo_codes: promosRes.value.data.promo_codes || [],
          summary: promosRes.value.data.summary || {},
        });
      }
      if (funnelRes.status === "fulfilled") setFunnelData(funnelRes.value.data);

      const failed = [metricsRes, leadsRes, pharmaciesRes].find(
        (r) => r.status === "rejected" && r.reason?.response?.status === 503
      );
      if (failed) {
        toast.error(
          `${activeEnv.toUpperCase()} database connection issue: ${
            failed.reason?.response?.data?.error || "Unreachable"
          }`
        );
      }
    } catch (err) {
      console.error("Data load error:", err);
      toast.error("Failed to fetch environment data");
    } finally {
      setIsRefreshing(false);
      checkStatus();
    }
  }, [activeEnv, isAuthenticated, checkStatus]);

  // Handle environment switch (Dev <-> Prod)
  const handleEnvChange = (newEnv) => {
    if (newEnv === activeEnv) return;
    setActiveEnv(newEnv);
    setEnvState(newEnv);
    toast.info(`Switched monitoring target to ${newEnv.toUpperCase()} database`);
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadAllData();
    }
  }, [activeEnv, isAuthenticated, loadAllData]);

  // Lead actions
  const handleMarkLeadConnected = async (leadId) => {
    try {
      await AdminAPI.markConnected(leadId);
      toast.success("Lead marked as connected!");
      loadAllData();
      if (selectedLead && selectedLead.lead_id === leadId) {
        setSelectedLead((prev) => ({
          ...prev,
          is_connected: true,
          crm_status: "CONNECTED",
          last_connected_at: new Date().toISOString(),
        }));
      }
    } catch (err) {
      toast.error("Failed to update lead");
    }
  };

  const handleAddLeadNote = async (leadId, noteData) => {
    try {
      const res = await AdminAPI.addLeadNote(leadId, noteData);
      toast.success("Note recorded successfully!");
      loadAllData();
      if (selectedLead && selectedLead.lead_id === leadId) {
        setSelectedLead((prev) => ({
          ...prev,
          is_connected: true,
          crm_status: "CONNECTED",
          last_connected_at: new Date().toISOString(),
          notes: [...(prev.notes || []), res.data.note],
        }));
      }
    } catch (err) {
      toast.error("Failed to save note");
    }
  };

  const handleLeadStatusChange = async (leadId, status) => {
    try {
      await AdminAPI.updateLeadStatus(leadId, { status });
      toast.success(`Stage updated to ${status}`);
      loadAllData();
      if (selectedLead && selectedLead.lead_id === leadId) {
        setSelectedLead((prev) => ({ ...prev, crm_status: status }));
      }
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  // Promo actions
  const handleGeneratePromo = async (payload) => {
    const res = await AdminAPI.generatePromo(payload);
    loadAllData();
    return res;
  };

  const handleTogglePromo = async (code) => {
    try {
      const res = await AdminAPI.togglePromo(code);
      toast.success(res.data.message);
      loadAllData();
    } catch (err) {
      toast.error(apiError(err, "Failed to toggle promo code"));
    }
  };

  const handleDeletePromo = async (code) => {
    if (!window.confirm(`Are you sure you want to delete promo code ${code}?`)) return;
    try {
      await AdminAPI.deletePromo(code);
      toast.success(`Promo code ${code} deleted`);
      loadAllData();
    } catch (err) {
      toast.error(apiError(err, "Failed to delete promo code"));
    }
  };

  // Open modals helper
  const openLeadModal = (lead) => {
    setSelectedLead(lead);
    setLeadModalOpen(true);
  };

  const openPharmacyModal = (pharmacyId) => {
    setSelectedPharmacyId(pharmacyId);
    setPharmacyModalOpen(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 mb-4 animate-pulse">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <div className="text-white font-bold text-sm tracking-wide">Validating Security Session...</div>
        <p className="text-xs text-slate-500 mt-1">DavaDesk Admin Control Deck</p>
      </div>
    );
  }

  // If not authenticated, render LoginPage
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col antialiased">
      {/* Desktop Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        leadCount={leadsData.summary?.fresh_uncontacted || 0}
        promoCount={promosData.summary?.active || 0}
        supportCount={supportUnread}
        offerCount={offerPending}
        activeEnv={activeEnv}
        envStatus={envStatus}
        isOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area (offset by sidebar on desktop) */}
      <div className="lg:pl-64 flex flex-col flex-1 pb-safe">
        {/* Top Header */}
        <Header
          activeEnv={activeEnv}
          onEnvChange={handleEnvChange}
          envStatus={envStatus}
          onRefresh={loadAllData}
          isRefreshing={isRefreshing}
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Dynamic Page Router */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {activeTab === "dashboard" && (
            <DashboardOverview
              metrics={metrics}
              trends={trends}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenLeadModal={openLeadModal}
              onOpenPharmacyModal={openPharmacyModal}
              activeEnv={activeEnv}
            />
          )}

          {activeTab === "support" && <SupportPage activeEnv={activeEnv} onUnreadChange={setSupportUnread} />}

          {activeTab === "offer5050" && <OfferLeadsPage activeEnv={activeEnv} onOpenUser={setSelectedUserId} onSummary={onOfferSummary} />}

          {activeTab === "leads" && (
            <LeadsCRM
              leads={leadsData.leads}
              summary={leadsData.summary}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onOpenLeadModal={openLeadModal}
              onMarkConnected={handleMarkLeadConnected}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === "pharmacies" && (
            <PharmaciesPage
              pharmacies={pharmacies}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onOpenPharmacyModal={openPharmacyModal}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === "promos" && (
            <PromoCodesPage
              promos={promosData.promo_codes}
              summary={promosData.summary}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onOpenGenerateModal={() => setPromoModalOpen(true)}
              onTogglePromo={handleTogglePromo}
              onDeletePromo={handleDeletePromo}
            />
          )}

          {activeTab === "users" && (
            <UsersPage
              users={users}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onOpenLeadModal={openLeadModal}
              onOpenPharmacyModal={openPharmacyModal}
              onOpenUser={setSelectedUserId}
            />
          )}

          {activeTab === "analytics" && (
            <AnalyticsFunnelPage funnelData={funnelData} metrics={metrics} />
          )}

          {activeTab === "team" && <TeamManagementPage />}

          {activeTab === "subscriptions" && <SubscriptionsPage activeEnv={activeEnv} />}

          {activeTab === "pricing" && <PricingPage activeEnv={activeEnv} />}

          {activeTab === "credits" && <CreditsPage activeEnv={activeEnv} />}

          {activeTab === "globaldata" && <GlobalDataPage activeEnv={activeEnv} />}

          {activeTab === "broadcasts" && <BroadcastsPage activeEnv={activeEnv} />}
        </main>
      </div>

      {/* Mobile Sticky Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        leadCount={leadsData.summary?.fresh_uncontacted || 0}
      />

      {/* Modals & Drawers */}
      <LeadNotesModal
        isOpen={leadModalOpen}
        onClose={() => {
          setLeadModalOpen(false);
          setSelectedLead(null);
        }}
        lead={selectedLead}
        onMarkConnected={handleMarkLeadConnected}
        onAddNote={handleAddLeadNote}
        onStatusChange={handleLeadStatusChange}
      />

      <PharmacyDetailDrawer
        isOpen={pharmacyModalOpen}
        onClose={() => {
          setPharmacyModalOpen(false);
          setSelectedPharmacyId(null);
        }}
        pharmacyId={selectedPharmacyId}
      />

      {selectedUserId && (
        <UserDetailDrawer
          key={`${activeEnv}:${selectedUserId}`}
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onChanged={loadAllData}
          onDeleted={() => {
            setSelectedUserId(null);
            loadAllData();
          }}
        />
      )}

      <PromoGeneratorModal
        isOpen={promoModalOpen}
        onClose={() => setPromoModalOpen(false)}
        onGenerate={handleGeneratePromo}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <MainDashboard />
    </AuthProvider>
  );
}
