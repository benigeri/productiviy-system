/**
 * Slack message parsing utilities.
 * Handles extracting and formatting content from Slack message events.
 */

export interface SlackMessageEvent {
  type: "message";
  subtype?: string;
  text?: string;
  channel: string;
  user?: string;
  bot_id?: string;
  ts: string;
  attachments?: SlackAttachment[];
  files?: SlackFile[];
}

export interface SlackAttachment {
  author_name?: string;
  author_id?: string;
  text?: string;
  fallback?: string;
  ts?: string;
  pretext?: string;
  channel_id?: string;
  channel_name?: string;
  message_ts?: string;
  from_url?: string;
}

export interface SlackFile {
  name: string;
  title?: string;
  mimetype: string;
  url_private?: string;
}

/**
 * Function type for resolving Slack user IDs to display names.
 */
export type UserResolver = (userId: string) => Promise<string>;

/**
 * Function type for resolving Slack usergroup IDs to group names.
 */
export type UserGroupResolver = (groupId: string) => Promise<string>;

/**
 * Converts Slack formatting to readable text.
 * - <@U123> → @username (via resolver)
 * - <!subteam^S123|@group-name> → @group-name (user groups with label)
 * - <!subteam^S123> → @group-name (user groups via resolver)
 * - <#C123|channel-name> → #channel-name
 * - <https://url|Label> → Label (https://url)
 * - <https://url> → https://url
 */
export async function formatMentions(
  text: string,
  userResolver: UserResolver,
  groupResolver?: UserGroupResolver,
): Promise<string> {
  // Collect all user IDs that need resolving
  const userMentionRegex = /<@(U[A-Z0-9]+)>/g;
  const userIds = new Set<string>();
  let match;

  while ((match = userMentionRegex.exec(text)) !== null) {
    userIds.add(match[1]);
  }

  // Collect all group IDs without labels that need resolving
  const groupIds = new Set<string>();

  // Find groups without labels: <!subteam^S123> (not <!subteam^S123|label>)
  const groupWithoutLabelRegex = /<!subteam\^(S[A-Z0-9]+)>/g;
  while ((match = groupWithoutLabelRegex.exec(text)) !== null) {
    // Check if this match has a label by looking at the full pattern
    const fullMatch = text.slice(match.index, match.index + 50);
    if (!fullMatch.includes("|")) {
      groupIds.add(match[1]);
    }
  }

  // Resolve all users and groups in parallel
  const userMap = new Map<string, string>();
  const groupMap = new Map<string, string>();

  await Promise.all([
    ...Array.from(userIds).map(async (userId) => {
      const name = await userResolver(userId);
      userMap.set(userId, name);
    }),
    ...Array.from(groupIds).map(async (groupId) => {
      if (groupResolver) {
        const name = await groupResolver(groupId);
        groupMap.set(groupId, name);
      }
    }),
  ]);

  // Replace user mentions
  let result = text.replace(/<@(U[A-Z0-9]+)>/g, (_, userId) => {
    return `@${userMap.get(userId) ?? userId}`;
  });

  // Replace user group mentions with labels: <!subteam^S123|@group-name> → @group-name
  result = result.replace(/<!subteam\^[A-Z0-9]+\|@?([^>]+)>/g, "@$1");

  // Replace user group mentions without labels: <!subteam^S123> → @resolved-name or @group
  result = result.replace(/<!subteam\^(S[A-Z0-9]+)>/g, (_, groupId) => {
    return `@${groupMap.get(groupId) ?? "group"}`;
  });

  // Replace channel mentions: <#C123|channel-name> → #channel-name
  result = result.replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1");

  // Replace labeled URLs: <https://url|Label> → Label (https://url)
  result = result.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2 ($1)");

  // Replace plain URLs: <https://url> → https://url
  result = result.replace(/<(https?:\/\/[^>]+)>/g, "$1");

  return result;
}

/**
 * Parses a Slack message event and extracts all relevant content.
 * Handles:
 * - Main message text with mention resolution
 * - Forwarded messages (attachments with author)
 * - File attachments
 */
