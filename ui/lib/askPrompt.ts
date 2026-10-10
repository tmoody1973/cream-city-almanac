// The guide's examples open Ask with a question typed in (?prompt=…), never sent.
export const MAX_PROMPT = 500;

export function readPrompt(search: string): string {
  return (new URLSearchParams(search).get("prompt") ?? "").trim().slice(0, MAX_PROMPT);
}

export const askHref = (question: string) => `/ask?prompt=${encodeURIComponent(question)}`;

// Phones keep /ask; laptops open Ask's column on the search page, so the prompt travels with the redirect.
export function laptopAskHref(search: string): string {
  const prompt = readPrompt(search);
  return prompt ? `/search?ask=1&prompt=${encodeURIComponent(prompt)}` : "/search?ask=1";
}

// Once placed, the prompt leaves the address, so a reload doesn't put it back.
export function withoutPrompt(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("prompt");
  return `${url.pathname}${url.search}`;
}
