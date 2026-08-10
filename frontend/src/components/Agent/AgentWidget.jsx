import React, { useState, useEffect, useRef, memo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Bot, X, Sparkles, Send, Loader2, Play, 
  CheckCircle2, ChevronRight, Minimize2, Maximize2, Check, 
  History, Plus, Trash2, MessageSquarePlus, Clock, Search,
  ShoppingCart, Receipt, Package, Layers, Mic, RotateCcw,
  ShieldCheck, ArrowUpRight, FileText, Activity, Users, AlertTriangle,
  Building2, TrendingUp, AlertCircle
} from "lucide-react";
import axios from "axios";
import { API } from "../../App";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import DraftPurchaseCard from "./DraftPurchaseCard";
import PurchaseTableCanvas from "./PurchaseTableCanvas";
import PurchaseFollowupModal from "./PurchaseFollowupModal";
import ChatInputBar from "./ChatInputBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

const MarkdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-sm break-words">{children}</p>,
  h1: ({ children }) => <h1 className="text-xl font-bold text-indigo-400 mb-2 mt-4 inline-flex items-center gap-2"><Sparkles className="w-5 h-5" />{children}</h1>,
  h2: ({ children }) => (
    <h2 className="text-md font-bold text-indigo-400/90 mb-2 mt-4 pb-1 border-b border-slate-800">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="text-sm font-semibold text-indigo-400 mb-1 mt-3 underline decoration-indigo-500/30 underline-offset-4 decoration-2">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1.5 text-sm marker:text-indigo-500">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1.5 text-sm marker:text-indigo-500 marker:font-bold">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-extrabold text-indigo-400 bg-indigo-500/10 px-1 rounded-sm">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-indigo-500 flex items-start gap-2 pl-3 py-2 my-3 bg-indigo-500/10 italic rounded-r-lg text-sm">
      <div className="pt-0.5"><Bot className="w-3.5 h-3.5 text-indigo-400" /></div>
      <div className="flex-1">{children}</div>
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-800 my-3 bg-[#0b0f19] scrollbar-thin">
      <table className="w-full text-left text-xs border-collapse min-w-[500px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#1e293b] border-b border-slate-800">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-slate-800">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-[#1e293b]/50 transition-colors">{children}</tr>,
  th: ({ children }) => <th className="p-2 font-semibold text-slate-400">{children}</th>,
  td: ({ children }) => <td className="p-2">{children}</td>,
  code: ({ inline, children }) => 
    inline ? (
      <code className="bg-[#1e293b] px-1.5 py-0.5 rounded font-mono text-xs text-indigo-300">{children}</code>
    ) : (
      <div className="bg-[#0b0f19] border border-slate-800 rounded-xl p-3 my-3 overflow-x-auto">
        <code className="font-mono text-xs text-indigo-300">{children}</code>
      </div>
    )
};

// Memoized Message Item with AI Gradient bubbles
const MessageBubble = memo(({ msg, isLast, pendingAction, isLoading, actionExecuting, onConfirmAction, onSendChip }) => {
  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      {msg.role === "model" && (
        <Avatar className="w-8 h-8 mr-3 mt-1 border border-slate-800 shadow-md shrink-0">
          <AvatarFallback className="bg-gradient-to-br from-indigo-500 via-purple-600 to-teal-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20">
            <Bot className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      )}
      
      <div className="max-w-[85%] flex flex-col gap-2">
        <div
          className={`rounded-2xl p-4 shadow-xl ${
            msg.role === "user"
              ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-teal-500 text-white rounded-tr-sm font-medium shadow-indigo-600/20"
              : "bg-[#0f172a] border border-slate-800 text-slate-100 rounded-tl-sm"
          }`}
        >
          {msg.role === "model" ? (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                {msg.text}
              </ReactMarkdown>

              {/* Render Rich Data Canvas Table if viewType is purchase_table */}
              {msg.viewType === "purchase_table" && msg.purchasesData && (
                <PurchaseTableCanvas purchasesData={msg.purchasesData} />
              )}

              {/* Render Draft Purchase Order Card if present */}
              {msg.draftState && (
                <DraftPurchaseCard 
                  draftState={msg.draftState}
                  isExecuting={actionExecuting}
                  onConfirm={onConfirmAction}
                />
              )}
            </>
          ) : (
            <p className="text-sm font-medium">{msg.text}</p>
          )}
        </div>
        
        {msg.role === "model" && msg.chips && msg.chips.length > 0 && isLast && !pendingAction && !isLoading && !msg.draftState?.recorded && (
          <div className="flex flex-wrap gap-2 mt-1 ml-1">
            {msg.chips.map((opt, i) => (
              <Button 
                key={i} 
                size="sm" 
                variant="outline" 
                className="rounded-xl border-indigo-500/30 bg-[#0f172a] hover:bg-[#1e293b] text-indigo-400 hover:text-indigo-300 text-xs h-7 font-medium shadow-sm"
                onClick={() => onSendChip(opt)}
              >
                {opt}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default function AgentWidget({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [leftNavTab, setLeftNavTab] = useState("agents"); // "agents" | "chats"
  
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, convId: null });
  
  // History & Multi-chat state
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);

  // Active Draft State for multi-turn agent workflows
  const [activeDraftState, setActiveDraftState] = useState(null);

  // Real-time Pharmacy Stats State
  const [pharmacyStats, setPharmacyStats] = useState({
    mtd_purchases: 0,
    low_stock_count: 0,
    active_suppliers: 0,
    supplier_dues: 0,
  });

  // Follow-up modal state
  const [followupModal, setFollowupModal] = useState({ open: false, question: "" });

  // Pending Action state
  const [pendingAction, setPendingAction] = useState(null);
  const [actionExecuting, setActionExecuting] = useState(false);
  const AXIOS_TIMEOUT = 60000; 

  const messagesEndRef = useRef(null);

  // Fetch real-time pharmacy stats
  const fetchPharmacyStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/chat/stats`);
      setPharmacyStats(res.data);
    } catch (err) {
      console.error("Failed to fetch pharmacy stats", err);
    }
  }, []);

  useEffect(() => {
    const lastActiveId = localStorage.getItem(`agent_last_conv_${user?.id}`);
    if (lastActiveId) {
      handleSwitchConversation(lastActiveId);
    }
    
    fetchConversations();
    fetchPharmacyStats();
  }, [user?.id, fetchPharmacyStats]);

  useEffect(() => {
    if (isOpen) {
      fetchPharmacyStats();
    }
  }, [isOpen, messages.length, fetchPharmacyStats]);

  // Smooth throttled scroll using requestAnimationFrame
  useEffect(() => {
    if (messagesEndRef.current) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
    
    if (pendingAction && !actionExecuting) {
      handleExecuteAction();
    }
  }, [messages.length, pendingAction, actionExecuting]);

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API}/chat/conversations`);
      setConversations(res.data);
    } catch (err) {
      console.error("Failed to fetch conversations", err);
    }
  };

  const handleSwitchConversation = async (convId) => {
    try {
      const res = await axios.get(`${API}/chat/conversations/${convId}`);
      setMessages(res.data.messages);
      setActiveConvId(convId);
      localStorage.setItem(`agent_last_conv_${user?.id}`, convId);
      
      const lastDraftMsg = [...res.data.messages].reverse().find(m => m.draftState);
      setActiveDraftState(lastDraftMsg ? lastDraftMsg.draftState : null);
    } catch (err) {
      console.error("Failed to restore conversation", err);
      toast.error("Failed to load chat history");
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setActiveConvId(null);
    setActiveDraftState(null);
    localStorage.removeItem(`agent_last_conv_${user?.id}`);
  };

  const handleDeleteConversation = (e, convId) => {
    e.stopPropagation();
    setDeleteConfirm({ open: true, convId });
  };

  const confirmDeleteChat = async () => {
    const { convId } = deleteConfirm;
    if (!convId) return;
    
    try {
      await axios.delete(`${API}/chat/conversations/${convId}`);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) handleNewChat();
      toast.success("Chat session deleted");
      setDeleteConfirm({ open: false, convId: null });
    } catch (err) {
      toast.error("Failed to delete chat session");
    }
  };

  const handleSendMessage = useCallback(async (userText) => {
    if (!userText || isLoading) return;
    
    const newMsg = { role: "user", text: userText };
    setMessages((prev) => [...prev, newMsg]);
    setPendingAction(null); 
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API}/chat`,
        {
          message: userText,
          conversationId: activeConvId,
          conversationHistory: messages,
          draftState: activeDraftState,
        },
        {
          timeout: AXIOS_TIMEOUT
        }
      );

      const data = response.data; 

      if (data.conversationId && !activeConvId) {
        setActiveConvId(data.conversationId);
        localStorage.setItem(`agent_last_conv_${user?.id}`, data.conversationId);
        fetchConversations();
      }

      if (data.draftState) {
        setActiveDraftState(data.draftState);
      }

      if (data.type === "action" && data.action) {
        setMessages((prev) => [...prev, { 
          role: "model", 
          text: data.content,
          viewType: data.viewType || null,
          purchasesData: data.purchasesData || null,
          draftState: data.draftState || null,
          chips: data.chips || [] 
        }]);

        setPendingAction({
          function_name: data.action.intent,
          arguments: data.action.data
        });
      } else {
        setMessages((prev) => [...prev, { 
          role: "model", 
          text: data.content || "I couldn't process that. Please try again.",
          viewType: data.viewType || null,
          purchasesData: data.purchasesData || null,
          draftState: data.draftState || null,
          chips: data.chips || []
        }]);
      }
    } catch (error) {
      console.error(error);
      const detail = error.code === 'ECONNABORTED' ? 'Request Timed Out' : (error.response?.data?.detail || error.message);
      setMessages((prev) => [
        ...prev,
        { role: "model", text: `❌ **Connection Error**: ${detail}.` }
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, activeConvId, messages, activeDraftState, user?.id]);

  const handleExecuteAction = async (directActionPayload = null) => {
    const actionToRun = directActionPayload || pendingAction;
    if (!actionToRun) return;
    
    setActionExecuting(true);
    if (!directActionPayload) setPendingAction(null);
    
    try {
      let endpoint = `${API}/chat/execute`;
      let method = 'post';
      let payload = actionToRun.arguments || actionToRun.data;

      if (actionToRun.function_name === 'create_purchase' || actionToRun.intent === 'create_purchase') {
         endpoint = `${API}/purchases`;
      } else if (actionToRun.function_name === 'list_purchases' || actionToRun.intent === 'list_purchases') {
          endpoint = `${API}/purchases`;
          method = 'get';
          payload = { params: payload };
      } else if (actionToRun.function_name === 'delete_purchase' || actionToRun.intent === 'delete_purchase') {
          endpoint = `${API}/purchases/${payload.purchase_id}`;
          method = 'delete';
          payload = {};
      } else if (actionToRun.function_name === 'check_price_history' || actionToRun.intent === 'check_price_history') {
          endpoint = `${API}/purchases/price-history`;
          method = 'get';
          payload = { params: payload };
      }

      const config = {
        timeout: AXIOS_TIMEOUT
      };

      let response;
      if (method === 'get') {
        response = await axios.get(endpoint, { ...config, ...payload });
      } else if (method === 'post') {
        response = await axios.post(endpoint, payload, config);
      } else if (method === 'delete') {
        response = await axios.delete(endpoint, config);
      }

      let successMsg = "✅ **Action Executed Successfully!**";
      
      if (actionToRun.function_name === 'create_purchase' || actionToRun.intent === 'create_purchase') {
        const p = response.data.purchase;
        successMsg = `🎉 **Purchase Recorded Successfully!**\n\n- **Supplier**: ${p.supplier_name}\n- **Invoice**: ${p.invoice_no || "N/A"}\n- **Total Paid/Amount**: **₹${p.total_amount.toFixed(2)}**`;
        
        // Mark all draft cards in messages history as recorded locally
        setMessages((prev) =>
          prev.map((m) =>
            m.draftState ? { ...m, draftState: { ...m.draftState, recorded: true, purchase_id: p.id } } : m
          )
        );

        // Persist recorded status to MongoDB so refreshed chats maintain recorded state
        if (activeConvId) {
          try {
            await axios.post(`${API}/chat/mark-recorded`, {
              conversationId: activeConvId,
              purchase_id: p.id,
            });
          } catch (markErr) {
            console.error("Failed to persist mark-recorded to DB:", markErr);
          }
        }

        setActiveDraftState(null);
        toast.success("Purchase recorded successfully!");
        fetchPharmacyStats();
      }

      setMessages((prev) => [
        ...prev,
        { role: "model", text: successMsg }
      ]);
      
      if (actionToRun.function_name === 'create_purchase' || actionToRun.intent === 'create_purchase' || actionToRun.function_name === 'delete_purchase') {
          window.dispatchEvent(new Event('purchase_created_by_agent'));
      }
    } catch (error) {
      console.error(error);
      const err = error.response?.data?.detail || error.message;
      setMessages((prev) => [
        ...prev,
        { role: "model", text: "❌ **Execution Error:** " + err }
      ]);
      toast.error("Execution Error: " + err);
    } finally {
      setActionExecuting(false);
    }
  };

  const userName = user?.name || user?.email?.split("@")[0] || "Pharmacist";

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <button
            onClick={() => setIsOpen(true)}
            className="relative flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-600 via-purple-600 to-teal-500 text-white rounded-full shadow-2xl shadow-indigo-600/30 ring-2 ring-indigo-400/30 hover:scale-105 transition-all"
          >
            <Bot className="w-6 h-6" />
            <Sparkles className="w-3.5 h-3.5 text-yellow-300 absolute top-2.5 right-2.5 animate-pulse" />
          </button>
        </div>
      )}

      {/* FULL AGENTIC WORKSPACE CONTAINER (ZERO BLURS, FAST PERFORMANCE) */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] bg-[#090d16] text-slate-100 flex flex-col font-sans select-none overflow-hidden animate-in fade-in duration-150">
          {/* Top Bar Header with Pharmalogy AI Gradients */}
          <div className="h-14 border-b border-slate-800 bg-[#0f172a] px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                You are in Pharmalogy's Agentic Workspace
              </h2>

              <Badge variant="outline" className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/30 text-xs px-2.5 py-0.5 font-semibold">
                Pharmacy • AI Mode
              </Badge>

              <div className="flex items-center gap-1.5 text-emerald-400 text-xs bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                4 agents live
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewChat}
                title="Reset Workspace"
                className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs gap-1.5 rounded-lg"
              >
                <X className="w-3.5 h-3.5" /> Exit AI mode
              </Button>
            </div>
          </div>

          {/* Main Workspace Body */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* 1. Slim Icon Navigation Rail */}
            <div className="w-14 bg-[#0b0f19] border-r border-slate-800/80 flex flex-col items-center py-4 gap-4 shrink-0">
              <button
                onClick={() => setLeftNavTab("chats")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  leftNavTab === "chats" ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:bg-slate-800/60"
                }`}
                title="Past Chats"
              >
                <History className="w-5 h-5" />
              </button>

              <button
                onClick={() => setLeftNavTab("agents")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  leftNavTab === "agents" ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:bg-slate-800/60"
                }`}
                title="Active Agents & Metrics"
              >
                <Bot className="w-5 h-5" />
              </button>
            </div>

            {/* 2. Secondary Left Sidebar Panel */}
            <div className="w-64 bg-[#0f172a] border-r border-slate-800 flex flex-col min-h-0 shrink-0">
              {leftNavTab === "agents" ? (
                /* Active Agents & Live Pharmacy Context */
                <div className="p-4 flex-1 overflow-y-auto space-y-5 scrollbar-thin text-xs">
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                      ACTIVE DOMAIN AGENTS
                    </h4>
                    <div className="space-y-1.5">
                      <div className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-600/15 to-purple-600/15 border border-indigo-500/30 flex items-center justify-between shadow-sm">
                        <div>
                          <span className="font-bold text-indigo-300 block text-xs">Purchase Agent</span>
                          <span className="text-[10px] text-slate-400">PO & Price History</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#1e293b]/40 border border-slate-800/60 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-300 block text-xs">Billing Agent</span>
                          <span className="text-[10px] text-slate-400">Invoices & Discounts</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#1e293b]/40 border border-slate-800/60 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-300 block text-xs">Inventory Agent</span>
                          <span className="text-[10px] text-slate-400">Stock & Expiry</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#1e293b]/40 border border-slate-800/60 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-300 block text-xs">Supplier Agent</span>
                          <span className="text-[10px] text-slate-400">Dues & Ledger</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Draft Session Context */}
                  <div className="pt-2 border-t border-slate-800">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      SESSION CONTEXT
                    </h4>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex justify-between text-slate-400">
                        <span>Active Supplier:</span>
                        <span className="text-slate-200 font-medium truncate max-w-[120px]">
                          {activeDraftState?.supplier_name || "None selected"}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Draft Items:</span>
                        <span className="font-mono text-slate-200">
                          {activeDraftState?.items ? activeDraftState.items.length : 0} pkts
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Draft Total:</span>
                        <span className="font-mono text-indigo-400 font-bold">
                          ₹{(activeDraftState?.total_amount || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Pharmacy Metrics (No Hardcoded Numbers) */}
                  <div className="pt-2 border-t border-slate-800">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      PHARMACY METRICS
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="p-2 rounded-lg bg-[#1e293b]/50 border border-slate-800">
                        <span className="text-xs font-bold text-rose-400 block font-mono">
                          {pharmacyStats.low_stock_count}
                        </span>
                        <span className="text-[9px] text-slate-400">Low Stock Alerts</span>
                      </div>
                      <div className="p-2 rounded-lg bg-[#1e293b]/50 border border-slate-800">
                        <span className="text-xs font-bold text-indigo-400 block font-mono">
                          {pharmacyStats.active_suppliers}
                        </span>
                        <span className="text-[9px] text-slate-400">Suppliers</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      SPEND OVERVIEW
                    </h4>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">MTD Purchases:</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          ₹{(pharmacyStats.mtd_purchases || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Supplier Dues:</span>
                        <span className="font-mono text-amber-400 font-bold">
                          ₹{(pharmacyStats.supplier_dues || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Past Chats Sidebar Tab */
                <div className="p-4 flex-1 flex flex-col min-h-0 text-xs">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-xs text-slate-300">PAST SESSIONS</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleNewChat}
                      className="h-7 text-[11px] text-indigo-400 hover:bg-indigo-500/10 gap-1 rounded-lg font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> NEW
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                    {conversations.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 italic">No history yet</div>
                    ) : (
                      conversations.map((conv) => (
                        <div
                          key={conv.id}
                          onClick={() => handleSwitchConversation(conv.id)}
                          className={`group relative p-2.5 rounded-xl border cursor-pointer transition-all ${
                            activeConvId === conv.id
                              ? "bg-indigo-600/20 border-indigo-500/40 font-semibold"
                              : "border-transparent hover:bg-slate-800/60"
                          }`}
                        >
                          <p className="text-xs truncate pr-6 text-slate-200">{conv.title}</p>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{conv.last_message || "Empty..."}</p>
                          <button
                            onClick={(e) => handleDeleteConversation(e, conv.id)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Central Canvas Workspace */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#090d16] relative">
              {/* Message Stream or Empty Welcome View */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth scrollbar-thin">
                {messages.length === 0 ? (
                  /* Custom Pharmacy Welcome View with AI Gradients */
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto my-auto py-12">
                    <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-teal-500 flex items-center justify-center text-white shadow-2xl shadow-indigo-600/30 mb-5 ring-4 ring-indigo-500/20">
                      <Sparkles className="w-8 h-8" />
                    </div>

                    <h1 className="text-2xl font-bold text-slate-100 mb-2">
                      Hello, {userName}
                    </h1>
                    <p className="text-sm text-slate-400 mb-8">
                      What would you like help with today in your pharmacy workspace?
                    </p>

                    <div className="grid grid-cols-2 gap-4 w-full text-left">
                      <div
                        onClick={() => setFollowupModal({ open: true, question: "Provide medicine, supplier & quantity to create purchase:" })}
                        className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition-all group shadow-lg"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                            <ShoppingCart className="w-4 h-4" />
                          </div>
                          <h4 className="font-bold text-sm text-slate-200 group-hover:text-indigo-400 transition-colors">New Purchase Order</h4>
                        </div>
                        <p className="text-xs text-slate-400">Automate your purchase workflow with interactive follow-up forms.</p>
                      </div>

                      <div
                        onClick={() => handleSendMessage("I want to create a bill")}
                        className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-purple-500/50 cursor-pointer transition-all group shadow-lg"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                            <Receipt className="w-4 h-4" />
                          </div>
                          <h4 className="font-bold text-sm text-slate-200 group-hover:text-purple-400 transition-colors">Quick Billing</h4>
                        </div>
                        <p className="text-xs text-slate-400">Generate bills, apply discounts & manage patient checkouts.</p>
                      </div>

                      <div
                        onClick={() => handleSendMessage("Show low stock and expiring medicines")}
                        className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-rose-500/50 cursor-pointer transition-all group shadow-lg"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                            <AlertCircle className="w-4 h-4" />
                          </div>
                          <h4 className="font-bold text-sm text-slate-200 group-hover:text-rose-400 transition-colors">Stock & Expiry Alerts</h4>
                        </div>
                        <p className="text-xs text-slate-400">Review medicines below shortage thresholds & near expiry.</p>
                      </div>

                      <div
                        onClick={() => handleSendMessage("Give all past 7 days purchases")}
                        className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-all group shadow-lg"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                            <FileText className="w-4 h-4" />
                          </div>
                          <h4 className="font-bold text-sm text-slate-200 group-hover:text-emerald-400 transition-colors">Business Analytics</h4>
                        </div>
                        <p className="text-xs text-slate-400">Render rich interactive purchase data canvas tables & reports.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <MessageBubble
                      key={idx}
                      msg={msg}
                      isLast={idx === messages.length - 1}
                      pendingAction={pendingAction}
                      isLoading={isLoading}
                      actionExecuting={actionExecuting}
                      onConfirmAction={() => handleExecuteAction({
                        intent: "create_purchase",
                        data: msg.draftState
                      })}
                      onSendChip={(chipText) => handleSendMessage(chipText)}
                    />
                  ))
                )}

                {pendingAction && (
                  <div className="ml-11 flex items-center gap-3 p-3 bg-[#0f172a] border border-slate-800 rounded-xl">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-wide">
                      Executing Agent Action: {pendingAction.function_name.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}

                {isLoading && (
                  <div className="flex justify-start items-center ml-11 gap-1.5 h-6">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce-custom"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Floating Bottom Prompt Bar (Uncoupled from typing re-renders) */}
              <ChatInputBar
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                userId={user?.id}
                onOpenFollowup={() => setFollowupModal({ open: true, question: "Provide product, supplier & quantity:" })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Interactive Follow-up Details Modal */}
      <PurchaseFollowupModal
        isOpen={followupModal.open}
        onClose={() => setFollowupModal({ open: false, question: "" })}
        questionText={followupModal.question}
        onSubmit={(payload) => {
          const textMsg = `Create purchase for ${payload.product_name} ${payload.quantity} packs from ${payload.supplier_name}`;
          handleSendMessage(textMsg);
        }}
      />

      {/* Delete Chat Confirmation Dialog */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}>
        <AlertDialogContent className="bg-[#0f172a] border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete this chat session?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteChat} className="bg-rose-600 text-white hover:bg-rose-500">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
