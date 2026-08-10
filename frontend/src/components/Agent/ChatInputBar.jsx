import React, { useState, useEffect, memo } from "react";
import { Send, Mic } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const ChatInputBar = memo(({ onSendMessage, isLoading, userId, onOpenFollowup }) => {
  const [localValue, setLocalValue] = useState("");

  useEffect(() => {
    if (userId) {
      const savedDraft = localStorage.getItem(`agent_draft_${userId}`);
      if (savedDraft) setLocalValue(savedDraft);
    }
  }, [userId]);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalValue(val);
    if (userId) {
      localStorage.setItem(`agent_draft_${userId}`, val);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = localValue.trim();
    if (!text || isLoading) return;

    setLocalValue("");
    if (userId) {
      localStorage.removeItem(`agent_draft_${userId}`);
    }

    onSendMessage(text);
  };

  return (
    <div className="p-4 bg-[#090d16] border-t border-slate-800/80 flex flex-col items-center shrink-0">
      <form onSubmit={handleSubmit} className="w-full max-w-3xl relative flex items-center">
        <Input
          type="text"
          placeholder="Ask Pharmalogy Agent anything (e.g. 'Give all past 7 days purchases')..."
          value={localValue}
          onChange={handleChange}
          disabled={isLoading}
          className="pr-24 bg-[#0f172a] border-slate-800 rounded-full h-14 shadow-2xl focus-visible:ring-2 focus-visible:ring-indigo-500 text-sm text-slate-100 placeholder:text-slate-500 font-medium"
        />

        <div className="absolute right-2.5 flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenFollowup}
            className="h-9 w-9 rounded-full text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
            title="Open Interactive Follow-up Form Modal"
          >
            <Mic className="w-4 h-4" />
          </Button>

          <Button
            type="submit"
            size="icon"
            disabled={!localValue.trim() || isLoading}
            className="h-9 w-9 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-teal-500 hover:opacity-95 text-white shadow-lg shadow-indigo-600/30 transition-all"
          >
             <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>

      <p className="text-[10px] text-slate-500 mt-2 text-center tracking-wide font-sans">
        Pharmalogy Agent can take actions on your behalf — always confirm before executing irreversible decisions.
      </p>
    </div>
  );
});

export default ChatInputBar;
