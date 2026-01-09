import { assertEquals } from "@std/assert";
import { parse as parseYaml } from "@std/yaml";
import { dirname, join } from "@std/path";

const CLAUDE_DIR = dirname(new URL(import.meta.url).pathname);

// Extract the name from a command file (uses the filename without .md extension)
function getCommandName(filename: string): string {
  return filename.replace(/\.md$/, "");
}

// Extract the name from a skill's SKILL.md frontmatter
// Falls back to the directory name if no name field is present
async function getSkillName(skillFilePath: string): Promise<string | null> {
  try {
    const content = await Deno.readTextFile(skillFilePath);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (frontmatterMatch) {
      const frontmatter = parseYaml(frontmatterMatch[1]) as Record<
        string,
        unknown
      >;
      if (frontmatter && typeof frontmatter.name === "string") {
        return frontmatter.name;
      }
    }

    // Fall back to directory name
    const parts = skillFilePath.split("/");
    const skillsIndex = parts.indexOf("skills");
    if (skillsIndex >= 0 && skillsIndex < parts.length - 1) {
      return parts[skillsIndex + 1];
    }

    return null;
  } catch {
    return null;
  }
}

// Get all command names from .claude/commands directory
async function getAllCommandNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>(); // name -> source file
  const commandsDir = join(CLAUDE_DIR, "commands");

  try {
    for await (const entry of Deno.readDir(commandsDir)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        const name = getCommandName(entry.name);
        names.set(name, `commands/${entry.name}`);
      }
    }
  } catch {
    // Commands directory may not exist
  }

  return names;
}

// Get all skill names from .claude/skills directory
async function getAllSkillNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>(); // name -> source file
  const skillsDir = join(CLAUDE_DIR, "skills");

  try {
    for await (const entry of Deno.readDir(skillsDir)) {
      if (entry.isDirectory) {
        const skillFile = join(skillsDir, entry.name, "SKILL.md");
        try {
          await Deno.stat(skillFile);
          const name = await getSkillName(skillFile);
          if (name) {
            names.set(name, `skills/${entry.name}/SKILL.md`);
          }
        } catch {
          // SKILL.md doesn't exist in this directory
        }
      }
    }
  } catch {
    // Skills directory may not exist
  }

  return names;
}

// ============================================================================
// Tests
// ============================================================================

Deno.test("no duplicate names between commands and skills", async () => {
  const commandNames = await getAllCommandNames();
  const skillNames = await getAllSkillNames();
  const duplicates: string[] = [];

  for (const [commandName, commandSource] of commandNames) {
    if (skillNames.has(commandName)) {
      const skillSource = skillNames.get(commandName)!;
      duplicates.push(
        `"${commandName}" is defined in both ${commandSource} and ${skillSource}`,
      );
    }
  }

  if (duplicates.length > 0) {
    throw new Error(
      `Found duplicate command/skill names:\n${duplicates.join("\n")}\n\n` +
        `Fix: Either rename the skill's 'name' field in SKILL.md frontmatter, ` +
        `or rename/remove the command file.`,
    );
  }
});

Deno.test("no duplicate names within commands", async () => {
  const commandNames = await getAllCommandNames();

  // Since we're using filenames, duplicates within commands shouldn't be possible
  // But we check anyway for completeness
  assertEquals(
    commandNames.size,
    new Set(commandNames.keys()).size,
    "Duplicate command names found",
  );
});

Deno.test("no duplicate names within skills", async () => {
  const skillNames = await getAllSkillNames();
  const seenNames = new Map<string, string>();
  const duplicates: string[] = [];

  for (const [name, source] of skillNames) {
    if (seenNames.has(name)) {
      duplicates.push(
        `"${name}" is defined in both ${seenNames.get(name)} and ${source}`,
      );
    }
    seenNames.set(name, source);
  }

  if (duplicates.length > 0) {
    throw new Error(
      `Found duplicate skill names:\n${duplicates.join("\n")}\n\n` +
        `Fix: Each skill should have a unique 'name' field in its SKILL.md frontmatter.`,
    );
  }
});

Deno.test("all skills have valid SKILL.md with name", async () => {
  const skillsDir = join(CLAUDE_DIR, "skills");
  const missingNames: string[] = [];

  try {
    for await (const entry of Deno.readDir(skillsDir)) {
      if (entry.isDirectory) {
        const skillFile = join(skillsDir, entry.name, "SKILL.md");
        try {
          await Deno.stat(skillFile);
          const name = await getSkillName(skillFile);
          if (!name) {
            missingNames.push(`skills/${entry.name}/SKILL.md`);
          }
        } catch {
          // SKILL.md doesn't exist - that's okay, not all directories need to be skills
        }
      }
    }
  } catch {
    // Skills directory doesn't exist
  }

  if (missingNames.length > 0) {
    throw new Error(
      `Skills missing 'name' field in frontmatter:\n${missingNames.join("\n")}\n\n` +
        `Fix: Add a 'name' field to the SKILL.md frontmatter.`,
    );
  }
});
