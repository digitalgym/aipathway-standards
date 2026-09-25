// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/connect.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * `conformance connect`: get a key from the hosted provider without leaving
 * the terminal, and find out what the account still needs.
 *
 * THE SHAPE. Office Voice has a device-code flow for API keys. We ask for a key
 * naming the scopes a conformance run needs, print a link and a code, and poll.
 * The owner opens the link, signs in, checks the code matches, approves. The
 * key comes back exactly once and is written to `.env` beside the scaffold,
 * which `run.mjs` reads and `.gitignore` refuses. Then `get_setup` says what is
 * still missing and, where it is a job system, hands over the link the owner
 * opens for that too.
 *
 * WHAT THIS NEVER ASKS FOR. `campaigns:initiate`, the scope that makes a phone
 * ring. The provider refuses it on this path anyway; we do not send it.
 *
 * Pure where it can be. The pieces that touch the network take `fetch` and a
 * sleep as arguments, so the tests drive them without a provider.
 */

export const DEFAULT_ORIGIN = "https://office-voice.com";
/** The scopes a conformance run needs: read the book, write the job or quote, finish setup. */
export const CONNECT_SCOPES = ["contacts:read", "contacts:write", "account:write"] as const;

export interface KeyRequested {
  ok: true;
  request_id: string;
  user_code: string;
  poll_secret: string;
  verify_url: string;
  poll_url: string;
  expires_at: string;
  expires_in: number;
  interval: number;
}

export type Polled =
  | { status: "pending"; interval?: number }
  | { status: "approved"; key: string; key_prefix?: string; tenant_ids?: string[] }
  | { status: "consumed" | "denied" | "expired" | "not_found" | "bad_request"; error?: string };

export interface Net {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now?: () => number;
}

export const realNet: Net = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

export async function requestKey(
  origin: string,
  input: { name: string; scopes?: readonly string[]; requester?: string },
  net: Net = realNet,
): Promise<KeyRequested> {
  const res = await net.fetch(`${origin}/api/keys/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: input.name, scopes: input.scopes ?? CONNECT_SCOPES, requester: input.requester }),
  });
  const body = (await res.json()) as KeyRequested | { ok: false; error: string };
  if (!res.ok || !body.ok) throw new Error(`key request refused: ${(body as { error?: string }).error ?? res.status}`);
  return body;
}

/**
 * Poll until the owner decides or the request expires. Resolves with the final
 * answer rather than throwing on a refusal, so the CLI can say what happened.
 */
export async function waitForDecision(
  req: Pick<KeyRequested, "request_id" | "poll_secret" | "poll_url" | "interval" | "expires_at">,
  net: Net = realNet,
  onTick?: () => void,
): Promise<Polled> {
  const deadline = new Date(req.expires_at).getTime() + 15_000;
  let interval = Math.max(1, req.interval || 3) * 1000;
  for (;;) {
    const res = await net.fetch(req.poll_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request_id: req.request_id, poll_secret: req.poll_secret }),
    });
    const body = (await res.json()) as Polled;
    if (body.status !== "pending") return body;
    if (typeof body.interval === "number" && body.interval > 0) interval = body.interval * 1000;
    if ((net.now ?? Date.now)() > deadline) return { status: "expired" };
    onTick?.();
    await net.sleep(interval);
  }
}

/**
 * Upsert KEY=value lines into an env file's text. Keeps everything else,
 * comments included, so a builder's own variables survive.
 */
export function renderEnv(existing: string, vars: Record<string, string>): string {
  const lines = existing.split(/\r?\n/);
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const m = /^([A-Z_][A-Z0-9_]*)=/.exec(line.trim());
    if (m && vars[m[1]!] !== undefined) {
      seen.add(m[1]!);
      return `${m[1]}=${vars[m[1]!]}`;
    }
    return line;
  });
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  for (const [k, v] of Object.entries(vars)) if (!seen.has(k)) out.push(`${k}=${v}`);
  return out.join("\n") + "\n";
}

/** Read KEY=value lines into an object. Quotes around a value are stripped. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  return out;
}

/** `.gitignore` text with `.env` in it, adding the line only when absent. */
export function ensureIgnored(gitignore: string, entry = ".env"): string {
  const has = gitignore.split(/\r?\n/).some((l) => l.trim() === entry);
  if (has) return gitignore;
  const base = gitignore.length && !gitignore.endsWith("\n") ? gitignore + "\n" : gitignore;
  return `${base}# written by conformance connect; holds the provider key\n${entry}\n`;
}

/** One MCP tools/call over Streamable HTTP, the same call the ports file makes. */
export async function mcpCall(
  mcpUrl: string,
  key: string,
  tool: string,
  args: Record<string, unknown>,
  net: Net = realNet,
): Promise<Record<string, unknown>> {
  const res = await net.fetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  });
  if (!res.ok) throw new Error(`${tool}: HTTP ${res.status} from ${mcpUrl}`);
  const body = (await res.json()) as { error?: { message: string }; result?: { structuredContent?: unknown; content?: { text?: string }[]; isError?: boolean } };
  if (body.error) throw new Error(`${tool}: ${body.error.message}`);
  const out = (body.result?.structuredContent ?? JSON.parse(body.result?.content?.[0]?.text ?? "{}")) as Record<string, unknown>;
  if (body.result?.isError || out["error"]) throw new Error(`${tool}: ${String(out["error"] ?? "tool error")}`);
  return out;
}

