import { ReactNode } from "react";
import { Text } from "@ginger-society/ginger-ui";
import styles from "./themedText.module.scss";

interface ThemedTextProps {
  children: ReactNode;
  className?: string;
}

/**
 * Thin wrapper around ginger-ui <Text> so colour follows the active theme,
 * while size / weight / margins / truncation are controlled by the parent.
 */
const ThemedText = ({ children, className }: ThemedTextProps) => (
  <span className={[styles.wrap, className].filter(Boolean).join(" ")}>
    <Text>{children}</Text>
  </span>
);

export default ThemedText;
