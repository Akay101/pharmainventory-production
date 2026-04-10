import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Bot, X, Sparkles, Send, Loader2, Play, 
  CheckCircle2, ChevronRight, Minimize2, Check, 
  History, Plus, Trash2, MessageSquarePlus, Clock, Search
} from "lucide-react";
import axios from "axios";
import { API } from "../../App";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
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
    <h2 className="text-md font-bold text-indigo-400/90 mb-2 mt-4 pb-1 border-b border-indigo-500/20">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="text-sm font-semibold text-primary mb-1 mt-3 underline decoration-indigo-500/30 underline-offset-4 decoration-2">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1.5 text-sm marker:text-indigo-500">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1.5 text-sm marker:text-indigo-500 marker:font-bold">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-extrabold text-indigo-400 bg-indigo-500/5 px-1 rounded-sm shadow-sm">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-indigo-500 flex items-start gap-2 pl-3 py-2 my-3 bg-indigo-500/10 italic rounded-r-lg text-sm shadow-inner ring-1 ring-indigo-500/5">
      <div className="pt-0.5"><Bot className="w-3.5 h-3.5 text-indigo-400" /></div>
      <div className="flex-1">{children}</div>
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="w-full overflow-x-auto rounded-lg border border-border my-3 shadow-sm bg-black/5 scrollbar-thin">
      <table className="w-full text-left text-xs border-collapse min-w-[500px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50 border-b border-border">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-muted/50 transition-colors">{children}</tr>,
  th: ({ children }) => <th className="p-2 font-semibold text-muted-foreground">{children}</th>,
  td: ({ children }) => <td className="p-2">{children}</td>,
  code: ({ inline, children }) => 
    inline ? (
      <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">{children}</code>
    ) : (
      <div className="bg-card border border-border rounded-lg p-3 my-3 overflow-x-auto shadow-inner">
        <code className="font-mono text-xs">{children}</code>
      </div>
    )
};

