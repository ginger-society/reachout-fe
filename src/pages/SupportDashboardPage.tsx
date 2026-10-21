import { useCallback, useContext, useEffect, useState } from "react";
import {
  AuthContext,
  AuthContextInterface,
  SnackbarTimer,
  useSnackbar,
} from "@ginger-society/ginger-ui";
import ChatPanel from "@/components/organisms/ChatPanel/ChatPanel";
import ConversationQueue from "@/components/organisms/ConversationQueue/ConversationQueue";
import PeekPanel from "@/components/organisms/PeekPanel/PeekPanel";
import SessionGuard from "@/components/organisms/SessionGuard/SessionGuard";
import { useChatDesk } from "@/hooks/useChatDesk";
import { currentAgent, mockAvatarFor, teammates } from "@/mocks/agents";
import { quickReplies } from "@/mocks/quickReplies";
import { AgentProfile } from "@/types/chat";
import { PeekAnchor, PeekMode } from "@/utils/peek";
import { ValidateTokenResponse } from "@/services/IAMService_client";
import styles from "./supportDashboard.module.scss";

interface PeekState {
  id: string;
  mode: PeekMode;
  anchor: PeekAnchor;
}

/** Display name of the signed-in user: same rule as the header. */
const nameOf = (user: ValidateTokenResponse) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ") || user.sub.split("@")[0];

const Desk = ({ user }: { user: ValidateTokenResponse }) => {
  const agentId = Number(user.userId); // the backend keys agents by this numeric id
  const name = nameOf(user);
  // name + picture are what the visitor sees in the widget once this agent takes their chat
  const desk = useChatDesk({ agentId, profile: { name, avatarUrl: mockAvatarFor(user.sub) } });
  const { show } = useSnackbar();
  const [peek, setPeek] = useState<PeekState | null>(null);

  const agent: AgentProfile = {
    id: String(agentId),
    name,
    email: user.sub,
    color: currentAgent.color,
    status: "available",
    sites: [],
  };

  // Errors from the desk (failed send, pick-up conflicts, expired session ...) go to the snackbar.
  const { error, dismissError } = desk;
  useEffect(() => {
    if (!error) return;
    show(<div>{error}</div>, SnackbarTimer.Long, true);
    dismissError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // Tell the agent when the live streams drop (they reconnect on their own).
  useEffect(() => {
    if (desk.connection === "offline") {
      show(<div>Connection lost. Reconnecting…</div>, SnackbarTimer.Long, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk.connection]);

  // Only a chat that is still waiting in the queue can be peeked at.
  // If it gets picked up, taken by someone else, or the visitor leaves, the peek closes on its own.
  const peeked = peek ? desk.threads.find((t) => t.id === peek.id && t.state === "queued") : undefined;

  const closePeek = useCallback(
    (returnFocus: boolean) => {
      const id = peek?.id;
      setPeek(null);
      if (returnFocus && id) {
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-peek-for="${id}"]`)?.focus());
      }
    },
    [peek?.id]
  );

  const glance = (id: string, anchor: PeekAnchor) => {
    setPeek((cur) => (cur?.mode === "pinned" ? cur : { id, mode: "glance", anchor }));
    desk.markRead(id);
  };

  const glanceEnd = (id: string) => {
    setPeek((cur) => (cur && cur.mode === "glance" && cur.id === id ? null : cur));
  };

  const togglePin = (id: string, anchor: PeekAnchor) => {
    setPeek((cur) => (cur?.id === id && cur.mode === "pinned" ? null : { id, mode: "pinned", anchor }));
    desk.markRead(id);
  };

  const handleLogout = () => {
    // TODO: clear the session / token and navigate to your login route
    console.warn("Logout is not wired up yet");
  };

  return (
    <div className={styles.root}>
      <ConversationQueue
        agent={agent}
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
              agents={teammates /* TODO: real agent list */}
              onSend={desk.sendMessage}
              onTyping={desk.setAgentTyping}
              onUpdateCustomer={desk.updateCustomer}
              onTransfer={desk.transferThread}
              onResolve={desk.resolveThread}
              onDismissClosed={desk.dismissClosedThread}
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

/** The signed-in agent comes from AuthContext (the validate-token response): no token decoding here. */
const SupportDashboardPage = () => {
  const { user } = useContext<AuthContextInterface<ValidateTokenResponse>>(AuthContext);

  if (!user) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}><strong>Loading…</strong></div>
      </div>
    );
  }
  if (!Number.isSafeInteger(Number(user.userId))) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <strong>Can't identify you</strong>
          <span>Your user id is not a numeric agent id.</span>
        </div>
      </div>
    );
  }
  return (
    <>
      {/* Outside Desk on purpose: Desk re-renders every second or two, the heartbeat must not be reset by that */}
      <SessionGuard />
      <Desk user={user} />
    </>
  );
};

export default SupportDashboardPage;