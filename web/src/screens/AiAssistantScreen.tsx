import { useState } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Badge } from "@/components/ui/badge";
import { AssistantSidebar } from "@/features/assistant/AssistantSidebar";
import { ChatComposer } from "@/features/assistant/ChatComposer";
import { ChatMessage } from "@/features/assistant/ChatMessage";
import { answerFor, INITIAL_CONVERSATION, type ChatTurn } from "@/features/assistant/assistantModel";

/**
 * AI Assistant (Stitch S9, PR-16) — a SCRIPTED assistant. Asking a question (typed or via a suggested
 * chip) appends a user turn and a canned answer — a real action, no live LLM. Every answer is badged
 * SIMULATED. The `<h1>` renders synchronously carrying the nav label ("ผู้ช่วยอัจฉริยะ") for router T4.
 */
export function AiAssistantScreen(): JSX.Element {
  const [conversation, setConversation] = useState<readonly ChatTurn[]>(INITIAL_CONVERSATION);
  const [next, setNext] = useState(INITIAL_CONVERSATION.length);

  const ask = (text: string): void => {
    const user: ChatTurn = { id: `m${next}`, role: "user", text };
    const assistant: ChatTurn = { id: `m${next + 1}`, role: "assistant", answer: answerFor(text) };
    setConversation((prev) => [...prev, user, assistant]);
    setNext((n) => n + 2);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="ai-assistant">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-on-surface">ผู้ช่วยอัจฉริยะ · AI Assistant</h1>
        <Badge variant="outline">LLM Thai-optimized</Badge>
        <SimulatedBadge />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <div className="flex flex-col gap-4" data-testid="conversation">
            {conversation.map((turn) => (
              <ChatMessage key={turn.id} turn={turn} />
            ))}
          </div>
          <ChatComposer onSend={ask} />
        </div>
        <div className="lg:col-span-4">
          <AssistantSidebar onAsk={ask} />
        </div>
      </div>
      <footer className="flex items-center gap-2 text-sm text-on-surface-variant">
        <SimulatedBadge /> คำตอบทั้งหมดเป็นสคริปต์จำลองเพื่อการสาธิต — ไม่ใช่ผลจาก LLM หรือข้อมูลจริงของ กปภ.
      </footer>
    </div>
  );
}
