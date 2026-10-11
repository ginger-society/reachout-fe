import ConversationQueue from "@/components/organisms/ConversationQueue/ConversationQueue";
import ChatPanel from "@/components/organisms/ChatPanel/ChatPanel";
import { useChatDesk } from "@/hooks/useChatDesk";
import { currentAgent, teammates } from "@/mocks/agents";
import { createMockThreads } from "@/mocks/supportThreads";
import styles from "./supportDashboard.module.scss";

const SupportDashboardPage = () => {
  // Swap the mocks for your API data when it's ready
  const desk = useChatDesk(createMockThreads, currentAgent.sites, currentAgent.status);

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
    </div>
  );
};

export default SupportDashboardPage;