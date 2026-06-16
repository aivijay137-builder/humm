# Her Health Hub — PCOS Care Plan
## V1 Spec Pack + Execution Plan (tight)

| | |
|---|---|
| **Scope** | V1 = US-1 → US-7 · 21 chunk-specs |
| **Reads with** | PRD (problem, pains PN-1…PN-10, metrics) + clickable prototype |
| **Build target** | Foundations + evidence library in Claude Code; UI assembled from the prototype |
| **Depth** | Tight — every chunk specified, lean. Any chunk can be deepened on demand. |

> **How to read this:** Part 0 is the spine — data model, state machine, evidence rule, NFRs — written **once**. Parts 1's chunk-specs reference it instead of repeating it. Part 2 sequences the build by spine (not story order). Part 3 is the V1 done-gate, Part 4 the traceability matrix, Part 5 the 30/60/90 + assumptions to validate with the CEO.

---

# PART 0 — FOUNDATIONS (write once, referenced everywhere)

## 0.1 Personas
Priya (member, PCOS, time-poor) · Maya (care coordinator, 80–150 members) · Dr. Rao (panel clinician, reviews/approves) · Neha (HR buyer — context, V2 reporting). Full detail in PRD.

## 0.2 Canonical data model
```
Member ─< ConditionProfile ─< CarePlan(version, status, approver, phase) ─< Recommendation ─ Evidence
                                    └─< Action(task, week, status)
Member ─< CheckIn(week, cycle, symptoms, meds, lifestyle, mood) ─< Outcome(metric, value, ts)
Member ─ Consent(scope[])            Member ─< EscalationEvent(trigger, severity, status)
Coordinator ──reviews── Member        Clinician ──approves── CarePlan
Notification(member|clinician|coordinator, type, ts)
ModuleLibrary(module → default Recommendation + Evidence)   ← the reference repository
```
Key rule: `Member + ConditionProfile + CarePlan + CheckIn` generalise to an eldercare *parent + caregiver* — same model, new cohort.

## 0.3 CarePlan state machine
```
draft → pending_review → approved → published
              │└→ changes_requested → draft (re-draft)
              └→ rejected
published → (re-plan trigger) → draft(delta) → pending_review → … (versioned)
any state → archived
```
Invariant: **a CarePlan can only reach a member via an `approved → published` transition; every transition is audit-logged.**

## 0.4 Evidence contract (the trust spine)
`Evidence { claim, rationale, evidence_level[guideline|good|referral|safety], source, confidence, reviewed_by, last_reviewed }`
Rules: (1) **AI drafts, humans approve.** (2) No `Recommendation` publishes without a linked `Evidence`. (3) The AI assembles/personalises **only from the clinician-authored ModuleLibrary** — it never invents an intervention or a claim. (4) The library is curated + clinician-validated, not model-generated.

## 0.5 Cross-cutting NFRs (apply to every chunk)
- **Privacy/DPDP:** explicit consent scopes, data minimisation, encryption at rest/in transit, audit log on all health-data access.
- **Safety SLAs:** clinician approval < 24h (P90); escalation acknowledged < 4h (working hours); zero tolerance on safety/privacy incidents.
- **Accessibility/UX:** mobile-first, one-handed check-in < 60s, WCAG AA, low-bandwidth resilient, regional-language ready (post-V1).
- **Tone:** empathetic, judgement-free; "reviewed by a clinician"; "not a diagnosis."
- **Sponsor data:** aggregate-only above a k-anonymity threshold (V2); never individual data to an employer.

## 0.6 Spine map (drives build order)
- **Spine A — Care-plan lifecycle:** state machine, review queue, escalation → US-1.C3, US-4.*, US-5.*, US-6.*, US-7.*
- **Spine B — Engagement loop:** this-week, check-in, nudge, outcome → US-2.*, US-3.*
- **Spine C — Evidence & assembly:** ModuleLibrary, rules engine, AI personalisation, Evidence object → US-1.C2 + underpins every recommendation surface
- **Feeder — Intake:** US-1.C1

**Per-chunk fields:** Resolves · Moves · Spine · Trigger · Input mechanics · Screens · Data · Logic & guardrails · Evidence · States/edge · Notifications · Acceptance · Build note · Out-of-scope.

