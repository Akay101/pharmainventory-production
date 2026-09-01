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
    <div className="p-4 bg-card border-t border-border flex flex-col items-center shrink-0">
      <form onSubmit={handleSubmit} className="w-full max-w-3xl relative flex items-center">
        <Input
          type="text"
          placeholder="Ask Pharmalogy Agent anything (e.g. 'Give all past 7 days purchases')..."
          value={localValue}
          onChange={handleChange}
          disabled={isLoading}
          className="pr-24 bg-background border-border/80 rounded-full h-14 shadow-lg focus-visible:ring-2 focus-visible:ring-orange-500 text-sm text-foreground placeholder:text-muted-foreground font-medium"
        />

        <div className="absolute right-2.5 flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenFollowup}
            className="h-9 w-9 rounded-full text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 transition-colors"
            title="Open Interactive Follow-up Form Modal"
          >
            <Mic className="w-4 h-4" />
          </Button>

          <Button
            type="submit"
            size="icon"
            disabled={!localValue.trim() || isLoading}
            className="h-9 w-9 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md shadow-orange-500/20 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>

      <p className="text-[10px] text-muted-foreground mt-2 text-center tracking-wide font-sans">
        Pharmalogy Agent can take actions on your behalf — always confirm before executing irreversible decisions.
      </p>
    </div>
  );
});

export default ChatInputBar;
