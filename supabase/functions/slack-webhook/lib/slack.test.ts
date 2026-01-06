import { assertEquals } from "@std/assert";
import {
  formatMentions,
  getOriginalMessageUrl,
  parseSlackMessage,
  type SlackMessageEvent,
  type UserResolver,
} from "./slack.ts";

// Mock user resolver that returns predictable names
function createMockUserResolver(
  users: Record<string, string> = {},
): UserResolver {
  return (userId: string) => Promise.resolve(users[userId] ?? `user_${userId}`);
}

// ============================================================================
// formatMentions - converts <@U123> to @username
// ============================================================================

Deno.test("formatMentions - converts user mentions to usernames", async () => {
  const resolver = createMockUserResolver({ U123: "john", U456: "jane" });
  const result = await formatMentions(
    "Hey <@U123>, can you help <@U456>?",
    resolver,
  );
  assertEquals(result, "Hey @john, can you help @jane?");
});

Deno.test("formatMentions - handles unknown users", async () => {
  const resolver = createMockUserResolver({});
  const result = await formatMentions("Hey <@U999>", resolver);
  assertEquals(result, "Hey @user_U999");
});

Deno.test("formatMentions - preserves text without mentions", async () => {
  const resolver = createMockUserResolver({});
  const result = await formatMentions("No mentions here", resolver);
  assertEquals(result, "No mentions here");
});

Deno.test("formatMentions - converts channel mentions", async () => {
  const resolver = createMockUserResolver({});
  const result = await formatMentions(
    "Check <#C123|general> channel",
    resolver,
  );
  assertEquals(result, "Check #general channel");
});

Deno.test("formatMentions - converts URLs with labels", async () => {
  const resolver = createMockUserResolver({});
  const result = await formatMentions(
    "See <https://example.com|Example Site>",
    resolver,
  );
  assertEquals(result, "See Example Site (https://example.com)");
});

Deno.test("formatMentions - preserves plain URLs", async () => {
  const resolver = createMockUserResolver({});
  const result = await formatMentions("See <https://example.com>", resolver);
  assertEquals(result, "See https://example.com");
});

Deno.test("formatMentions - converts user group mentions with label", async () => {
  const resolver = createMockUserResolver({});
  const result = await formatMentions(
    "Hey <!subteam^S06V4MSF2TC|@engineering>",
    resolver,
  );
  assertEquals(result, "Hey @engineering");
});

Deno.test("formatMentions - converts user group mentions without label", async () => {
  const resolver = createMockUserResolver({});
  const result = await formatMentions("Hey <!subteam^S06V4MSF2TC>", resolver);
  assertEquals(result, "Hey @group");
});

// ============================================================================
// parseSlackMessage - extracts content from Slack message events
// ============================================================================

Deno.test("parseSlackMessage - extracts simple text message", async () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "Simple task to do",
    channel: "C123",
    user: "U123",
    ts: "1234567890.123456",
  };

  const resolver = createMockUserResolver({ U123: "john" });
  const result = await parseSlackMessage(event, resolver);

  assertEquals(result, "Simple task to do");
});

Deno.test("parseSlackMessage - resolves mentions in text", async () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "Ask <@U456> about this",
    channel: "C123",
    user: "U123",
    ts: "1234567890.123456",
  };

  const resolver = createMockUserResolver({ U456: "jane" });
  const result = await parseSlackMessage(event, resolver);

  assertEquals(result, "Ask @jane about this");
});

Deno.test("parseSlackMessage - includes forwarded message with author", async () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "",
    channel: "C123",
    user: "U123",
    ts: "1234567890.123456",
    attachments: [
      {
        author_name: "Jane Doe",
        text: "This is the forwarded content",
        ts: "1234567800",
      },
    ],
  };

  const resolver = createMockUserResolver({});
  const result = await parseSlackMessage(event, resolver);

  assertEquals(result, "From Jane Doe:\nThis is the forwarded content");
});

Deno.test("parseSlackMessage - combines user message with forwarded content", async () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "Check this out",
    channel: "C123",
    user: "U123",
    ts: "1234567890.123456",
    attachments: [
      {
        author_name: "Jane Doe",
        text: "Original message here",
        ts: "1234567800",
      },
    ],
  };

  const resolver = createMockUserResolver({});
  const result = await parseSlackMessage(event, resolver);

  assertEquals(
    result,
    "Check this out\n\nFrom Jane Doe:\nOriginal message here",
  );
});

