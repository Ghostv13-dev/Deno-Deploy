import type { Env } from "../env";
import * as d1 from "../storage/d1";

export async function createContentFromCommand(
  env: Env,
  title: string,
  body: string,
) {
  return d1.createContent(env, title, body);
}

export async function editContentBody(env: Env, contentId: string, newBody: string) {
  await d1.updateContentBody(env, contentId, newBody);
}

export function formatContentSummary(content: d1.Content): string {
  return `${content.title}\n\n${content.body}`;
}

export function formatContentList(items: d1.Content[]): string {
  if (items.length === 0) return "No content yet. Create some with /new.";
  return items
    .map((c) => `• ${c.id} — ${c.title}`)
    .join("\n");
}
