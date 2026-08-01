import { Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { INPUT_DISCLAIMER_TH } from "./assistant.config";

export interface ChatComposerProps {
  readonly onSend: (text: string) => void;
}

/**
 * The chat input. On submit it sends the (non-empty) question and clears — a real action that grows
 * the conversation. The disclaimer under it states plainly that answers are scripted, not a live LLM.
 */
export function ChatComposer({ onSend }: ChatComposerProps): JSX.Element {
  const [text, setText] = useState("");

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="flex flex-col gap-1">
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="สอบถามข้อมูลเชิงลึก"
          placeholder="สอบถามข้อมูลเชิงลึก…"
          className="h-11 flex-1 rounded-control border border-outline-variant bg-surface-container-lowest px-4 text-sm text-on-surface placeholder:text-on-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
        <Button type="submit" variant="primary" size="icon" aria-label="ส่งคำถาม">
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
      <p className="text-xs text-on-surface-variant">{INPUT_DISCLAIMER_TH}</p>
    </div>
  );
}
