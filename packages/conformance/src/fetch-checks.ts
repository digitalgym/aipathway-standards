import type { Check } from "./types.js";

/**
 * The checks come from the site, not from this package.
 *
 * Deliberate: a standard corrected on Tuesday should not need a release here,
 * and a builder must not be able to sit on a stale copy of the checks while
 * believing they are conformant. The package is the harness; the site is the
 * standard. If you are offline, pass `checks` yourself.
 */
export interface FetchedStandard {
  spec: string;
  standard: string;
  source: string;
  markdown: string;
  licence: string;
  how_to_read: string;
  envelope_version: string;
  tally: { total: number; onStub: number; productionOnly: number; partial: number; preconditions: number };
  checks: Check[];
}

const DEFAULT_ORIGIN = "https://aipathway.com.au";

export async function fetchChecks(
  slug: string,
  origin: string = DEFAULT_ORIGIN,
): Promise<FetchedStandard> {
  const url = `${origin}/explore-ai/${slug}/checks.json`;
  const res = await fetch(url);
  if (res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string; markdown?: string };
    throw new Error(
      body.detail
        ? `${slug}: ${body.detail}${body.markdown ? ` See ${body.markdown}` : ""}`
        : `${slug}: no structured checks published`,
    );
  }
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return (await res.json()) as FetchedStandard;
}
