# AIP-BS-REVIEW-REQUEST: review-request-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/review-request-build-standard (edition 2026-10-24)
**Markdown:** https://aipathway.com.au/explore-ai/review-request-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/review-request-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Twelve of these fourteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **trigger-is-the-job-finished** The ask starts when the job system says the job is finished. The trigger is the job marked complete, or paid, whichever the business picked and wrote down, read from the job system itself. Not a list somebody typed, not a guess from the calendar. A job still in progress is never asked about.
- **the-wait-is-written** The ask waits the written time after the job is finished. The business writes down how long to wait (two hours, say) so the customer has seen the result. Nothing goes before that, whichever run of the build happens to notice the job first.
- **same-message-same-link** Every customer gets the same message and the same review link. One message for everyone: thanks, how did we go from 1 to 5, and the business's Google review link, with the business's name and a way to opt out. Nobody gets a different link, a private feedback form instead, or a second message because of what they replied.
- **not-finished-is-held** A job that is not really finished is held, with the reason. An open callback or rework job, an invoice marked disputed, or an open complaint recorded on the job in the job system means the job is not finished yet. The ask is held and the owner is told why. The hold reads the job, the same way for every customer, and is never based on a score, a guess at how the customer feels, or anything they said.
- **read-again-before-sending** The job is read again at the moment of sending. A callback raised during the wait holds the ask, even though the job looked finished when it was first seen. The decision is made on the job as it stands when the message would go.
- **hold-clears-the-same-way** When the hold clears, the same ask goes the same way. Once the callback is closed, the dispute is settled or the complaint is closed in the job system, the customer gets exactly the message everyone else got. A hold is not a way to skip an awkward customer, whatever way the dispute ended.
- **one-ask-per-customer-per-window** One ask per customer, however many jobs they had. At most one ask per customer in the window the business writes down (thirty days, say), and never two for one job. A customer with three jobs in a week hears from you once.
- **channel-and-opt-out** Asked only on the channel on record, and a STOP is for good. SMS or email, whichever the customer's record holds. A customer with neither is an exception, not a guess. A STOP or unsubscribe is recorded against the customer, not the job, and no later job ever asks them again.
- **one-reminder-then-stop** One reminder if nothing comes back, then stop. If there is no reply and the business has not marked a review as posted after the written interval, one reminder goes with the same link. A reply, a STOP or a review marked as posted stops it. There is never a third message.
- **low-score-alerts-the-owner** A low score tells the owner to call, and changes nothing for the customer. A reply of 1, 2 or 3 sends the owner an alert with the job, the customer and their words, so they can ring while it is fixable. The customer keeps the link they already have. Nothing asks them not to post, and nothing routes them anywhere else. A high score gets no extra push either.
- **never-makes-up-or-rewards-a-review** It never makes up, rewards or answers a review. The build never writes a review, suggests what to say or how many stars, offers anything in exchange (a discount, a voucher, a draw), posts anywhere, or replies to a review on Google. Answering reviews is the owner's job. There is nothing in the build that could post.
- **the-record-by-job** Every ask, reminder, reply, hold and alert is on the record by job. Kept so that a customer who says they were pestered, or a question about how the reviews came in, is answered from the record: what went, when, on which channel, what came back word for word, and why a job was held.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted product. Reading the job's status, linked callbacks and invoice state from ServiceM8, Simpro, Fergus, Jobber or AroFlo at the moment of sending, and bringing SMS replies and STOPs back from the carrier, run on the business's own job system and messaging account and are quoted as a scoped build. Send the failing check id for a fixed price; do not build the live step yourself.
