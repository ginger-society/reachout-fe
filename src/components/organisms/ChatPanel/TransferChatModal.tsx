import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  ModalBody,
  ModalHeader,
  SnackbarTimer,
  useSnackbar,
} from "@ginger-society/ginger-ui";
import Avatar from "@/components/atoms/Avatar/Avatar";
import ThemedText from "@/components/atoms/ThemedText/ThemedText";
import type { TransferTarget } from "@/utils/chatApi";
import styles from "./transferChatModal.module.scss";

const ONLINE_COLOR = "#22c55e"; // the modal renders outside the dashboard root, so no --sd-* tokens

interface TransferChatModalProps {
  /** fetches the agents that are online right now */
  loadTargets: () => Promise<TransferTarget[]>;
  onTransfer: (agentId: string) => void;
  onClose: () => void;
}

/** Pick an online teammate to take over the chat. Mount it only while it should be open. */
const TransferChatModal = ({ loadTargets, onTransfer, onClose }: TransferChatModalProps) => {
  const { show } = useSnackbar();
  const [targets, setTargets] = useState<TransferTarget[] | null>(null); // null = loading
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();

  const load = useCallback(() => {
    let cancelled = false;
    setTargets(null);
    setFailed(false);
    loadTargets()
      .then((list) => {
        if (cancelled) return;
        setTargets(list);
        // the agent we had selected may have gone offline since the last load
        setSelectedId((cur) => (list.some((t) => t.id === cur) ? cur : undefined));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadTargets]);

  useEffect(() => load(), [load]);

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
        {failed ? (
          <div className={styles.message}>
            <ThemedText>Could not load the list of agents.</ThemedText>
            <button type="button" className={styles.retry} onClick={load}>
              Try again
            </button>
          </div>
        ) : targets === null ? (
          <ThemedText>Looking for agents who are online…</ThemedText>
        ) : targets.length === 0 ? (
          <div className={styles.message}>
            <ThemedText>No other agents are online right now.</ThemedText>
            <button type="button" className={styles.retry} onClick={load}>
              Refresh
            </button>
          </div>
        ) : (
          <div role="radiogroup" aria-label="Agents" className={styles.list}>
            {targets.map((agent) => {
              const selected = agent.id === selectedId;
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
                  </span>
                  <span className={styles.status}>
                    <span className={styles.dot} style={{ background: ONLINE_COLOR }} />
                    <ThemedText>Online</ThemedText>
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