export async function parseSlackMessage(
  event: SlackMessageEvent,
  userResolver: UserResolver,
  groupResolver?: UserGroupResolver,
): Promise<string> {
  const parts: string[] = [];

  // Add main message text (if any)
  if (event.text?.trim()) {
    const formattedText = await formatMentions(
      event.text.trim(),
      userResolver,
      groupResolver,
    );
    parts.push(formattedText);
  }

  // Process forwarded messages / attachments
  if (event.attachments && event.attachments.length > 0) {
    for (const attachment of event.attachments) {
      const attachmentText = await formatAttachment(
        attachment,
        userResolver,
        groupResolver,
      );
      if (attachmentText) {
        parts.push(attachmentText);
      }
    }
  }

  // Process file attachments
  if (event.files && event.files.length > 0) {
    for (const file of event.files) {
      const fileText = formatFile(file);
      if (fileText) {
        parts.push(fileText);
      }
    }
  }

  return parts.join("\n\n");
}

/**
 * Formats a Slack attachment (typically a forwarded message).
 */
async function formatAttachment(
  attachment: SlackAttachment,
  userResolver: UserResolver,
  groupResolver?: UserGroupResolver,
): Promise<string | null> {
  const content = attachment.text || attachment.fallback;
  if (!content && !attachment.author_name) {
    return null;
  }

  const formattedContent = content
    ? await formatMentions(content, userResolver, groupResolver)
    : "";

  if (attachment.author_name) {
    return `From ${attachment.author_name}:\n${formattedContent}`;
  }

  return formattedContent || null;
}

/**
 * Formats a file attachment.
 */
function formatFile(file: SlackFile): string {
  if (file.title && file.title !== file.name) {
    return `[Attached: ${file.name} - ${file.title}]`;
  }
  return `[Attached: ${file.name}]`;
}

/**
 * Creates a user resolver that calls the Slack API.
 * Caches results to avoid redundant API calls.
 */
export function createSlackUserResolver(
  botToken: string,
  fetchFn: typeof fetch = fetch,
): UserResolver {
  const cache = new Map<string, string>();

  return async (userId: string): Promise<string> => {
    // Check cache first
    if (cache.has(userId)) {
      return cache.get(userId)!;
    }

    try {
      const response = await fetchFn(
        `https://slack.com/api/users.info?user=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${botToken}`,
          },
        },
      );

      const data = await response.json();

      if (data.ok && data.user) {
        // Prefer display name, fall back to real name, then username
        const name = data.user.profile?.display_name ||
          data.user.real_name ||
          data.user.name ||
          userId;
        cache.set(userId, name);
        return name;
      }
    } catch {
      // Silently fall back to user ID on error
    }

    // Cache the fallback too to avoid repeated failed lookups
    const fallback = `user_${userId}`;
    cache.set(userId, fallback);
    return fallback;
  };
}

/**
 * Creates a usergroup resolver that calls the Slack API.
 * Caches results to avoid redundant API calls.
 */
export function createSlackUserGroupResolver(
  botToken: string,
  fetchFn: typeof fetch = fetch,
): UserGroupResolver {
  const cache = new Map<string, string>();

  return async (groupId: string): Promise<string> => {
    // Check cache first
    if (cache.has(groupId)) {
      return cache.get(groupId)!;
    }

    try {
      const response = await fetchFn(
        `https://slack.com/api/usergroups.list?include_disabled=false`,
        {
          headers: {
            Authorization: `Bearer ${botToken}`,
          },
        },
      );

      const data = await response.json();

      if (data.ok && data.usergroups) {
        // Cache all usergroups from the response
        for (const group of data.usergroups) {
          cache.set(group.id, group.handle || group.name || group.id);
        }

        // Return the requested group if found
        if (cache.has(groupId)) {
          return cache.get(groupId)!;
        }
      }
    } catch {
      // Silently fall back to group ID on error
    }

    // Cache the fallback too to avoid repeated failed lookups
    const fallback = "group";
    cache.set(groupId, fallback);
    return fallback;
  };
}

/**
 * Gets a permalink to a Slack message.
 */
export async function getMessagePermalink(
  channel: string,
  messageTs: string,
  botToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchFn(
      `https://slack.com/api/chat.getPermalink?channel=${channel}&message_ts=${messageTs}`,
      {
        headers: {
          Authorization: `Bearer ${botToken}`,
        },
      },
    );

    const data = await response.json();

    if (data.ok && data.permalink) {
      return data.permalink;
    }
  } catch {
    // Silently fail - permalink is nice to have but not required
  }

  return null;
}

/**
 * Extracts the original message URL from forwarded message attachments.
 * Returns the first `from_url` found in attachments, or null if none.
 */
export function getOriginalMessageUrl(event: SlackMessageEvent): string | null {
  if (!event.attachments || event.attachments.length === 0) {
    return null;
  }

  for (const attachment of event.attachments) {
    if (attachment.from_url) {
      return attachment.from_url;
    }
  }

  return null;
}
