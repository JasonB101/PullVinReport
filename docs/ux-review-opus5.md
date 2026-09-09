# PullVinReport — paid report design review

**Reviewer:** Claude Opus 5 · **Branch:** `cursor/report-layout-pass-and-ai-brief-46d0` (PR #4) · **Date:** Sep 9, 2026
**Scope:** frontend + UX of the paid report surface. No redesign implemented; one contained bug fixed (see P1-6).

Evidence: the five supplied 1280px screenshots of the paid 2021 Subaru Legacy, plus the live `/sample` route rendered
headlessly at 390×844 and 1280×900 for measurements. `/sample` and a paid report share `ReportView`, so layout
mechanics measured on the sample hold for the paid page.

---

## 1. Executive verdict

This is a genuinely good report — better than most of what $14.99 buys in this category. The collapse pass worked:
the record sections are short, honest, and no longer a field dump, and the writing throughout is calm and
non-manipulative, which is the hardest thing to get right on a salvage-title report. But the pass went one step too
far in one place and not far enough in another. Too far: the collapsed history cards now have **no visible way to
open them**, so the records the buyer actually paid for read as five one-line rows and may never be expanded. Not far
enough: the AI brief has become the report. On a phone the "What to know" card is 1,941px tall against 450px for
every VIN record section combined — the buyer is reading 4× more generated prose than purchased data. Add two
correctness problems that undermine the one thing this product sells (a Copart total-loss entry that never appears in
the chips or the findings strip, and a branded-salvage car scoring **78/100**) and this is a conditional go: the
blockers are four contained fixes, not a redesign.

---

## 2. What's working

- **The collapse decision is right.** Closed sections are 82–102px and lead with the one line that matters
  (`Sep 27, 2024 · TN · 121,477 mi · Title transfer`). This is the single biggest improvement over the previous pass
  and over the competition, who pad reports to feel expensive.
- **Nothing is deleted, only folded.** `<details>` works without JavaScript and the print stylesheet force-opens
  every disclosure, so a printed or PDF'd copy is complete. That is the correct trade and it is rare.
- **The honesty of the copy is a real asset.** "Nothing on file means no matching record was found — not that an
  event never happened" and "Common for this model — not confirmed on this VIN" are the two sentences most vendors
  in this space refuse to write. Keep them.
- **"Also for this model" is correctly placed and correctly labelled.** After every VIN section, with a `Not this
  VIN` chip *and* a restating sentence *and* a third "— not this VIN" inline. The placement question in the brief is
  already answered well; my note on it (P2-9) is about weight, not labelling.
- **Sold-over-TBD disposition collapse** is exactly the kind of judgment that makes a report readable without
  rewriting history. Showing both rows would have read as two events.
- **Listing episodes** are the strongest original idea here. Folding 40 sister-rooftop scrapes into "4 chapters ·
  40 snapshots" is the difference between a buyer thinking the car sold four times and understanding it was
  advertised. No competitor does this.
- **The sample is the same component as the paid report**, so the sample can never drift from what is sold.

---

## 3. Priority fixes

### P0 — blocks launch

#### P0-1. Collapsed history cards have no affordance to open. This is the big one.

`SectionFace` renders a title, a count chip and a lead line inside a `<summary>` whose marker is suppressed
(`list-none [&::-webkit-details-marker]:hidden`) with no replacement. Measured in the DOM: `list-style-type: none`
and no `.when-closed` open-label on any of `#titles`, `#accidents`, `#liens`, `#sales`, `#recalls`. The only signal
that these cards are interactive is `cursor-pointer`, which does not exist on touch.

The product already has the right pattern three times over — `HeaderSpecs` shows "20 more details",
`ReportHealthCard` shows "Why this score", `ListingGroupCard` shows "Show 4 listing snapshots" — all in brand blue.
The section cards are the one place it was omitted, and they are the place it matters most.

**Recommendation.** In `SectionFace` (`src/components/report-view.tsx`), add a closed-state row under the lead line,
matching the existing `ListingGroupCard` treatment exactly:

```tsx
<span className="when-closed mt-2 flex items-center gap-1 text-sm font-medium text-brand-600">
  Show {sectionCountLabel(section)}
  <ChevronDown className="h-4 w-4" aria-hidden />
</span>
```

Plus a rotating chevron pinned to the card's top-right that persists when open, so the card reads as a control in
both states. If you add only one thing from this document, add this.

#### P0-2. On a phone, the title-brand column is off-screen with no scroll affordance.

Measured at 390px with `#titles` expanded: the table needs **505px inside a 306px container** — 65% wider than
available. `Date`, `State` and `Mileage` are visible; **`Event` and `Current` are entirely off-screen to the right.**
`RecordTable` wraps in `overflow-x-auto`, and iOS overlay scrollbars are invisible at rest, so there is no hint that
anything is cut off.

`Event` is the column that carries the title brand. On the Legacy — a branded-title car — a mobile buyer can open the
title history and see nothing that says salvage. That is the worst possible failure mode for this product.

**Recommendation.** Below `sm`, stop tabulating. Render each row as a stacked card: the event as a bold headline, the
date beneath it, and `State · Mileage` as a single muted sub-line, with `extras` behind the existing disclosure.
Keep the table at `sm` and up. This is contained to `RecordTable` and reuses the `RecordCard` visual language
already in the file.

#### P0-3. The Copart salvage entry never appears in the chips or the findings strip.

`src/lib/vinaudit.ts` builds no `jsi` check — junk/salvage records are folded into `branded.count`
(`branded.count = brandedTitles.length + jsiShown`). The consequences on the Legacy report:

- `foundIssueChecks` returns only `Branded title · 2`, so the findings strip shows one pill.
- `searchedAndEmpty` lists only sections with **zero** records, and `jsi` has two — so "Junk & salvage" is
  **absent from both lists**. It appears nowhere in the summary layer.
- The header chips show `Branded title`, `Odometer consistent`, `9 title records`. No salvage chip.

So the single most consequential fact on this report — a total-loss vehicle routed through a Copart auction — exists
only in generated brief prose and behind an unopenable collapsed card (see P0-1). Separately, `Branded title · 2`
is a conflated count: it sums title brands and NMVTIS salvage entries under one label, so the number answers neither
question.

**Recommendation.** Two changes. (a) In `vinaudit.ts`, emit a first-class `jsi` check so salvage is its own finding
with its own count, and stop adding `jsiShown` into `branded.count`. (b) In `report-view.tsx`, derive the finding
pills from `sectionsWithRecords(report)` rather than `report.checks`, so any section that came back with records is
structurally guaranteed to surface — no future feed can add a category that silently skips the summary.

#### P0-4. A branded-title salvage car scores 78/100.

`reportHealth` starts at 100 and subtracts. Salvage is `-22`; nothing else fired on this VIN. **100 − 22 = 78**,
which is exactly the score in the screenshot, labelled `Mixed`, with an amber bar filled to 78%.

Two structural problems follow:

- **78 is the floor**, not the score. A car with a branded title and a Copart total-loss record, clean on every other
  check, can never score below 78. There is no input that produces a low number for the case this score most needs
  to communicate.
- **The post-salvage bonus makes it worse.** `postSalvageFactor` grants `+8` when title/odometer records continue
  for a year with rising mileage — i.e. a rebuilt salvage car that has been driven scores **86 → `Strong` → green**.
  A buyer scanning a green "Strong 86/100" above a branded title is being actively misled by our own UI.

A number and a filled bar are read as a grade regardless of the disclaimer beneath them, and the disclaimer here is
in `text-slate-400` at `text-xs` — the lowest-contrast text on the card.

**Recommendation.** Pick one, before launch:

- **Preferred and smallest:** cap the score whenever `health.salvage.present` is true — `Math.min(score, 54)` — so a
  salvage-channel car always lands in `Caution` and always renders rose. Total-loss history is categorical, not
  additive, and should not be out-pointed by clean sub-checks.
- **Also acceptable:** drop the 0–100 number and the bar entirely and ship the label plus the factor list. The
  factor list ("Salvage & title brand — hurts −22 — 2 junk/salvage records from May 11, 2026 via Copart") is
  genuinely excellent and does the whole job without inviting a grade reading.

Do not ship the current numeric scale. This is the one item in this review with liability attached.

---

### P1 — fix before launch if at all possible

#### P1-5. Two `<h1>`s, and the vehicle title printed twice.

`src/app/report/[token]/page.tsx` renders `<h1>Your vehicle history report</h1>`; `ReportView` then renders
`<h1>{vehicleTitle}</h1>`. Two `<h1>`s per page, and the larger, first one is the generic string. On `/sample` it is
worse: "Sample report — 2012 Toyota Camry SE" and "2012 Toyota Camry SE" appear within 700px of each other.

In the first five seconds the buyer should see the car, then the risk. Right now they see our page furniture.

**Recommendation.** Demote the shell heading to the eyebrow that is already directly above it — merge
`YOUR REPORT` and `Your vehicle history report` into one small caps label — and let the vehicle title in the report
card be the page's only `<h1>`.

#### P1-6. Two timestamps, two formats, two timezones, for the same event. *(spec stutter fixed in this PR)*

The shell prints `Delivered 2026-09-07 02:56 UTC` (machine format, produced by
`order.fulfilledAt.replace("T", " ").slice(0, 16)`); the report card ~600px below prints
`Generated Sep 6, 2026, 8:56 PM MDT`. Same moment, different day on the page, two formats, two zones. It reads like
a bug even though it is not.

**Recommendation.** Route both through `formatGeneratedAt` and show it once, on the report card. Delete the shell
copy. While in there: `Paid $14.99` sits a few pixels from a `Buy another report` button — reminding someone what
they were charged is not what the top of a deliverable is for. `Delivered Sep 6, 2026, 8:56 PM MDT` is enough.

*Fixed in this PR:* the header spec line read `Limited Sedan AWD CVT 2.4L H4 · 2.4L H4 · Gasoline` — the build
record's `Style` already spells out the engine, so joining it to `Engine` stuttered above the fold on a paid report.
`headerSpecSummary` now skips a spec whose value is already contained in one it kept. One function, one test.

#### P1-7. The most important sentence on the report is in the least important position.

`Summary. Branded-title activity was reported for this VIN.` is the correct sentence, calm and jargon-free. It is
also below the H1, the VIN, the spec line, three chips, the generated-at line and a full-width vehicle illustration,
in a separate white band. On mobile it sits roughly 500px into the header card.

**Recommendation.** When any finding is present, promote the summary directly beneath the `<h1>`, above the chips,
as a single bordered line with an amber left rule. It costs no vertical space — it replaces the spec line's position
in the reading order — and it means the first thing after the car's name is the risk.

#### P1-8. The findings strip duplicates the header chips.

`Branded title` appears as an amber header chip and again ~800px later as an amber `Branded title · 2` pill. The
`FindingsStrip` code comment says the detail was removed because it was "the same flag twice" — but the pill itself
is still the same flag twice, in the same colour, on the same page.

**Recommendation.** Drop the flag pills from `FindingsStrip` and keep only the "Searched, nothing on file" line,
which is the part that adds information. The header chips already carry the found flags. Removes a row, removes the
duplication, and makes the "nothing on file" list the clear purpose of that block.

#### P1-9. Four stacked hedges in one card.

Inside "What to know" alone: the health disclaimer, "Nothing on file means no matching record was found", the
"not confirmed on this VIN" heading, and the brief's closing "treat the model-level notes as things to check, not
findings" — then `REPORT_DISCLAIMER` at page bottom. Each is defensible alone. Stacked, they dilute each other and
read as a product apologising for itself, which costs trust rather than buying it.

**Recommendation.** One hedge per card, at the card's foot. Keep the health disclaimer on the health card and the
"nothing on file" clarifier on the findings line; cut the brief's closing paragraph down to one clause and let
`REPORT_DISCLAIMER` carry the rest.

---

### P2 — after launch, or now if cheap

- **P2-10. "Also for this model" outweighs the records.** Measured at 390px: model extras **440px** against
  **450px for every VIN history section combined**. The last thing the buyer sees, at near-equal weight to their
  paid data, is free public data explicitly about a different car. Placement and labelling are right; weight is not.
  Collapse it behind the same closed-card treatment as the history sections.
- **P2-11. The recall string is an unreadable run-on.** `Power Train · Automatic Transmission · Control Module
  (Tcm/Pcm/Tecm); Power Train · Automatic Transmission · Park/Neutral Start Interlock Switch; Air Bags · Sensor ·
  Occupant Classification · Front Passenger` — `·` separates within a title and `;` between titles, in
  `text-slate-500`. Show the count and the `Campaign details` link only, or render the titles as a short list.
- **P2-12. Sticky chrome is 114px on a 844px phone** (64px site header + 50px jump nav) for a page whose entire
  record content is 450px. The jump nav also lets body text bleed through the margins beside its rounded pill
  (visible in `05-paid-mid.png` and reproduced at 390px). Make the nav a solid full-bleed bar, or hide it below
  `sm` — with six short sections there is little to jump to on a phone.
- **P2-13. The jump nav clips mid-word** on mobile ("Accident") with no fade or scroll hint.
- **P2-14. Section card heights are inconsistent** on mobile — 82px vs 102px — because the count chip wraps to its
  own line on longer titles. Give the title `min-w-0 flex-1` so the chip holds its position.
- **P2-15. `role="meter"`** on the health bar has poor screen-reader support; `role="progressbar"` is the safer
  choice. Moot if P0-4 is resolved by removing the bar.
- **P2-16. Heading levels skip.** "What to know" and "Also for this model" are `<h2>`; history sections are `<h3>`
  despite being siblings. Make the sections `<h2>`.
- **P2-17. The health card is invisible against its container** — `border-white/80 bg-white/80` on `bg-brand-50/50`.
  Give it `border-brand-100`.
- **P2-18. `78,930 mi unchanged` wraps mid-value** in the mobile table. Resolved by P0-2's stacked layout.

---

## 4. Nice after launch

- **A "What now" block at the foot of the report.** The brief's "Questions to ask the seller" is the best-converting
  thing on the page and it stops short of an action. Three neutral next steps — get a pre-purchase inspection, ask
  for the rebuild/re-inspection paperwork, verify the title in person — would raise perceived value more than any
  visual change here. Keep it factual; no advice we cannot stand behind.
- **Share with a mechanic.** A read-only link the buyer can text to a shop is worth more than the print button and
  is a natural referral loop.
- **A single-line ownership timeline** across the top of the history sections — state, mileage and event dots on one
  axis. The data is already assembled in `report.odometer`; it would compress five collapsed cards into one glance.
- **Price context on the listing episodes.** The report already knows the asking range across chapters; showing the
  trend from $36k to $28k as a sparkline tells the story the numbers currently make the reader assemble.
- **Verify PDF/print parity after P0-1 and P0-2 land** — both touch elements the print stylesheet force-opens.

---

## 5. Launch recommendation — design only

**Conditional go.**

The information architecture is sound and the writing is a competitive advantage. I would not hold launch for the
visual polish items; nothing here is "ugly", and the density work in this PR is a clear improvement over the previous
pass.

I would hold launch for the four P0s, because each one breaks the specific promise the product is making:

1. **P0-1** — a buyer can pay $14.99 and never find the records.
2. **P0-2** — on a phone, the title brand is off-screen.
3. **P0-3** — the Copart total-loss entry is missing from every summary surface.
4. **P0-4** — a branded salvage car is presented as 78/100, and a rebuilt one as green "Strong".

All four are contained: P0-1 and P0-2 are `report-view.tsx` only, P0-3 is one check in `vinaudit.ts` plus one
derivation swap, and P0-4 is one clamp in `report-health.ts`. None requires a redesign, new data, or a new
dependency. Ship P1-5 through P1-9 in the same pass if they fit; ship P2 after.

Once P0-1 through P0-4 are in, this is a **go** on design.
