import { ChatMessage, ChatThread, CustomerDetails } from "@/types/chat";

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();
/** minutes -> seconds, to keep the sample data readable */
const min = (n: number) => n * 60;

let counter = 0;
const msg = (
  sender: ChatMessage["sender"],
  text: string,
  secs: number
): ChatMessage => ({
  id: `m-${++counter}`,
  sender,
  text,
  sentAt: secondsAgo(secs),
});

interface ThreadSeed {
  id: string;
  site: string;
  pageUrl: string;
  color: string;
  unread?: number;
  typing?: boolean;
  customer?: CustomerDetails;
  messages: ChatMessage[];
}

const thread = (seed: ThreadSeed): ChatThread => ({
  id: seed.id,
  site: seed.site,
  pageUrl: seed.pageUrl,
  color: seed.color,
  online: true,
  typing: seed.typing,
  unread: seed.unread ?? 0,
  state: "queued",
  customer: seed.customer ?? {},
  messages: seed.messages,
});

/**
 * Sample data. Ids are uuids because that is all we know about a visitor before pickup.
 * Last-message ages are chosen so every wait level shows up on load:
 *   3s (fresh), 22s (20s+), 45s and 50s (40s+), 75s / 2m / 4m (60s+),
 * and three chats whose last message is an agent quick reply (no urgency).
 */
export const createMockThreads = (): ChatThread[] => [
  thread({
    id: "9f1c2e7a-4b3d-4c1e-9a52-6d8f0b7e3a11",
    site: "abc.com",
    pageUrl: "https://abc.com/docs/deployments",
    color: "#3b82f6",
    unread: 2,
    customer: { name: "John Doe", email: "john.doe@example.com" },
    messages: [
      msg("customer", "I'm trying to deploy my app but it keeps failing with a 502 error. Can you help?", min(11)),
      msg("agent", "Hi John! I'd be happy to help. Could you share the logs or the service name you're deploying?", min(10)),
      msg("customer", "Sure, here are the logs:\n[log snippet]", min(8)),
      msg("agent", "Thanks! I see the issue. It looks like the service is not starting properly. I'll guide you through the fix.", min(5)),
      msg("customer", "That worked! Thanks a lot!", 3),
    ],
  }),
  thread({
    id: "c47a90d2-18be-4f6a-b3e9-52a7d1c8f0b4",
    site: "abc.com",
    pageUrl: "https://abc.com/billing",
    color: "#7c5cf0",
    unread: 1,
    messages: [
      msg("customer", "Can you help me with the billing issue? I was charged twice this month.", min(14)),
      msg("agent", "Hi! I'm checking on that for you. Could you share your account email or ID?", min(12)),
      msg("customer", "It's alice@company.com", min(10)),
      msg("agent", "Got it! I've looked into it and it seems like there was a duplicate transaction. I've already initiated a refund. It should reflect in 3-5 business days.", min(7)),
      msg("customer", "Perfect, thank you for the quick help!", 22),
    ],
  }),
  thread({
    id: "5be3f8a1-7d20-4c94-8e6b-0a1d93c2e7f5",
    site: "xyz.com",
    pageUrl: "https://xyz.com/pricing",
    color: "#c13fc4",
    typing: true, // example of the "visitor is typing" state
    messages: [
      msg("customer", "Is there a way to increase the CPU limit for my deployment?", min(20)),
      msg("agent", "Yes, you can update the resource limits in your deployment YAML. Would you like me to share an example?", min(17)),
      msg("customer", "Yes, that would be great!", min(15)),
      msg(
        "agent",
        [
          "Here's an example:",
          "```yaml",
          "resources:",
          "  limits:",
          '    cpu: "2"',
          '    memory: "4Gi"',
          "```",
        ].join("\n"),
        min(14)
      ),
      msg("customer", "Awesome, thanks! It works now.", 45),
    ],
  }),
  thread({
    id: "e08d6c35-a9f1-47b2-9c0e-3f7b2a5d8e19",
    site: "abc.com",
    pageUrl: "https://abc.com/docs/getting-started",
    color: "#0ea5a4",
    messages: [msg("customer", "Thanks! That worked perfectly.", 75)],
  }),
  thread({
    id: "2a7f19c4-6e83-4d05-b1a8-9c4e0f6d3b72",
    site: "xyz.com",
    pageUrl: "https://xyz.com/features/domains",
    color: "#f59e0b",
    messages: [msg("customer", "Do you support custom domains?", min(2))],
  }),
  thread({
    id: "b6c1e4d9-3f58-4a27-8d90-1e5a7c2f4b36",
    site: "pqr.io",
    pageUrl: "https://pqr.io/docs/build",
    color: "#2f7be0",
    unread: 1,
    messages: [
      msg("customer", "I'm getting an error during build with the latest version.", min(36)),
      msg("agent", "Can you share the error message or the build logs? That will help me diagnose the issue.", min(35)),
      msg("customer", "Here's the error:\n```\nError: failed to fetch dependency\n```", min(34)),
      msg("agent", "Thanks! It looks like a missing dependency. I'll update the build configuration and let you know once it's fixed.", min(33)),
      msg("customer", "Great, appreciate it!", 50),
    ],
  }),
  thread({
    id: "7d9e2b50-c1a4-4e68-a3f7-8b0d5c6e1a93",
    site: "abc.com",
    pageUrl: "https://abc.com/dashboard/services",
    color: "#ef4444",
    messages: [
      msg("customer", "Can you check the logs for my service? It restarted twice overnight.", min(8)),
      msg("agent", "Thanks for contacting us. I'm looking into this now.", min(5)),
    ],
  }),
  thread({
    id: "41f8a3c7-9b26-4d1e-85c0-6a2e7d9f0b48",
    site: "xyz.com",
    pageUrl: "https://xyz.com/pricing",
    color: "#10b981",
    messages: [
      msg("customer", "What's the difference between the Starter and Pro plans?", min(9)),
      msg("agent", "Hi! Thanks for reaching out. I'll be with you in just a moment.", min(6)),
    ],
  }),
  thread({
    id: "d3a5b7e1-0c94-4f82-b6d1-7e8a2c4f9015",
    site: "abc.com",
    pageUrl: "https://abc.com/",
    color: "#6366f1",
    messages: [
      msg("customer", "Is anyone there? I have a question about my invoice.", min(12)),
      msg("agent", "I'm helping another customer and will pick up this chat shortly.", min(10)),
    ],
  }),
  thread({
    id: "86e2c0f4-5a1b-4d73-9e48-2b7f1a6c3d80",
    site: "pqr.io",
    pageUrl: "https://pqr.io/account/billing",
    color: "#ec4899",
    messages: [msg("customer", "I need to update my payment method before the next billing date.", min(4))],
  }),
];