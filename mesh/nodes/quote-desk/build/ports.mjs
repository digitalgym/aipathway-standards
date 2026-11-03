/**
 * Your real systems, behind the same ports the stub offered.
 *
 * The stub proved the shape. This proves the write landed. Same checks, same
 * scenarios, same build: the only thing that changes is what is behind the
 * ports, which is the point.
 *
 *   AIPATHWAY_ENV=production node run.mjs
 *
 * EVERY METHOD MAY BE ASYNC. A real write is; the stub's was not. Builds await
 * every port call, which costs nothing against the stub and is what lets one
 * build run in both worlds.
 *
 * A method left out throws when the build calls it, naming the port. That is
 * deliberate. Falling back to the stub for the one system under test would
 * produce a green run that proves less than no run at all.
 *
 * What is NOT here, and will not be: the live number, AI disclosure, Do Not
 * Call washing, calling hours by state, and the record that survives a dispute.
 * Those checks report `with_us`. They are the step quote-out-build-standard
 * says not to hand-roll.
 */

/** @type {Partial<Record<keyof typeof import("@aipathway/conformance").QUOTE_PORT_MAP, Function>>} */
export const ports = {
  // Example. Delete it and wire your own.
  //
  // async readPricebook() {
  //   const items = await xero.items();
  //   return items.map((i) => ({ catalogueId: i.Code, description: i.Name, rate: Math.round(i.SalesDetails.UnitPrice * 100) }));
  // },
  // async draftQuote({ jobId, lines }, intentId) {
  //   const q = await xero.createQuote({ Status: "DRAFT", Reference: `job:${jobId}`, LineItems: lines.map((l) => ({ ItemCode: l.catalogueId })) });
  //   return q ? { id: q.QuoteID, jobId, lines, total: lines.reduce((s, l) => s + l.rate, 0), state: "draft", updates: 0 } : null;
  // },
};
