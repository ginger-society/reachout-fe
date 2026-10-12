import { useCallback, useState } from "react";
import ConversationQueue from "@/components/organisms/ConversationQueue/ConversationQueue";
import ChatPanel from "@/components/organisms/ChatPanel/ChatPanel";
import PeekPanel from "@/components/organisms/PeekPanel/PeekPanel";
import { useChatDesk } from "@/hooks/useChatDesk";
import { currentAgent, teammates } from "@/mocks/agents";
import { quickReplies } from "@/mocks/quickReplies";
import { createMockThreads } from "@/mocks/supportThreads";
import { PeekAnchor, PeekMode } from "@/utils/peek";
import styles from "./supportDashboard.module.scss";

interface PeekState {
  id: string;
  mode: PeekMode;
  anchor: PeekAnchor;
}

const SupportDashboardPage = () => {
  // Swap the mocks for your API data when it's ready
  const desk = useChatDesk(createMockThreads, currentAgent.sites, currentAgent.status);
  const [peek, setPeek] = useState<PeekState | null>(null);

  // Only a chat that is still waiting in the queue can be peeked at.
  // If it gets picked up or transferred, the peek closes on its own.
  const peeked = peek
    ? desk.threads.find((t) => t.id === peek.id && t.state === "queued")
    : undefined;

  const closePeek = useCallback(
    (returnFocus: boolean) => {
      const id = peek?.id;
      setPeek(null);
      if (returnFocus && id) {
        // hand focus back to the eye button we came from
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-peek-for="${id}"]`)?.focus()
        );
      }
    },
    [peek?.id]
  );

  // Hover glance: ignored while another peek is pinned
  const glance = (id: string, anchor: PeekAnchor) => {
    setPeek((cur) => (cur?.mode === "pinned" ? cur : { id, mode: "glance", anchor }));
    desk.markRead(id); // the agent has now seen the messages
  };

  // Pointer left the eye: a glance disappears, a pinned peek stays
  const glanceEnd = (id: string) => {
    setPeek((cur) => (cur && cur.mode === "glance" && cur.id === id ? null : cur));
  };

  // Click the eye: pin it (reveals quick replies), or unpin if already pinned
  const togglePin = (id: string, anchor: PeekAnchor) => {
    setPeek((cur) =>
      cur?.id === id && cur.mode === "pinned" ? null : { id, mode: "pinned", anchor }
    );
    desk.markRead(id);
  };

  const handleLogout = () => {
    // TODO: clear the session / token and navigate to your login route
    console.warn("Logout is not wired up yet");
  };

  return (
    <div className={styles.root}>
      <ConversationQueue
        agent={currentAgent}
        status={desk.status}
        onStatusChange={desk.setStatus}
        onLogout={handleLogout}
        threads={desk.queue}
        waitingCount={desk.waitingCount}
        siteOptions={desk.siteOptions}
        siteValue={desk.siteValue}
        onSiteChange={desk.setSiteFilter}
        openCount={desk.openCount}
        maxOpen={desk.maxOpen}
        onOpenThread={desk.openThread}
        peekId={peeked ? peeked.id : null}
        peekPinned={peek?.mode === "pinned"}
        onPeekGlance={glance}
        onPeekGlanceEnd={glanceEnd}
        onPeekToggle={togglePin}
      />

      <main className={styles.board}>
        {desk.open.length === 0 ? (
          <div className={styles.empty}>
            <strong>No chats open</strong>
            <span>Pick a conversation from the list to start replying.</span>
          </div>
        ) : (
          desk.open.map((thread) => (
            <ChatPanel
              key={thread.id}
              thread={thread}
              agents={teammates}
              onSend={desk.sendMessage}
              onUpdateCustomer={desk.updateCustomer}
              onTransfer={desk.transferThread}
              onResolve={desk.resolveThread}
            />
          ))
        )}
      </main>

      {peek && peeked && (
        <PeekPanel
          thread={peeked}
          mode={peek.mode}
          anchor={peek.anchor}
          replies={quickReplies}
          atCapacity={desk.atCapacity}
          maxOpen={desk.maxOpen}
          onReply={desk.sendMessage}
          onPickUp={desk.openThread}
          onClose={closePeek}
        />
      )}
    </div>
  );
};

export default SupportDashboardPage;