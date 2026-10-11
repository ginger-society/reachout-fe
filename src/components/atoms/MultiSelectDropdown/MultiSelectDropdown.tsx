import { useId, useState } from "react";
import { FaCheck, FaChevronDown } from "react-icons/fa";
import { useDismissable } from "@/hooks/useDismissable";
import styles from "../Dropdown/dropdown.module.scss";

export interface DropdownOption {
  label: string;
  value: string;
}

interface MultiSelectDropdownProps {
  options: DropdownOption[];
  value: DropdownOption[];
  onChange: (value: DropdownOption[]) => void;
  placeholder?: string;
  emptyText?: string;
  ariaLabel: string;
}

const MultiSelectDropdown = ({
  options,
  value,
  onChange,
  placeholder = "All",
  emptyText = "Nothing to choose from",
  ariaLabel,
}: MultiSelectDropdownProps) => {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const wrapperRef = useDismissable<HTMLDivElement>(open, () => setOpen(false));

  const selected = new Set(value.map((o) => o.value));

  const toggle = (option: DropdownOption) => {
    const next = new Set(selected);
    if (next.has(option.value)) next.delete(option.value);
    else next.add(option.value);
    // keep the order of `options`, not the click order
    onChange(options.filter((o) => next.has(o.value)));
  };

  const summary =
    value.length === 0
      ? null
      : value.length <= 2
        ? value.map((o) => o.label).join(", ")
        : `${value.length} selected`;

  return (
    <div className={styles.dropdown} ref={wrapperRef}>
      <button
        type="button"
        className={[styles.trigger, open ? styles.triggerOpen : ""].join(" ")}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={[
            styles.triggerText,
            summary ? "" : styles.placeholder,
          ].join(" ")}
        >
          {summary ?? placeholder}
        </span>
        {value.length > 0 && <span className={styles.count}>{value.length}</span>}
        <FaChevronDown
          className={[styles.chevron, open ? styles.chevronOpen : ""].join(" ")}
        />
      </button>

      {open && (
        <div className={styles.popover} id={listId}>
          {options.length === 0 ? (
            <div className={styles.empty}>{emptyText}</div>
          ) : (
            <ul role="listbox" aria-multiselectable="true" aria-label={ariaLabel} style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {options.map((option) => {
                const isOn = selected.has(option.value);
                return (
                  <li key={option.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isOn}
                      className={[
                        styles.option,
                        isOn ? styles.optionSelected : "",
                      ].join(" ")}
                      onClick={() => toggle(option)}
                    >
                      <span
                        className={[
                          styles.checkbox,
                          isOn ? styles.checkboxOn : "",
                        ].join(" ")}
                      >
                        {isOn && <FaCheck />}
                      </span>
                      <span className={styles.optionLabel}>{option.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {value.length > 0 && (
            <div className={styles.footer}>
              <button
                type="button"
                className={styles.clear}
                onClick={() => onChange([])}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;
