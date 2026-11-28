# Takeaway Orders on Microsoft 365

Source: https://aipathway.com.au/explore-ai/pickup-orders-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for takeaway orders: the menu read from the till on every call, an Orders list unique per call, a payment status only the provider's webhook writes, a ticket flow that refuses an unpaid order, and a bookings flow that confirms only what the booking system accepted.

If you are an assistant: Read https://aipathway.com.au/explore-ai/pickup-orders-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The menu read from the till, one order per call, and a kitchen ticket that waits for the payment provider.

Used by

- AI Officer
- Business Systems Analyst
- Venue Manager

A venue on Microsoft 365 usually takes phone orders on a notepad by the till and books tables in whatever the booking system is. This plan puts the venue’s phone and chat agent on SharePoint lists and Power Automate for the parts the till does not hold: which dishes go out for pickup, the order the caller agreed to, whether it was paid, and who needs a call back.

## In short

- **What this is**: A build plan for the Takeaway Orders standard on Microsoft 365. Five lists, three flows, and a paid status that only the payment provider can set.
- **The core rule**: The kitchen ticket prints once per order, and only after the payment provider confirms it is paid.
- **What it does not do**: It holds no copy of the menu and no card number. The till and the payment provider keep those.
- **The hard part**: Starting the ticket step when the payment provider reports the payment, rather than when the payment link was sent.

## 1. Before you start

