/**
 * Deliberately broken builds. Each one gets one rule of the standard wrong, so
 * the scenarios can be shown to go red for it. Run with: node broken/check.mjs
 */
import { build as real } from "../build.mjs";

const wrap = (patch) => (ports, inbox) => real({ ...ports, ...patch(ports) }, inbox);

export const broken = {
  // Does nothing at all.
  "do-nothing": async () => {},

  // Stores the first due date it sees and never re-derives it.
  "stored-dates": (() => {
    const kept = new Map();
    return wrap((p) => ({
      dueDate: (id) => {
        if (!kept.has(id)) kept.set(id, p.dueDate(id));
        return kept.get(id);
      },
    }));
  })(),

  // Drops the history, so a past due date is never explained or questioned.
  "no-history": wrap((p) => ({ readObligations: () => p.readObligations().map(({ history, ...o }) => o) })),

  // One national rule: whichever state's date it read first for a check type.
  "national-rule": (ports, inbox) => {
    const types = new Map(ports.readObligations().map((o) => [o.id, o.obligationType]));
    const first = new Map();
    return real(
      {
        ...ports,
        dueDate: (id) => {
          const t = types.get(id);
          if (!first.has(t)) first.set(t, ports.dueDate(id));
          return first.get(t);
        },
      },
      inbox,
    );
  },

  // Assumes today when the last-check date is missing.
  "default-today": wrap((p) => ({
    readObligations: () => p.readObligations().map((o) => ({ ...o, anchorDate: o.anchorDate ?? p.now().toISOString() })),
  })),

  // Counts a "done" with no report as done.
  "tick-is-done": wrap((p) => ({ complete: (id, ref) => p.complete(id, ref ?? "tick") })),

  // Treats parking the item as closing the obligation.
  "refusal-closes": wrap((p) => ({ recordRefusal: (id) => p.complete(id, "owner-declined") })),

  // Releases its own drafted booking.
  "auto-release": wrap((p) => ({
    prepareNotice: (id) => {
      p.prepareNotice(id);
      p.releaseNotice(id, "plant-watch");
    },
  })),

  // Works out overdue itself and drops the item once it is done, so the
  // register's overdue history is never consulted.
  "self-clearing": wrap((p) => ({
    sweep: () =>
      p
        .readObligations()
        .filter((o) => !o.completedAt && p.dueDate(o.id) && p.dueDate(o.id).date < p.now().toISOString())
        .map((o) => o.id),
  })),
};
