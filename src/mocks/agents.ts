import { AgentProfile } from "@/types/chat";

/** The signed-in agent. Replace with your IAM user. */
export const currentAgent: AgentProfile = {
  id: "agent-1",
  name: "Arjun Menon",
  email: "arjun.menon@abc.com",
  color: "#3b82f6",
  status: "available",
  sites: ["abc.com", "xyz.com", "pqr.io"],
};

/** Other agents a chat can be transferred to. Replace with your API. */
export const teammates: AgentProfile[] = [
  {
    id: "agent-2",
    name: "Meera Iyer",
    email: "meera.iyer@abc.com",
    color: "#7c5cf0",
    status: "available",
    sites: ["abc.com", "xyz.com"],
  },
  {
    id: "agent-3",
    name: "Karthik Subramanian",
    email: "karthik.s@abc.com",
    color: "#0ea5a4",
    status: "busy",
    sites: ["xyz.com", "pqr.io"],
  },
  {
    id: "agent-4",
    name: "Divya Raman",
    email: "divya.raman@abc.com",
    color: "#ec4899",
    status: "away",
    sites: ["abc.com"],
  },
];