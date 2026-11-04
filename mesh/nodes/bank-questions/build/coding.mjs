/**
 * Bank Questions: turning the client's answers into coding suggestions.
 *
 * This runs after the answers are filed (evidence.filed), on the answers read
 * back by their message_id. It drafts one suggestion per bank line for the
 * bookkeeper, from the practice's own written rules, and codes nothing in
 * Xero. The bookkeeper accepts, changes or ignores each one in Xero's own
 * reconcile screen.
 *
 * The rules are the practice's, written by a person against its chart of
 * accounts, for example:
 *
 *   { words: ["fuel", "petrol", "diesel", "ute"], account: "449", name: "Motor Vehicle Expenses", tax: "GST on Expenses" }
 *   { words: ["personal", "private", "groceries"], account: "880", name: "Owner A Drawings", tax: "BAS Excluded" }
 *
 * What it never does: guess when an answer fits no rule or more than one,
 * split a mixed business and private amount, or mark a line coded. Each of
 * those is left for the bookkeeper with the client's own words beside it.
 */

const MIXED = /\b(partly|part of|half|some (of it )?(was )?(personal|private)|split|mixed|both)\b/i;

const words = (s) => String(s ?? "").toLowerCase();

/**
 * @param {Array<{ lineId: string, date: string, amount: number, description?: string, answer: string }>} lines
 *   lineId is the bank line's id from the feed (a payment_id).
 * @param {Array<{ words: string[], account: string, name: string, tax: string }>} rules
 */
export function suggestCodes(lines, rules) {
  return lines.map((line) => {
    const base = { lineId: line.lineId, date: line.date, amount: line.amount, client_said: line.answer, status: "for_bookkeeper" };
    const said = words(line.answer).trim();
    if (!said) return { ...base, suggestion: null, reason: "no answer for this line yet" };
    if (MIXED.test(said)) return { ...base, suggestion: null, reason: "mixed business and private use: the split is the bookkeeper's call" };
    const hits = rules.filter((r) => r.words.some((w) => new RegExp(`\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(said)));
    const accounts = [...new Set(hits.map((r) => r.account))];
    if (accounts.length === 0) return { ...base, suggestion: null, reason: "the answer fits none of the practice's rules" };
    if (accounts.length > 1) return { ...base, suggestion: null, reason: `the answer fits more than one rule (${accounts.join(", ")})` };
    const r = hits[0];
    return { ...base, suggestion: { account: r.account, name: r.name, tax: r.tax }, reason: `matched the practice's rule for ${r.name}` };
  });
}