export interface SetupSummary {
  complete: boolean;
  lines: string[];
  /** The one link the owner should open next, if any. */
  openNext: { url: string; why: string } | null;
}

/**
 * `get_setup` as a few lines a person can act on. The provider already names
 * what fixes each gap; this only decides which link goes first: a job system
 * or ledger before anything else, since nothing runs without one.
 */
export function summariseSetup(setup: Record<string, unknown>): SetupSummary {
  const missing = Array.isArray(setup["missing"]) ? (setup["missing"] as { what: string; fix: string }[]) : [];
  const connect = (setup["connect"] ?? {}) as Record<string, string>;
  const integrations = Array.isArray(setup["integrations"]) ? (setup["integrations"] as { platform: string; status: string }[]) : [];
  const pricebook = (setup["pricebook"] ?? {}) as { status?: string; platform?: string | null; reason?: string };
  const quoteDrafting = String(setup["quote_drafting"] ?? "");
  const lines: string[] = [];
  const business = (setup["business"] ?? {}) as { name?: string; timezone?: string };
  lines.push(`Account: ${business.name ?? "(unnamed)"} · ${business.timezone ?? ""}`.trim());
  lines.push(
    integrations.length
      ? `Connected: ${integrations.map((i) => `${i.platform} (${i.status})`).join(", ")}`
      : "Connected: nothing yet",
  );
  lines.push(`Price list: ${pricebook.status ?? "unknown"}${pricebook.platform ? ` on ${pricebook.platform}` : ""}${pricebook.reason ? ` — ${pricebook.reason}` : ""}`);
  if (quoteDrafting && quoteDrafting !== "not_available") lines.push(`Quote drafting: ${quoteDrafting.replace("_", " ")}`);
  for (const m of missing) lines.push(`  missing: ${m.what} → ${m.fix}`);

  let openNext: SetupSummary["openNext"] = null;
  const hasXero = integrations.some((i) => i.platform === "xero" && i.status === "active");
  if (!integrations.length && connect["xero_with_quote_drafting"]) {
    openNext = { url: connect["xero_with_quote_drafting"], why: "connect Xero with quote drafting on (the owner signs in and approves)" };
  } else if (hasXero && quoteDrafting === "not_granted" && connect["xero_with_quote_drafting"]) {
    openNext = { url: connect["xero_with_quote_drafting"], why: "reconnect Xero with quote drafting on" };
  }
  return { complete: missing.length === 0, lines, openNext };
}
