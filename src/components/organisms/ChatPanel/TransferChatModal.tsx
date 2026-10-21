import { useState } from "react";
import {
  Modal,
  ModalBody,
  ModalHeader,
  SnackbarTimer,
  useSnackbar,
} from "@ginger-society/ginger-ui";
import Avatar from "@/components/atoms/Avatar/Avatar";
import ThemedText from "@/components/atoms/ThemedText/ThemedText";
import { AgentProfile, AgentStatus } from "@/types/chat";
import styles from "./transferChatModal.module.scss";

// The modal renders outside the dashboard root, so it can't use the --sd-* tokens.
const STATUS: Record<AgentStatus, { label: string; color: string }> = {
  available: { label: "Available", color: "#22c55e" },
  busy: { label: "Busy", color: "#ef4444" },
  away: { label: "Away", color: "#f59e0b" },
};

interface TransferChatModalProps {
  agents: AgentProfile[];
  onTransfer: (agentId: string) => void;
  onClose: () => void;
}

/** Pick a teammate to take over the chat. Mount it only while it should be open. */
const TransferChatModal = ({ agents, onTransfer, onClose }: TransferChatModalProps) => {
  const { show } = useSnackbar();
  const [selectedId, setSelectedId] = useState<string>();

  const handleOk = () => {
    if (!selectedId) {
      show(<div>Select an agent to transfer this chat to.</div>, SnackbarTimer.Short, false);
      return;
    }
    onTransfer(selectedId);
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} footerConfig={{}} onOk={handleOk}>
      <ModalHeader>Transfer to another agent</ModalHeader>
      <ModalBody>
        {agents.length === 0 ? (
          <ThemedText>No other agents are available right now.</ThemedText>
        ) : (
          <div role="radiogroup" aria-label="Agents" className={styles.list}>
            {agents.map((agent) => {
              const selected = agent.id === selectedId;
              const status = STATUS[agent.status];
              return (
                <label
                  key={agent.id}
                  className={[styles.option, selected ? styles.selected : ""].join(" ")}
                >
                  <input
                    type="radio"
                    name="transfer-agent"
                    className={styles.radio}
                    checked={selected}
                    onChange={() => setSelectedId(agent.id)}
                  />
                  <Avatar name={agent.name} color={agent.color} />
                  <span className={styles.text}>
                    <ThemedText className={styles.name}>{agent.name}</ThemedText>
                    <ThemedText className={styles.email}>{agent.email}</ThemedText>
                  </span>
                  <span className={styles.status}>
                    <span className={styles.dot} style={{ background: status.color }} />
                    <ThemedText>{status.label}</ThemedText>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </ModalBody>
    </Modal>
  );
};

export default TransferChatModal;