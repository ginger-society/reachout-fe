import { useState } from "react";
import {
  Input,
  Modal,
  ModalBody,
  ModalHeader,
  Text,
} from "@ginger-society/ginger-ui";
import { CustomerDetails } from "@/types/chat";
import { CUSTOMER_LIMITS, isValidEmail, isValidPhone } from "@/utils/chatFormat";

interface CustomerDetailsModalProps {
  initial: CustomerDetails;
  /** Saves to the backend. Resolves with null on success, or with a message to show in the form. */
  onSave: (details: CustomerDetails) => Promise<string | null>;
  onClose: () => void;
}

/** Name, email and phone: all optional. Mount it only while it should be open. */
const CustomerDetailsModal = ({ initial, onSave, onClose }: CustomerDetailsModalProps) => {
  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailInvalid = email.trim() !== "" && !isValidEmail(email.trim());
  const phoneInvalid = phone.trim() !== "" && !isValidPhone(phone.trim());
  const nameTooLong = name.trim().length > CUSTOMER_LIMITS.name;
  const emailTooLong = email.trim().length > CUSTOMER_LIMITS.email;
  const phoneTooLong = phone.trim().length > CUSTOMER_LIMITS.phone;
  const invalid = emailInvalid || phoneInvalid || nameTooLong || emailTooLong || phoneTooLong;

  const handleOk = async () => {
    if (invalid || saving) return;
    const next: CustomerDetails = { name: name.trim(), email: email.trim(), phone: phone.trim() };
    const unchanged =
      next.name === (initial.name ?? "") &&
      next.email === (initial.email ?? "") &&
      next.phone === (initial.phone ?? "");
    if (unchanged) {
      onClose();
      return;
    }

    setSaving(true);
    setServerError(null);
    const error = await onSave(next);
    setSaving(false);
    if (error) setServerError(error); // stay open so nothing the agent typed is lost
    else onClose();
  };

  return (
    <Modal isOpen onClose={onClose} footerConfig={{}} onOk={handleOk}>
      <ModalHeader>Customer details</ModalHeader>
      <ModalBody>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <Text>All fields are optional. Clear a field to remove it.</Text>
          <Input
            label="Name"
            placeholder="Customer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            state={nameTooLong ? "danger" : undefined}
            info={nameTooLong ? `Max ${CUSTOMER_LIMITS.name} characters` : undefined}
            clearable
          />
          <Input
            label="Email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            state={emailInvalid || emailTooLong ? "danger" : undefined}
            info={
              emailTooLong
                ? `Max ${CUSTOMER_LIMITS.email} characters`
                : emailInvalid
                  ? "Enter a valid email address"
                  : undefined
            }
            clearable
          />
          <Input
            label="Phone number"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            state={phoneInvalid || phoneTooLong ? "danger" : undefined}
            info={
              phoneInvalid || phoneTooLong
                ? "Use 6 to 15 digits. A leading + and spaces, dashes, dots or brackets are allowed"
                : undefined
            }
            clearable
          />
          {saving && <Text>Saving…</Text>}
          {serverError && (
            <p role="alert" style={{ margin: 0, color: "#dc2626", fontSize: 13 }}>
              {serverError}
            </p>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
};

export default CustomerDetailsModal;