---

# PART 1 — USER-STORY SPECS

## US-1 — Onboarding & plan creation
*As Priya, I want a personalised plan right after I share my situation, so I finally know what to do.* — Pains PN-1/7/9 · Metric: activation%

### US-1.C1 — Structured intake
- **Resolves** PN-1, PN-9 · **Moves** activation% · **Spine** Intake→C
- **Trigger** Member starts onboarding.
- **Input mechanics** Symptom chips → per-selected severity (segmented Mild/Mod/Marked); goals card-select + pick #1 primary; history = diagnosed (segmented), condition chips, meds (structured add); labs = optional upload/manual; one optional free-text box (flagged for human, **not** fed to assembly).
- **Screens** welcome+consent · symptoms · goals · history · labs(opt) · review.
- **Data** writes `ConditionProfile`, `Consent`, `LabResult?`; runs intake red-flag check.
- **Logic & guardrails** Only structured inputs feed assembly; free-text → human. "Not diagnosed" allowed but flagged.
- **Evidence** n/a (no recs yet).
- **States/edge** not-diagnosed flag; marked-severity → red-flag; save & resume.
- **Acceptance** intake→submit < 10 min; structured outputs captured; consent recorded; red-flag fires on marked answers.
- **Build** UI = Stitch-able; red-flag + consent logic = Claude Code.
- **Out** no lab OCR (store/manual only).

### US-1.C2 — AI plan-draft service (the assembly engine)
- **Resolves** PN-1, PN-7, PN-9 · **Moves** activation%, clinician throughput · **Spine** C
- **Trigger** Intake submitted.
- **Logic & guardrails** Rules engine selects/excludes `ModuleLibrary` modules from intake (goal, severity, contraindications) → AI sequences into a 90-day phased plan, sets the "This Week" action, and phrases rationale **from each module's Evidence**. Output = `CarePlan(status=draft)` + `Recommendation[]→Evidence`. Low temperature; library-constrained; any rec lacking Evidence is blocked.
- **Data** writes `CarePlan(draft)`, `Recommendation[]`.
- **Evidence** every Recommendation carries a linked Evidence object.
- **States/edge** empty/edge intake → safe default foundational plan; contraindication exclusion logged.
- **Acceptance** draft generated in < 5s; 100% of recs have Evidence; contraindicated modules excluded.
- **Build** Pure logic/data = Claude Code (no UI). The demo's mock becomes a bounded API call here.
- **Out** no autonomous publish; no free-text clinical generation.

### US-1.C3 — Clinician approval gate + member release
- **Resolves** PN-9, safety · **Moves** activation%, time-to-approval · **Spine** A
- **Trigger** Draft created → enters review queue (see US-6).
- **Screens** Member: "Plan under clinical review" → notify on approval → plan unlocks.
- **Logic & guardrails** State transitions per 0.3; no member sees an unapproved plan.
- **States/edge** changes_requested → re-draft; rejection → member sees status + note; red-flag fast-tracks.
- **Notifications** member (submitted→under review; approved→ready); clinician (new draft).
- **Acceptance** zero unapproved plans reach members; transition audit-logged; member notified on approval.
- **Build** State machine = Claude Code (shared Spine A); member states = Stitch-able.
- **Out** no auto-approval.

## US-2 — Knowing what to do this week
*As Priya, I want one clear action each week, so I follow through.* — Pains PN-2/4 · Metric: wk-8 adherence, retention

### US-2.C1 — "This Week" surface
- **Resolves** PN-2 · **Moves** adherence · **Spine** B
- **Input mechanics** Single primary action card + supporting tasks; tap to mark done.
- **Screens** Plan home → "This Week" focal card + task list + "why it matters".
- **Data** reads `CarePlan/Action`; writes `Action.status`.
- **Acceptance** exactly one primary action surfaced/week; rationale visible.
- **Build** UI = Stitch-able; selection of weekly action = Claude Code.
- **Out** no streaks/gamification (deferred).

### US-2.C2 — Task completion & state tracking
- **Resolves** PN-2, PN-4 · **Moves** adherence · **Spine** B
- **Logic** completion updates `Action.status`; feeds adherence metric + outcome trend.
- **Data** writes `Action.status`; emits `action_completed` event.
- **Acceptance** completion persists; reflected in progress within same session.
- **Build** Claude Code (state) + Stitch (control).