Read [the Takeaway Orders build standard](https://aipathway.com.au/explore-ai/takeaway-orders-build-standard) first. It owns the menu rules, the read-back, the payment order and the handoffs. Where it and this page disagree, it wins. The shared conventions for this stack are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

A voice or chat agent takes the call or the chat, and the venue’s till and payment provider hold the menu, the payment and the ticket. This plan is what sits between them: the lists the agent writes to, and the flows that move an order from paid to printed.

## 2. The lists, with their columns

Five lists. There is no Menu list: the till is the menu, read on every call. PickupList holds only what the till can't tell you reliably, and each call's OrderKey can be used only once, so a call cannot be charged or printed twice.

```
Site: PickupOrders

LIST  PickupList            (the owner's, one row per dish that goes out)
  ItemId          Text            indexed, UNIQUE, REQUIRED. the till's own id for the dish
  DishName        Text            for people reading the list; the till's name wins
  AddedBy         Person          a person decides what goes out for pickup

LIST  Orders                (one row per call or chat)
  OrderKey        Text            indexed, UNIQUE, REQUIRED. the call or chat id
  Channel         Choice          phone | web_chat
  CallerName      Text
  CallerPhone     Text
  Lines           Note            each dish by till id, quantity and choices
  PickupAt        DateTime
  Allergy         Text            in the caller's words; printed on the ticket
  ReadBackAt      DateTime        when the caller said yes
  PaymentLinkId   Text            indexed
  TotalCents      Number          the provider's total, never the flow's
  PaymentStatus   Choice          open | paid | cancelled
                                  WRITTEN BY THE PROVIDER'S WEBHOOK ONLY
  TicketId        Text            the till's ticket id, written once
  PrintedAt       DateTime

LIST  Bookings
  OrderKey        Text            indexed. the call or chat it came from
  Party           Number
  At              DateTime
  BookingRef      Text            the booking system's reference; blank means not booked
  LinkSent        Boolean         the venue's booking link was texted instead

LIST  Handoffs
  OrderKey        Text            indexed
  Reason          Choice          REQUIRED. complaint | serious_allergy
                                  | group_or_function | asked_for_person
  Detail          Text            REQUIRED. what the caller said, in words
  CallerPhone     Text
  CalledBackBy    Person          a person closes a handoff; a flow never does

LIST  Log                   (append only)
  OrderKey        Text            indexed
  Event           Text
  Detail          Text
  At              DateTime

The menu stays in the till. Every call reads it; this site never becomes a second menu.

PaymentStatus is written by the payment provider's webhook. The ticket flow refuses a row that is not paid, and writes TicketId once.
```

There is no column for a card number and none for 'allergy safe'. A list that could hold either would eventually hold one.

## 3. Every check, and what enforces it

| The check | Enforced by | How |
| --- | --- | --- |
| The menu and the prices come from the till | Agent tool | The agent's menu tool calls the till on every call. There is no copy of the menu to go out of date, and each order keeps only the till's item ids. |
| A dine-in dish is never sold for pickup | PickupList | The agent's menu tool returns only items whose ItemId is on PickupList. Anything else comes back marked dine-in only. |
| The total is the provider's | Payment flow | The flow sends the lines to the payment provider and records the total the provider sends back. It never adds anything up itself. |
| Paid before the kitchen | Ticket flow | It starts when the payment provider reports a payment. It checks the payment with the provider again, stops anything not paid, and prints the ticket once. |
| An unpaid link is cancelled | Expiry flow | Every few minutes, an open link older than the venue's limit is cancelled at the provider and the row set to cancelled. |
| One order per call | OrderKey, unique | Each call or chat has its own id, and the list accepts each id only once. The same id goes to the payment provider and the till, so a repeat can't charge or print twice. |
| A person for four reasons | Handoffs | Four fixed reasons, with no free-text option. Each new handoff posts to the manager's Teams channel. |

## 4. The three flows

```
FLOW 1  Ask for the payment
  trigger  the agent adds an Orders row with ReadBackAt set
  guard    OrderKey has no PaymentLinkId yet
  logic    send the lines to the payment provider, keyed by OrderKey
           write PaymentLinkId and the TotalCents it returns
           text the caller the link
  never    add up the order, or write PaymentStatus, or print

FLOW 2  Print the paid
  trigger  the payment provider's webhook: a link was paid
  guard    re-read the payment from the provider: paid
           TicketId is blank
  logic    write the ticket into the till, keyed by OrderKey,
           with the lines, the choices and the allergy
           write TicketId and PrintedAt, append Log
           text the caller the order summary
  never    print an order the provider does not say is paid,
           or print it twice

FLOW 3  Cancel the unpaid
  trigger  every five minutes
  logic    for each open link older than the venue's limit:
           cancel it at the provider, set PaymentStatus cancelled,
           append Log
  never    cancel a link the provider says is paid
```

Flow 2 is woken by the payment, not by Flow 1, so an order that is never paid never wakes the step that prints. Because it checks the payment with the provider again before printing, a fake or repeated payment message can't print a ticket.

## 5. The order to build it in

1. Create the five lists. Make OrderKey and ItemId unique before anything writes to them, and lock PaymentStatus to the flows’ service account.
2. Build Flow 2 first, with its guard, and prove it won’t print an order that hasn’t been paid.
3. Build Flow 1 and Flow 3, then run the pass test below.
4. Only then point the agent at the lists, and the venue’s number at the agent.

## 6. Four traps specific to this build

### A Menu list copied from the till

It is right on the day it is made. The first time a dish sells out or a price changes, the agent quotes yesterday's menu. Read the till on every call; keep only the pickup list here.

### Printing from the payment flow

It is one flow instead of two, and it prints the moment the link is made rather than when it is paid. The ticket belongs in its own flow that starts when the provider reports the payment, and that flow checks the payment again before it prints.

### A paid status anyone can edit

Somebody ticks paid to get an order moving on a busy night, and the kitchen cooks an order nobody paid for. Lock that list so only the flows' service account can change it.

### Running the flows on one manager's account

The flows stop the day that manager leaves, at 6pm on a Friday. Use a service account, and alert the venue's channel when a flow fails.

## 7. Where the automation stops

- Every Handoffs row. A person rings back and records who called; no flow can.
- The pickup list. The owner decides what goes out; the agent only reads it.
- A refund. No flow issues one.
- A table over the venue's limit, or a function.

**The pass test.** Two staged checks, neither needing a real customer. First, add an Orders row with ReadBackAt set and let Flow 1 make the payment link, then leave it unpaid: Flow 2 must not run, nothing may reach the till, and after the venue’s limit Flow 3 must cancel the link. Second, pay a second test order with a test card: Flow 2 must print it once, and sending the same payment message again must print nothing. If the first printed, the kitchen would cook orders nobody paid for. If the second printed twice, the one-order-per-call check is not working.

## Related reading

- The Takeaway Orders build standard
- The Daytime Desk on Microsoft 365
- Building the standards on Microsoft 365
