// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/live.ts
// Rebuild: node scripts/build-conformance-package.mjs
import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/**
 * The world a build runs in once its ports are wired to real systems.
 *
 * ── WHAT THIS IS FOR ──
 *
 * The stub proves the shape: a simulated call, an in-memory job board, and
 * eleven checks that go green on a laptop. It cannot prove the write landed,
 * because the world it writes into is one the runner made up. The moment a
 * builder connects ServiceM8, Simpro or Xero, the same checks should run again
 * and mean something stronger, with only the live phone number left over.
 *
 * `verdictFor` in types.ts already encodes that: a check marked `production`
 * reports `with_us` on the stub and is actually evaluated when the environment
 * is `production`. This is the missing half, the world that environment runs
 * in. It owns no state of its own. The state is the builder's real system; what
 * this owns is the RECORD of what the build did to it.
 *
 * ── WHY ASSERTIONS STILL WORK ──
 *
 * Most checks in these standards assert about the trace rather than about
 * memory: a resolve_address call appears, exactly one write_job, no write_job
 * at all, a notify follows the failed write, send_sms only in the consenting
 * run. Every one of those reads `world.calls`, which this keeps in exactly the
 * shape `StubWorld` keeps it. So a scenario whose `holds` reads the trace runs
 * unchanged in both environments, which is the property that makes a second run
 * worth anything.
 *
 * A scenario whose `holds` reaches into `world.jobs` is a stub-only scenario by
 * construction. That is not a flaw to paper over: in production the job lives in
 * ServiceM8, and the honest way to assert on it is to read it back through a
 * port, which puts the read in the trace where it belongs.
 *
 * ── EVERY PORT IS AWAITED ──
 *
 * A real write is asynchronous and a stub write is not. Builds are therefore
 * written with `await` on every port call: `await ports.writeJob(...)`. That
 * costs nothing against the stub, because awaiting a plain value yields the
 * value, and it is the only way one build runs in both worlds. `runCheck`
 * already awaits the drive, so nothing else had to change.
 *
 * ── WHAT IT REFUSES TO DO ──
 *
 * A port with no implementation throws, naming the port and the method. It does
 * not fall back to a stub. A live run that quietly substituted a fake for the
 * one system under test would produce a green result that means less than no
 * result at all, which is the failure this whole package exists to prevent.
 */

/** Which port each method of a world's `ports()` object speaks through. */
export type PortMap<P> = { readonly [K in keyof P]?: Port };

/**
 * The call world's methods, mapped to the ports they speak through.
 *
 * These are the same pairings `StubWorld.ports()` makes internally, lifted out
 * as data so a live implementation can be recorded against the same vocabulary.
 * Two methods share `write_job` on purpose: creating and updating a job are the
 * same port with different payloads, and the idempotency check reads both.
 */
export const CALL_PORT_MAP = {
  disclose: "disclose",
  say: "talk",
  hear: "talk",
  resolveAddress: "resolve_address",
  findOpenJob: "read_job",
  writeJob: "write_job",
  updateJob: "write_job",
  notify: "notify",
  escalate: "escalate",
  sendSms: "send_sms",
} as const satisfies Record<string, Port>;

/**
 * The quote world's methods, mapped to the ports they speak through.
 *
 * `draftQuote` and `updateQuote` share `draft_quote` for the same reason the
 * call world's two job writes share `write_job`: creating the draft and the
 * second pass that finds it are one port with two payloads, and check 5 (one
 * quote per job) reads both. There is no send port. A build handed this map
 * cannot express sending, which is how check 7 is proved rather than promised.
 */
export const QUOTE_PORT_MAP = {
  readJob: "read_job",
  readPricebook: "read_pricebook",
  draftQuote: "draft_quote",
  updateQuote: "draft_quote",
  escalate: "escalate",
  notify: "notify",
} as const satisfies Record<string, Port>;

export interface LiveOptions {
  /**
   * The clock. Real time by default.
   *
   * Overridable because some checks are about when a thing happened rather than
   * that it happened, and a builder testing an after-hours rule against a live
   * system should not have to wait until 8:30pm to do it.
   */
  now?: () => Date;
}

/**
 * Wraps a builder's real port implementations and records every call.
 *
 * `impl` is partial on purpose. A builder wiring one system at a time gets a
 * clear error naming the port they have not connected yet, rather than a type
 * error listing everything at once.
 */
export class LiveWorld<P extends object> {
  readonly calls: PortCall[] = [];

  constructor(
    private readonly impl: Partial<P>,
    private readonly map: PortMap<P>,
    private readonly opts: LiveOptions = {},
  ) {}

  private clock(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  /**
   * The ports handed to the build.
   *
   * Built from the map rather than from `impl`, so a method the builder has not
   * implemented still EXISTS and throws when called. If it were absent, the
   * build would fail with "not a function", which says nothing about which
   * system is missing.
   */
  ports(): P & { now(): Date } {
    const out: Record<string, unknown> = { now: () => this.clock() };

    for (const method of Object.keys(this.map) as (keyof P & string)[]) {
      const port = this.map[method];
      if (!port) continue;

      out[method] = async (...args: unknown[]) => {
        const fn = this.impl[method];
        if (typeof fn !== "function") {
          throw new Error(
            `Port not connected: ${method}() speaks through "${port}". ` +
              `Implement it in your ports file before running against production.`,
          );
        }

        const startedAt = this.clock();
        const response = await (fn as (...a: unknown[]) => unknown)(...args);
        const shape = PORT_SHAPE[port];

        this.calls.push({
          at: startedAt.toISOString(),
          port,
          verb: shape.verb,
          subject: shape.subject,
          // One argument is the common case and reads better in a fixture than
          // a one-element array; more than one is kept as given.
          request: args.length === 1 ? args[0] : args,
          response: response ?? null,
          elapsedMs: this.clock().getTime() - startedAt.getTime(),
        });

        return response;
      };
    }

    return out as P & { now(): Date };
  }
}