### US-2.C3 — Nudges (due / lapse / milestone)
- **Resolves** PN-2 · **Moves** adherence, retention · **Spine** B
- **Logic & guardrails** Nudge engine fires on check-in due, lapse (missed week), milestone hit; frequency-capped; empathetic copy.
- **Data** writes `Notification`.
- **Acceptance** lapse nudge within 24h of a missed week; cap respected.
- **Build** Claude Code (rules) + push/SMS/WhatsApp later.
- **Out** no AI-generated free-text nudges in V1 (templated).

## US-3 — Weekly check-in & feedback
*As Priya, I want a fast check-in and to see if I'm improving.* — Pains PN-2/4 · Metric: adherence, outcome trend, north star

### US-3.C1 — < 60s structured check-in
- **Resolves** PN-2 · **Moves** adherence · **Spine** B
- **Input mechanics** Quick structured: cycle (date/none), top-symptom severity (segmented), meds (toggle), lifestyle (chips), mood (2-item).
- **Screens** check-in (single scroll) → confirmation.
- **Data** writes `CheckIn`; emits `checkin_completed`.
- **Acceptance** completable one-handed < 60s; all fields structured.
- **Build** Stitch (form) + Claude Code (persist + downstream triggers).

### US-3.C2 — Outcome trend view (lite)
- **Resolves** PN-4 · **Moves** outcome trend, north star · **Spine** B
- **Screens** progress → trend lines (cycle regularity, symptom severity, mood).
- **Data** reads `CheckIn`→`Outcome`.
- **Acceptance** trend renders from ≥2 check-ins; no data → encouraging empty state.
- **Build** Claude Code (aggregation) + Stitch (charts).
- **Out** lab-linked outcomes = V2.

### US-3.C3 — Milestone detection & reinforcement
- **Resolves** PN-4 · **Moves** retention · **Spine** B
- **Logic** rule-based milestone detection (e.g., 4-week streak, trend improvement) → positive message; contributes to north-star threshold.
- **Data** writes `Outcome/milestone`, `Notification`.
- **Acceptance** milestone fires correctly; reinforcement shown once per milestone.
- **Build** Claude Code.

## US-4 — Getting flagged when something's wrong
*As Priya, concerning answers should reach a human; as Dr. Rao, I want red flags surfaced.* — Pain PN-8, safety · Metric: escalation-ack SLA

### US-4.C1 — Red-flag rule set
- **Resolves** PN-8, safety · **Moves** safety guardrail · **Spine** A
- **Logic & guardrails** Deterministic rules over intake + check-in (e.g., marked low mood, sharp symptom change) → `EscalationEvent(severity)`. Conservative thresholds; rules are clinician-defined.
- **Data** writes `EscalationEvent`.
- **Acceptance** defined triggers always fire; no silent suppression.
- **Build** Claude Code (rules, clinician-tunable).

### US-4.C2 — Check-in summariser → structured signal
- **Resolves** PN-8 · **Moves** safety, coordinator efficiency · **Spine** A
- **Logic & guardrails** Summarises a check-in into a structured signal for the queue; AI may summarise but **never** decides clinical action; flags route to humans.
- **Data** reads `CheckIn` → writes queue signal.
- **Acceptance** summary attached to escalation; original data preserved.
- **Build** Claude Code (bounded AI summarisation).

### US-4.C3 — Escalation routing
- **Resolves** PN-8, safety · **Moves** escalation-ack SLA · **Spine** A
- **Logic** routes `EscalationEvent` → coordinator queue + clinician flag + member "we've got you" message.
- **Notifications** coordinator, clinician, member.
- **States/edge** unacknowledged > SLA → re-escalate.
- **Acceptance** escalation visible in queue immediately; member sees supportive message; ack < 4h or re-escalates.
- **Build** Claude Code (Spine A).
- **Out** no autonomous crisis triage; routes to humans only.

## US-5 — Coordinator triage
*As Maya, I want one ranked screen of who needs me now.* — Pains PN-6/8 · Metric: members-per-coordinator

