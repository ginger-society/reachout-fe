import { FaSignOutAlt } from "react-icons/fa";
import { Avatar, Dropdown } from "@ginger-society/ginger-ui";
import { AgentProfile } from "@/types/chat";
import styles from "./agentMenu.module.scss";

interface AgentMenuProps {
  agent: AgentProfile;
  onLogout: () => void;
}

/** Avatar + name. Opens a dropdown with the agent's identity and a logout button. */
const AgentMenu = ({ agent, onLogout }: AgentMenuProps) => (
  <Dropdown
    align="left"
    label={
      <div className={styles.trigger}>
        <Avatar name={agent.name} />
        <span className={styles.triggerName}>{agent.name}</span>
      </div>
    }
  >
    <>
      <div className={styles.identity}>
        <Avatar name={agent.name} />
        <div className={styles.identityText}>
          <span className={styles.agentName}>{agent.name}</span>
          <span className={styles.agentEmail}>{agent.email}</span>
        </div>
      </div>
      <button type="button" className={styles.logoutButton} onClick={onLogout}>
        <FaSignOutAlt aria-hidden="true" />
        Logout
      </button>
    </>
  </Dropdown>
);

export default AgentMenu;