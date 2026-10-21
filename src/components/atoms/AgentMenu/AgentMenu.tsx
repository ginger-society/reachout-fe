import { useId, useState } from "react";
import { FaCheck, FaChevronDown, FaSignOutAlt } from "react-icons/fa";
import Avatar from "@/components/atoms/Avatar/Avatar";
import { useDismissable } from "@/hooks/useDismissable";
import { AgentProfile, AgentStatus } from "@/types/chat";
import dropdown from "../Dropdown/dropdown.module.scss";
import styles from "./agentMenu.module.scss";
import { AuthHeartBeat, Modal, ModalBody, ModalHeader } from "@ginger-society/ginger-ui";
import { IAMService } from "@/services";

const STATUSES: { value: AgentStatus; label: string; color: string }[] = [
  { value: "available", label: "Available", color: "var(--sd-online)" },
  { value: "busy", label: "Busy", color: "var(--sd-busy)" },
  { value: "away", label: "Away", color: "var(--sd-away)" },
];

interface AgentMenuProps {
  agent: AgentProfile;
  status: AgentStatus;
  onStatusChange: (status: AgentStatus) => void;
  onLogout: () => void;
}

/** Agent avatar + status. Opens identity, availability options and logout. */
const AgentMenu = ({ agent, status, onStatusChange, onLogout }: AgentMenuProps) => {
  const [open, setOpen] = useState(false);
  const [isReauthModalOpen, setIsReauthModalOpen] = useState(false);
  const menuId = useId();
  const wrapperRef = useDismissable<HTMLDivElement>(open, () => setOpen(false));
  const current = STATUSES.find((s) => s.value === status) ?? STATUSES[0];

  const refreshTokenFn = async (refreshToken: string) => {
    try {
      const tokens = await IAMService.identityRefreshToken({
        refreshTokenRequest: { refreshToken },
      });
      return tokens.accessToken;
    } catch (err) {
      if (isAuthError(err)) {
        setIsReauthModalOpen(true);
      }
      // network/offline errors: don't show the modal, just let it fail silently
      // (AuthHeartBeat will presumably retry on its next interval)
      throw err;
    }
  };

  const isAuthError = (err: unknown): boolean => {
    if (err instanceof TypeError) {
      // e.g. "Failed to fetch" — no network / DNS / CORS-level failure
      return false;
    }
    const status = (err as any)?.response?.status ?? (err as any)?.status;
    return status === 401 || status === 403;
  };

  const handleReauth = () => {
    window.location.reload();
  };

  return (
    <div className={dropdown.dropdown} ref={wrapperRef}>
      <AuthHeartBeat refreshTokenFn={refreshTokenFn} />
      <Modal
        isOpen={isReauthModalOpen}
        onClose={handleReauth}
        preventCancelOnOverlay
        footerConfig={{}}
        onOk={handleReauth}
      >
        <ModalHeader>Session Expired</ModalHeader>
        <ModalBody>
          <p>Re authenticate to continue</p>
        </ModalBody>
      </Modal>
      <button
        type="button"
        className={[dropdown.trigger, dropdown.ghost, styles.trigger].join(" ")}
        style={{ color: current.color }}
        aria-label={`${agent.name}, ${current.label}. Open account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatarWrap}>
          <Avatar name={agent.name} size="sm" color={agent.color} />
          <span className={styles.statusDot} style={{ background: current.color }} />
        </span>
        <span>{current.label}</span>
        <FaChevronDown
          className={[dropdown.chevron, open ? dropdown.chevronOpen : ""].join(" ")}
        />
      </button>

      {open && (
        <div className={dropdown.popover} id={menuId} style={{ minWidth: 280 }}>
          <div className={styles.identity}>
            <Avatar name={agent.name} color={agent.color} />
            <div className={styles.identityText}>
              <span className={styles.agentName}>{agent.name}</span>
              <span className={styles.agentEmail}>{agent.email}</span>
            </div>
          </div>

          <div className={styles.divider} />

          <div role="menu" aria-label="Availability">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="menuitemradio"
                aria-checked={s.value === status}
                className={[
                  dropdown.option,
                  s.value === status ? dropdown.optionSelected : "",
                ].join(" ")}
                onClick={() => {
                  onStatusChange(s.value);
                  setOpen(false);
                }}
              >
                <span className={dropdown.dot} style={{ background: s.color }} />
                <span className={styles.grow}>{s.label}</span>
                {s.value === status && <FaCheck className={styles.check} />}
              </button>
            ))}
          </div>

          <div className={styles.divider} />

          <button
            type="button"
            role="menuitem"
            className={dropdown.option}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <FaSignOutAlt className={styles.logoutIcon} aria-hidden="true" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default AgentMenu;