import { FaUser } from "react-icons/fa";
import { initialsOf } from "@/utils/chatFormat";
import styles from "./avatar.module.scss";

interface AvatarProps {
  /** Initials come from this. Without a name a generic user icon is shown. */
  name?: string;
  size?: "sm" | "md";
  /** Solid colour avatar. Omit for the muted style. */
  color?: string;
}

const Avatar = ({ name, size = "md", color }: AvatarProps) => {
  const initials = name ? initialsOf(name) : "";
  return (
    <span
      aria-hidden="true"
      className={[
        styles.avatar,
        styles[size],
        color ? styles.colored : styles.muted,
      ].join(" ")}
      style={color ? { backgroundColor: color } : undefined}
    >
      {initials || <FaUser size={size === "sm" ? 14 : 17} />}
    </span>
  );
};

export default Avatar;