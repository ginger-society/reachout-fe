import { useState } from "react";
import {
  Input,
  Modal,
  ModalBody,
  ModalHeader,
  Text,
} from "@ginger-society/ginger-ui";
import { CustomerDetails } from "@/types/chat";
import { isValidEmail } from "@/utils/chatFormat";

interface CustomerDetailsModalProps {
  initial: CustomerDetails;
  onSave: (details: CustomerDetails) => void;
  onClose: () => void;
}

/** Name, email and phone: all optional. Mount it only while it should be open. */
const CustomerDetailsModal = ({ initial, onSave, onClose }: CustomerDetailsModalProps) => {
  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");

  const emailInvalid = email.trim() !== "" && !isValidEmail(email.trim());

  const handleOk = () => {
    if (emailInvalid) return;
    onSave({ name, email, phone });
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} footerConfig={{}} onOk={handleOk}>
      <ModalHeader>Customer details</ModalHeader>
      <ModalBody>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <Text>All fields are optional. Add what the customer tells you.</Text>
          <Input
            label="Name"
            placeholder="Customer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            clearable
          />
          <Input
            label="Email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            state={emailInvalid ? "danger" : undefined}
            info={emailInvalid ? "Enter a valid email address" : undefined}
            clearable
          />
          <Input
            label="Phone number"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            clearable
          />
        </div>
      </ModalBody>
    </Modal>
  );
};

export default CustomerDetailsModal;