### US-5.C1 — Attention queue (ranked)
- **Resolves** PN-6, PN-8 · **Moves** members-per-coordinator · **Spine** A
- **Input mechanics** Ranked list (escalation > lapse > milestone > plan-due); filter chips.
- **Screens** console → queue.
- **Data** reads `EscalationEvent`, `CheckIn`, `CarePlan`.
- **Acceptance** highest-priority member surfaces top; queue updates on new signals.
- **Build** Claude Code (ranking) + Stitch (list).

### US-5.C2 — Member timeline
- **Resolves** PN-6 · **Moves** efficiency · **Spine** A
- **Screens** member detail → plan + check-ins + flags chronologically.
- **Data** reads all member-linked objects.
- **Acceptance** full history in one view.
- **Build** Stitch (view) + Claude Code (query).

### US-5.C3 — Inline actions
- **Resolves** PN-6 · **Moves** members-per-coordinator · **Spine** A
- **Input mechanics** nudge · message · escalate · mark-handled — inline.
- **Data** writes `Notification`, `EscalationEvent.status`.
- **Acceptance** action resolvable without leaving the queue.
- **Build** Claude Code + Stitch.

## US-6 — Fast, safe plan approval
*As Dr. Rao, I want to review structured drafts quickly so I'm not the bottleneck.* — Pains PN-9/7 · Metric: time-to-approval

### US-6.C1 — Review queue + structured draft
- **Resolves** PN-9 · **Moves** time-to-approval · **Spine** A
- **Screens** review queue → draft with each Recommendation + its Evidence + rationale.
- **Data** reads `CarePlan(draft)`, `Recommendation→Evidence`.
- **Acceptance** every rec shows its evidence; SLA timer visible.
- **Build** Stitch (review UI) + Claude Code (queue).

### US-6.C2 — Approve / edit / reject + versioning
- **Resolves** PN-9, PN-7 · **Moves** time-to-approval · **Spine** A
- **Logic** approve / edit (swap module, adjust target) / reject; reason captured; new `CarePlan.version`.
- **Data** writes `CarePlan.status/version`, approver, reason.
- **Acceptance** actions transition state per 0.3; edits versioned; reason mandatory on edit/reject.
- **Build** Claude Code (Spine A).

### US-6.C3 — SLA timer + approval analytics
- **Resolves** PN-7 · **Moves** time-to-approval · **Spine** A
- **Logic** per-draft SLA countdown; tracks edit-rate + time-to-approve (trust signal).
- **Data** emits approval events.
- **Acceptance** P90 < 24h tracked; SLA-risk drafts flagged.
- **Build** Claude Code.

## US-7 — Re-planning over time
*As Priya, I want my plan to evolve as I progress.* — Pains PN-1/2 · Metric: retention, north star

### US-7.C1 — 30/60/90 re-plan trigger
- **Resolves** PN-2 · **Moves** retention · **Spine** A+B
- **Logic** scheduled trigger at phase boundaries (or on milestone/lapse).
- **Data** reads plan + check-in history.
- **Acceptance** trigger fires at 30/60/90; no duplicate triggers.
- **Build** Claude Code.

### US-7.C2 — AI-drafted plan delta
- **Resolves** PN-1 · **Moves** north star · **Spine** C
- **Logic & guardrails** Generates a plan **delta** from check-in history, library-constrained (same rules as US-1.C2). Output = new draft version.
- **Data** writes `CarePlan(draft, v+1)`.
- **Acceptance** delta references prior outcomes; all new recs carry Evidence.
- **Build** Claude Code.

### US-7.C3 — Clinician approval of delta → member update
- **Resolves** safety · **Moves** retention · **Spine** A
- **Logic** delta enters review queue (US-6) → approved → member sees updated plan + "what changed."
- **Notifications** member (plan updated), clinician (delta to review).
- **Acceptance** no delta reaches member unapproved; change summary shown.
- **Build** Claude Code (Spine A) + Stitch (diff view).

---

# PART 2 — BUILD SEQUENCING & BACKLOG (by spine, not story order)

**Sprint 0 — Foundations:** data model (0.2), state machine (0.3), evidence contract (0.4), event/instrumentation bus, consent + audit-log scaffolding.