export default function AgentWidget({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "model",
      text: "Hello! I am your AI Pharmacy Assistant. ✨ \nI can help you analyze medicines, check side effects, or autonomously **create purchases and bills** for you. How can I assist you today?",
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, convId: null });
  
  // History & Multi-chat state
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(false);

  // Pending Action state
  const [pendingAction, setPendingAction] = useState(null);
  const [actionExecuting, setActionExecuting] = useState(false);
  const [isWider, setIsWider] = useState(false);
  const AXIOS_TIMEOUT = 60000; 

  const messagesEndRef = useRef(null);

  // Load draft and last active conversation on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(`agent_draft_${user?.id}`);
    if (savedDraft) setInputValue(savedDraft);

    const lastActiveId = localStorage.getItem(`agent_last_conv_${user?.id}`);
    if (lastActiveId) {
      handleSwitchConversation(lastActiveId);
    }
    
    fetchConversations();
  }, [user?.id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    
    if (pendingAction && !actionExecuting) {
      handleExecuteAction();
    }
    
    const lastMsg = messages[messages.length - 1];
    const isDetailed = lastMsg?.role === "model" && lastMsg?.text && (
      lastMsg.text.includes("| --- |") || 
      lastMsg.text.includes("## ") || 
      lastMsg.text.includes("\n- ") || 
      lastMsg.text.includes("\n* ") ||
      lastMsg.text.length > 350
    );
    setIsWider(isDetailed);
  }, [messages, pendingAction, actionExecuting]);

  // Prompt Drafting: Save to local storage on change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    localStorage.setItem(`agent_draft_${user?.id}`, value);
  };

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API}/chat/conversations`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      setConversations(res.data);
    } catch (err) {
      console.error("Failed to fetch conversations", err);
    }
  };

  const handleSwitchConversation = async (convId) => {
    setFetchingHistory(true);
    setShowHistory(false);
    try {
      const res = await axios.get(`${API}/chat/conversations/${convId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      setMessages(res.data.messages);
      setActiveConvId(convId);
      localStorage.setItem(`agent_last_conv_${user?.id}`, convId);
    } catch (err) {
      console.error("Failed to restore conversation", err);
      toast.error("Failed to load chat history");
    } finally {
      setFetchingHistory(false);
    }
  };

  const handleNewChat = () => {
    setMessages([{
      role: "model",
      text: "Hello! I am your AI Pharmacy Assistant. ✨ \nI can help you analyze medicines, check side effects, or autonomously **create purchases and bills** for you. How can I assist you today?",
    }]);
    setActiveConvId(null);
    setShowHistory(false);
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
      await axios.delete(`${API}/chat/conversations/${convId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) handleNewChat();
      toast.success("Chat deleted");
      setDeleteConfirm({ open: false, convId: null });
    } catch (err) {
      toast.error("Failed to delete chat");
    }
  };

  const handleSendMessage = async (e, directText = null) => {
    if (e) e.preventDefault();
    const userText = directText || inputValue.trim();
    if (!userText || isLoading) return;

    setInputValue("");
    localStorage.removeItem(`agent_draft_${user?.id}`);
    
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
          conversationHistory: messages
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          timeout: AXIOS_TIMEOUT
        }
      );

      const data = response.data; 

      if (data.conversationId && !activeConvId) {
        setActiveConvId(data.conversationId);
        localStorage.setItem(`agent_last_conv_${user?.id}`, data.conversationId);
        fetchConversations();
      }

      if (data.type === "action" && data.action) {
        setMessages((prev) => [...prev, { 
          role: "model", 
          text: data.content,
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
  };

  const handleExecuteAction = async () => {
    if (!pendingAction) return;
    setActionExecuting(true);
    const currentAction = pendingAction; 
    setPendingAction(null); 
    
    try {
      let endpoint = `${API}/chat/execute`;
      let method = 'post';
      let payload = currentAction.arguments;

      if (currentAction.function_name === 'create_purchase') {
         endpoint = `${API}/purchases`;
      } else if (currentAction.function_name === 'list_purchases') {
          endpoint = `${API}/purchases`;
          method = 'get';
          payload = { params: currentAction.arguments };
      } else if (currentAction.function_name === 'delete_purchase') {
          endpoint = `${API}/purchases/${currentAction.arguments.purchase_id}`;
          method = 'delete';
          payload = {};
      } else if (currentAction.function_name === 'check_price_history') {
          endpoint = `${API}/purchases/price-history`;
          method = 'get';
          payload = { params: currentAction.arguments };
      }

      const config = {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
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
      
      // (Data rendering logic remains same as before)
      if (currentAction.function_name === 'list_purchases' && response.data.purchases) {
        const p = response.data.purchases;
        if (p.length === 0) {
          successMsg = "📋 No purchases found.";
        } else {
          let table = `### 📋 Recent Purchases\n\n| Date | Supplier | Items | Total |\n|---|---|---|---|\n`;
          p.slice(0, 5).forEach(item => {
            const date = new Date(item.purchase_date).toLocaleDateString();
            const items = item.items.map(i => i.product_name).join(", ").substring(0, 30) + "...";
            table += `| ${date} | ${item.supplier_name} | ${items} | ₹${item.total_amount} |\n`;
          });
          successMsg = table;
        }
      } else if (currentAction.function_name === 'check_price_history' && response.data.all_historical_prices) {
        const prices = response.data.all_historical_prices;
        if (prices.length === 0) {
          successMsg = "📉 No price history found.";
        } else {
          let table = `### 💰 Price History: ${response.data.searched_product_name}\n\n| Date | Supplier | Pack Price | Unit Price |\n|---|---|---|---|\n`;
          prices.slice(0, 5).forEach(item => {
            const date = new Date(item.purchase_date).toLocaleDateString();
            table += `| ${date} | ${item.supplier_name} | ₹${item.pack_price} | ₹${item.price_per_unit.toFixed(2)} |\n`;
          });
          successMsg = table;
        }
      } else if (currentAction.function_name === 'create_purchase') {
        const p = response.data.purchase;
        successMsg = `✅ **Purchase Recorded Successfully!**\n\n**Supplier:** ${p.supplier_name}\n**Total Amount: ₹${p.total_amount}**`;
      }

      setMessages((prev) => [
        ...prev,
        { role: "model", text: successMsg }
      ]);
      
      if (currentAction.function_name === 'create_purchase' || currentAction.function_name === 'delete_purchase') {
          window.dispatchEvent(new Event('purchase_created_by_agent'));
          setIsWider(false);
      }
    } catch (error) {
      console.error(error);
      const err = error.response?.data?.detail || error.message;
      setMessages((prev) => [
        ...prev,
        { role: "model", text: "❌ **Failed to execute:** " + err }
      ]);
    } finally {
      setActionExecuting(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
        <AnimatePresence mode="wait">
          {isOpen && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95, width: 420 }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                scale: 1, 
                width: isWider ? 'min(700px, 90vw)' : 420,
                height: 'min(760px, 85vh)',
                maxHeight: '90vh'
              }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ 
                layout: { type: "spring", stiffness: 200, damping: 25 },
                width: { duration: 0.4, ease: "easeInOut" },
                height: { duration: 0.4, ease: "easeInOut" }
              }}
              className="mb-4 bg-card/95 backdrop-blur-3xl border border-white/10 rounded-[24px] shadow-2xl flex flex-col overflow-hidden ring-1 ring-indigo-500/20"
            >
              {/* Header */}
              <div className="p-4 border-b border-border bg-gradient-to-r from-indigo-500/10 to-purple-500/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg relative cursor-pointer"
                    onClick={() => {
                        setShowHistory(!showHistory);
                        fetchConversations();
                    }}
                  >
                    <Bot className="w-5 h-5 text-white" />
                    <Sparkles className="w-3 h-3 text-yellow-300 absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <div className="hidden sm:block overflow-hidden max-w-[140px]">
                    <h3 className="font-bold text-foreground text-sm truncate">
                       Agent History
                    </h3>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      Active
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`hover:bg-indigo-500/10 rounded-full ${showHistory ? 'text-indigo-400 bg-indigo-500/10' : 'text-muted-foreground'}`} 
                    onClick={() => {
                        setShowHistory(!showHistory);
                        fetchConversations();
                    }}
                    title="Chat History"
                  >
                    <History className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="hover:bg-red-500/10 rounded-full text-muted-foreground hover:text-red-400" 
                    onClick={handleNewChat}
                    title="New Conversation"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full" onClick={() => setIsOpen(false)}>
                    <Minimize2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden bg-card">
                {/* History Sidebar Backdrop Overlay */}
                <AnimatePresence>
                  {showHistory && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowHistory(false)}
                      className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-[40]"
                    />
                  )}
                </AnimatePresence>

                {/* History Sidebar Overlay */}
                <AnimatePresence>
                  {showHistory && (
                    <motion.div
                      initial={{ x: -400 }}
                      animate={{ x: 0 }}
                      exit={{ x: -400 }}
                      transition={{ type: "spring", damping: 25, stiffness: 200 }}
                      className="absolute inset-y-0 left-0 w-72 bg-card border-r border-border z-[50] flex flex-col shadow-2xl p-4 ring-1 ring-white/5"
                    >
                       <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/50">
                         <h4 className="font-bold text-sm flex items-center gap-2 text-indigo-400">
                           <Clock className="w-4 h-4" />
                           Past Chats
                         </h4>
                         <Button variant="ghost" size="icon" onClick={() => setShowHistory(false)} className="h-8 w-8 hover:bg-muted rounded-full">
                           <X className="w-4 h-4" />
                         </Button>
                       </div>

                       <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full mb-4 gap-2 border-indigo-500/30 hover:bg-indigo-500/10 hover:border-indigo-500/50 transition-all font-semibold"
                        onClick={handleNewChat}
                       >
                         <Plus className="w-4 h-4" /> Start New Session
                       </Button>

                       <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted">
                         {conversations.length === 0 ? (
                           <div className="flex flex-col items-center justify-center mt-12 opacity-40">
                             <Search className="w-8 h-8 mb-2" />
                             <p className="text-xs italic">No history yet</p>
                           </div>
                         ) : (
                           conversations.map((conv) => (
                             <div 
                              key={conv.id}
                              onClick={() => handleSwitchConversation(conv.id)}
                              className={`group relative p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                                activeConvId === conv.id 
                                ? "bg-indigo-500/15 border-indigo-500/40 shadow-sm" 
                                : "hover:bg-muted/50 border-transparent hover:border-border/50"
                              }`}
                             >
                                <div className="flex items-center gap-2 mb-1">
                                  <div className={`w-1.5 h-1.5 rounded-full ${activeConvId === conv.id ? 'bg-indigo-400' : 'bg-muted-foreground/30'}`} />
                                  <p className="text-xs font-bold truncate pr-6">{conv.title}</p>
                                </div>
                                <p className="text-[10px] text-muted-foreground truncate opacity-70 line-clamp-1 ml-3.5">
                                  {conv.last_message || "Empty chat..."}
                                </p>
                                <button 
                                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 hover:text-red-500 transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                             </div>
                           ))
                         )}
                       </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                  {fetchingHistory ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                      <p className="text-xs font-medium">Restoring conversation...</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {msg.role === "model" && (
                          <Avatar className="w-7 h-7 mr-2 mt-1 shadow-sm border border-border">
                            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs">
                              <Bot className="w-3.5 h-3.5" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        
                        <div className="max-w-[85%] flex flex-col gap-2">
                          <div
                            className={`rounded-2xl p-3 shadow-md ${
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-muted/50 border border-border backdrop-blur-sm rounded-tl-sm text-foreground"
                            }`}
                          >
                            {msg.role === "model" ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                {msg.text}
                              </ReactMarkdown>
                            ) : (
                              <p className="text-sm">{msg.text}</p>
                            )}
                          </div>
                          
                          {msg.role === "model" && msg.chips && msg.chips.length > 0 && idx === messages.length - 1 && !pendingAction && !isLoading && (
                            <div className="flex flex-wrap gap-2 mt-1 ml-2">
                              {msg.chips.map((opt, i) => (
                                <Button 
                                  key={i} 
                                  size="sm" 
                                  variant="outline" 
                                  className="rounded-full shadow-sm border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs h-7"
                                  onClick={() => handleSendMessage(null, opt)}
                                >
                                  {opt}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))
                  )}

                  {pendingAction && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="ml-9 flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl"
                    >
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-indigo-300 uppercase">Executing {pendingAction.function_name.replace(/_/g, ' ')}</span>
                      </div>
                    </motion.div>
                  )}

                  {isLoading && (
                    <div className="flex justify-start items-center ml-9 gap-1 h-6">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }} />
                      ))}
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 bg-muted/20 border-t border-border">
                  <form onSubmit={handleSendMessage} className="relative flex items-center">
                    <Input
                      type="text"
                      placeholder="Type your message or draft..."
                      value={inputValue}
                      onChange={handleInputChange}
                      disabled={isLoading || fetchingHistory}
                      className="pr-12 bg-card border-white/10 rounded-full h-12 shadow-sm focus-visible:ring-indigo-500/50 text-sm"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!inputValue.trim() || isLoading}
                      className="absolute right-1.5 h-9 w-9 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    >
                       <Send className="w-4 h-4 text-white ml-0.5" />
                    </Button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isOpen && (
           <motion.button
             initial={{ scale: 0 }}
             animate={{ scale: 1 }}
             whileHover={{ scale: 1.05 }}
             onClick={() => setIsOpen(true)}
             className="relative flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-2xl"
           >
             <Bot className="w-6 h-6" />
             <Sparkles className="w-3 h-3 text-yellow-300 absolute top-3 right-3" />
           </motion.button>
        )}
      </div>

      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat history?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