Deno.test("parseSlackMessage - handles multiple forwarded messages", async () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "Thread summary",
    channel: "C123",
    user: "U123",
    ts: "1234567890.123456",
    attachments: [
      {
        author_name: "Alice",
        text: "First message",
        ts: "1234567800",
      },
      {
        author_name: "Bob",
        text: "Second message",
        ts: "1234567810",
      },
    ],
  };

  const resolver = createMockUserResolver({});
  const result = await parseSlackMessage(event, resolver);

  assertEquals(
    result,
    "Thread summary\n\nFrom Alice:\nFirst message\n\nFrom Bob:\nSecond message",
  );
});

Deno.test("parseSlackMessage - includes file attachments", async () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "Here's the screenshot",
    channel: "C123",
    user: "U123",
    ts: "1234567890.123456",
    files: [
      {
        name: "screenshot.png",
        title: "Bug Screenshot",
        mimetype: "image/png",
      },
    ],
  };

  const resolver = createMockUserResolver({});
  const result = await parseSlackMessage(event, resolver);

  assertEquals(
    result,
    "Here's the screenshot\n\n[Attached: screenshot.png - Bug Screenshot]",
  );
});

Deno.test("parseSlackMessage - handles file without title", async () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "Document attached",
    channel: "C123",
    user: "U123",
    ts: "1234567890.123456",
    files: [
      {
        name: "report.pdf",
        mimetype: "application/pdf",
      },
    ],
  };

  const resolver = createMockUserResolver({});
  const result = await parseSlackMessage(event, resolver);

  assertEquals(result, "Document attached\n\n[Attached: report.pdf]");
});

Deno.test("parseSlackMessage - handles forwarded message with fallback text", async () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "",
    channel: "C123",
    user: "U123",
    ts: "1234567890.123456",
    attachments: [
      {
        fallback: "Fallback text for the message",
        author_name: "Someone",
      },
    ],
  };

  const resolver = createMockUserResolver({});
  const result = await parseSlackMessage(event, resolver);

  assertEquals(result, "From Someone:\nFallback text for the message");
});

Deno.test("parseSlackMessage - resolves mentions in forwarded content", async () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "",
    channel: "C123",
    user: "U123",
    ts: "1234567890.123456",
    attachments: [
      {
        author_name: "Jane",
        text: "Hey <@U789>, check this",
        ts: "1234567800",
      },
    ],
  };

  const resolver = createMockUserResolver({ U789: "mike" });
  const result = await parseSlackMessage(event, resolver);

  assertEquals(result, "From Jane:\nHey @mike, check this");
});

// ============================================================================
// getOriginalMessageUrl - extracts URL from forwarded messages
// ============================================================================

Deno.test("getOriginalMessageUrl - returns from_url from attachment", () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "",
    channel: "C123",
    ts: "1234567890.123456",
    attachments: [
      {
        author_name: "Jane",
        text: "Forwarded content",
        from_url: "https://workspace.slack.com/archives/C456/p1234567890",
      },
    ],
  };

  const result = getOriginalMessageUrl(event);
  assertEquals(result, "https://workspace.slack.com/archives/C456/p1234567890");
});

Deno.test("getOriginalMessageUrl - returns null when no attachments", () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "Plain message",
    channel: "C123",
    ts: "1234567890.123456",
  };

  const result = getOriginalMessageUrl(event);
  assertEquals(result, null);
});

Deno.test("getOriginalMessageUrl - returns null when no from_url in attachments", () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "",
    channel: "C123",
    ts: "1234567890.123456",
    attachments: [
      {
        author_name: "Jane",
        text: "Content without URL",
      },
    ],
  };

  const result = getOriginalMessageUrl(event);
  assertEquals(result, null);
});

Deno.test("getOriginalMessageUrl - returns first from_url when multiple attachments", () => {
  const event: SlackMessageEvent = {
    type: "message",
    text: "",
    channel: "C123",
    ts: "1234567890.123456",
    attachments: [
      {
        author_name: "Jane",
        text: "First",
        from_url: "https://workspace.slack.com/first",
      },
      {
        author_name: "Bob",
        text: "Second",
        from_url: "https://workspace.slack.com/second",
      },
    ],
  };

  const result = getOriginalMessageUrl(event);
  assertEquals(result, "https://workspace.slack.com/first");
});