| Order | Epic | Tickets (chunks) | Why first |
|---|---|---|---|
| 1 | **Spine C + Intake** | US-1.C1, US-1.C2, ModuleLibrary schema, rules engine, Evidence object | Nothing is groundable until the library + assembly exist |
| 2 | **Spine A core** | US-1.C3, US-6.C1–C3 | The approval state machine + review queue everything else reuses |
| 3 | **Member plan + Spine B** | US-2.C1–C3, US-3.C1–C3 | The retention loop — activation → adherence → outcome |
| 4 | **Safety** | US-4.C1–C3 | Shares Spine A; non-negotiable before real users |
| 5 | **Coordinator console** | US-5.C1–C3 | Shares Spine A queue; unlocks members-per-coordinator |
| 6 | **Re-planning** | US-7.C1–C3 | Shares Spine A + B; closes the 90-day loop |

**Parallel (not a code epic):** evidence-library authoring + clinician validation — runs across the whole timeline.

---

# PART 3 — V1 DEFINITION OF DONE (the gate)

V1 ships only when **all** are true:
- Member can go intake → activated plan in one session; **no plan reaches a member unapproved**.
- Every recommendation surfaces grounded evidence ("Why this?").
- Weekly check-in loop live; outcome trend renders; nudges fire.
- Red-flag → escalation → human, with member safety message; ack SLA enforced.
- Coordinator attention queue operational; runs on existing headcount.
- Instrumentation live: activation, wk-8 adherence, members-per-coordinator, 90-day north star.
- DPDP baseline: consent scopes, encryption, audit log.
- Pilot-ready: one enterprise cohort can be onboarded.

---

# PART 4 — TRACEABILITY MATRIX

| Chunk | Resolves | Moves | Spine | Primary screen |
|---|---|---|---|---|
| US-1.C1 | PN-1, PN-9 | activation | Intake | Intake |
| US-1.C2 | PN-1,7,9 | activation | C | (service) |
| US-1.C3 | PN-9, safety | activation, ttA | A | Plan/under-review |
| US-2.C1–C3 | PN-2, PN-4 | adherence, retention | B | This Week |
| US-3.C1–C3 | PN-2, PN-4 | adherence, north star | B | Check-in / Progress |
| US-4.C1–C3 | PN-8, safety | escalation SLA | A | (signal) / member msg |
| US-5.C1–C3 | PN-6, PN-8 | members/coordinator | A | Coordinator console |
| US-6.C1–C3 | PN-9, PN-7 | time-to-approval | A | Review queue |
| US-7.C1–C3 | PN-1, PN-2 | retention, north star | A+B | Plan update |

---

# PART 5 — EXECUTION PLAN

## 5.1 — 30 / 60 / 90
- **0–30 days:** Sprint 0 foundations + Spine C (library, rules, evidence) + evidence-library v1 (clinician-validated) + the vertical slice (US-1 end-to-end) on real data.
- **30–60 days:** Spine A (approval + escalation) + Spine B (this-week, check-in, trend, nudge) + instrumentation + DPDP baseline. Close the engagement loop.
- **60–90 days:** Coordinator console + re-planning; run a **closed pilot** (one enterprise cohort, coordinator-in-loop); report north star + members-per-coordinator.

## 5.2 — Pilot go/no-go gate
Scale only if, at 8–12 weeks: **wk-8 adherence ≥ 50% · improving trend ≥ 40% · members-per-coordinator +30% · zero safety/privacy incidents.**

## 5.3 — Assumptions to validate with the CEO (rewrite the plan with their numbers)
1. Revenue is concentrated in enterprise (vs B2C).
2. Chronic journeys retain better than one-off consults — and today's baseline is X.
3. Enough PCOS-relevant volume exists via enterprise to run the pilot.
4. "AI" is wanted as cost-to-serve/differentiation, not just a fundraising line.
5. Compliance (DPDP/clinical safety) is aspirational, not built.
6. Product is part-agency; eng team is small.
7. Panel clinicians have capacity to hold the approval SLA.

Each assumption maps to a CEO question; their answers re-rank Part 2. *That re-ranking, done live, is the CPTO signal.*

## 5.4 — What this proves
The spec proves you scope tightly to outcomes; the spine map proves you build reusable primitives (PCOS → maternity → eldercare); the evidence contract proves you make AI real but bounded; the 30/60/90 + gate prove you run to measurable proof, not feature lists.
