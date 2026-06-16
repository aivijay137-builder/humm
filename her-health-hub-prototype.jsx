import { useState, useEffect, useRef } from "react";
import {
  Check, ChevronDown, ShieldCheck, Activity, Moon, Brain, Stethoscope,
  Sparkles, ClipboardList, AlertTriangle, ArrowRight, RotateCcw, User,
  FlaskConical, CalendarCheck, BookOpen, Footprints, HeartPulse, Salad
} from "lucide-react";

/* =====================================================================
   REFERENCE REPOSITORY — "Plan Module Library"
   This is what powers the "AI-drafted plan" step in the demo.
   Each module carries its own evidence object. The AI/assembly layer
   only SEQUENCES and PERSONALISES from this curated library — it never
   invents an intervention or a scientific claim. A module with no
   evidence cannot be published.
   Content modelled on the 2023 International Evidence-Based PCOS
   Guideline (Monash / ASRM / ESHRE). Illustrative — requires clinical
   validation + localisation before production. Not medical advice.
   ===================================================================== */

const SRC = "2023 Intl. Evidence-Based PCOS Guideline";
const REVIEWER = "Dr. Anjali Rao, MD";

const L = {
  guideline: { label: "Guideline-backed", cls: "b-guideline" },
  good: { label: "Good-practice", cls: "b-good" },
  referral: { label: "Clinician-led", cls: "b-referral" },
  safety: { label: "Safety", cls: "b-safety" },
};

const MODULES = [
  {
    id: "understand", phase: 1, icon: BookOpen, always: true, kind: "self",
    title: "Understand your PCOS",
    action: "Read a 3-minute primer on what PCOS is — and why lifestyle helps, even without weight change.",
    cadence: "Once this week",
    ev: {
      level: L.guideline,
      rationale: "The guideline strongly recommends high-quality patient education and shared decision-making. Understanding the condition is the foundation everything else builds on.",
    },
  },
  {
    id: "track", phase: 1, icon: ClipboardList, always: true, thisWeek: true, kind: "self",
    title: "Track your cycle & top symptom",
    action: "Log your period days and your most bothersome symptom — 30 seconds a day for a week.",
    cadence: "Daily · 30 sec",
    ev: {
      level: L.good,
      rationale: "Tracking turns vague symptoms into a pattern your clinician can act on, and it's the input your plan adapts to each week.",
    },
  },
  {
    id: "move", phase: 1, icon: Footprints, always: true, kind: "self",
    title: "Build gentle movement",
    action: "Start with a 20–30 min brisk walk most days, building toward 150–300 min a week.",
    cadence: "5×/week",
    ev: {
      level: L.guideline,
      rationale: "Guideline activity targets (150–300 min/week moderate, or 75–150 vigorous) improve metabolic health and wellbeing — with benefits even without weight loss.",
    },
  },
  {
    id: "sedentary", phase: 1, icon: Activity, always: true, kind: "self",
    title: "Break up sitting",
    action: "Stand or move for a couple of minutes each hour you're sitting.",
    cadence: "Daily",
    ev: {
      level: L.guideline,
      rationale: "Replacing sedentary time with activity of any intensity — even light — provides health benefits per the guideline.",
    },
  },
  {
    id: "sleep", phase: 1, icon: Moon, always: true, kind: "self",
    title: "Steady your sleep",
    action: "Aim for consistent sleep and wake times. Note loud snoring or daytime tiredness to raise at your next consult.",
    cadence: "Daily",
    ev: {
      level: L.guideline,
      rationale: "The guideline recognises sleep problems (including sleep apnoea) as more common in PCOS, so steady sleep and screening for issues are part of core care.",
    },
  },
  {
    id: "wellbeing", phase: 1, icon: Sparkles, always: true, kind: "self",
    title: "Protect your emotional wellbeing",
    action: "Try one short stress-reset a day — a 5-minute breathing or wind-down practice.",
    cadence: "Daily",
    ev: {
      level: L.guideline,
      rationale: "Anxiety and low mood are very common in PCOS. The guideline makes emotional wellbeing and quality of life core to care, not an afterthought.",
    },
  },
  {
    id: "mood", phase: 1, icon: Brain, always: true, kind: "self",
    title: "Quick mood check-ins",
    action: "Answer two short mood questions in your weekly check-in, so we can flag early if you'd benefit from more support.",
    cadence: "Weekly",
    ev: {
      level: L.guideline,
      rationale: "The guideline recommends routinely screening for anxiety and depression in PCOS. These two questions are how your plan knows when to bring in a human.",
    },
  },
  {
    id: "eating", phase: 2, icon: Salad, always: true, kind: "self",
    title: "A sustainable eating pattern",
    action: "Aim for regular, balanced meals you can actually keep up. There's no single \u201CPCOS diet\u201D you have to follow.",
    cadence: "Ongoing",
    ev: {
      level: L.guideline,
      rationale: "The guideline finds no one diet superior. A pattern you can sustain matters more than any specific regimen — and we frame this around health, never restriction.",
    },
  },
  {
    id: "strength", phase: 2, icon: HeartPulse, always: true, kind: "self",
    title: "Add light strength work",
    action: "Two short muscle-strengthening sessions a week — bodyweight counts.",
    cadence: "2×/week",
    ev: {
      level: L.guideline,
      rationale: "Strength activity supports the metabolic benefits of an active lifestyle and is consistent with population physical-activity guidance the PCOS guideline aligns to.",
    },
  },
  {
    id: "skin", phase: 2, icon: Sparkles, kind: "referral",
    title: "Skin & hair — what actually helps",
    action: "Lifestyle helps slowly. For faster options, discuss medical treatments with your clinician — we won't prescribe in the app.",
    cadence: "Raise at next consult",
    when: (f) => f.skin,
    ev: {
      level: L.referral,
      rationale: "The guideline keeps pharmacological options for skin/hair features clinician-led. The app's job is to route you, not to medicate.",
    },
  },
  {
    id: "metabolic", phase: 2, icon: FlaskConical, kind: "referral",
    title: "Check your metabolic health",
    action: "Ask your clinician about screening your blood sugar and cholesterol.",
    cadence: "Raise at next consult",
    when: (f) => f.metabolic,
    ev: {
      level: L.referral,
      rationale: "Insulin resistance and metabolic risk are recognised features of PCOS. Screening decisions sit with your clinician — we make sure they're on the radar.",
    },
  },
  {
    id: "fertility", phase: 1, icon: Stethoscope, kind: "referral",
    title: "Planning for pregnancy",
    action: "Bring your goal and timeline to a clinician — they'll guide safe, evidence-based options. Keep tracking your cycles meanwhile.",
    cadence: "Book a consult",
    when: (f) => f.fertility,
    ev: {
      level: L.referral,
      rationale: "The guideline emphasises safer, cheaper, clinician-led fertility management. The plan prepares you for that conversation rather than replacing it.",
    },
  },
  {
    id: "safety", phase: 1, icon: ShieldCheck, always: true, kind: "safety",
    title: "When to reach out sooner",
    action: "Message your care companion if your symptoms change sharply or you feel unwell — don't wait for your next check-in.",
    cadence: "As needed",
    ev: {
      level: L.safety,
      rationale: "A clear escalation path is basic clinical safety. Your plan should always tell you when not to wait.",
    },
  },
];

/* ---- Rules engine: intake -> selected, ordered modules + flags ---- */
function assemblePlan(intake) {
  const flags = {
    skin: !!intake.symptoms.skinhair,
    metabolic:
      !!intake.symptoms.weight ||
      intake.primaryGoal === "metabolic" ||
      intake.conditions.includes("Insulin resistance") ||
      intake.conditions.includes("Type-2 diabetes"),
    fertility: intake.primaryGoal === "fertility",
  };
  const moodLow = intake.symptoms.mood?.sev === "Marked";

  const chosen = MODULES.filter((m) => m.always || (m.when && m.when(flags)));
  const goalBoost = (m) =>
    (intake.primaryGoal === "fertility" && m.id === "fertility") ||
    (intake.primaryGoal === "cycle" && m.id === "track") ||
    (intake.primaryGoal === "metabolic" && (m.id === "move" || m.id === "metabolic")) ||
    (intake.primaryGoal === "skin" && m.id === "skin") ||
    (intake.primaryGoal === "mood" && (m.id === "wellbeing" || m.id === "mood"))
      ? 0
      : 1;
  const ordered = [...chosen].sort(
    (a, b) => a.phase - b.phase || goalBoost(a) - goalBoost(b)
  );
  return { modules: ordered, escalation: moodLow, primaryGoal: intake.primaryGoal };
}

/* ----------------------------- content ----------------------------- */
const SYMPTOMS = [
  { key: "cycle", label: "Irregular or missed periods", icon: CalendarCheck },
  { key: "skinhair", label: "Acne, skin changes or unwanted hair", icon: Sparkles },
  { key: "weight", label: "Weight or energy changes", icon: Activity },
  { key: "mood", label: "Low mood, anxiety or stress", icon: Brain },
];
const GOALS = [
  { key: "cycle", label: "More regular cycles" },
  { key: "fertility", label: "Trying to conceive" },
  { key: "metabolic", label: "Weight & metabolic health" },
  { key: "skin", label: "Skin & hair" },
  { key: "mood", label: "Mood & energy" },
];
const CONDITIONS = ["Thyroid condition", "Insulin resistance", "Type-2 diabetes", "None of these"];
const SEV = ["Mild", "Moderate", "Marked"];
const PHASE_LABEL = { 1: "Days 1–30 · Foundations", 2: "Days 31–60 · Build", 3: "Days 61–90 · Consolidate" };

/* ============================== APP ============================== */
export default function App() {
  const [role, setRole] = useState("member");
  const [step, setStep] = useState("welcome");
  const [iStep, setIStep] = useState(0);
  const [intake, setIntake] = useState({ symptoms: {}, primaryGoal: null, diagnosed: null, conditions: [], note: "" });
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("none");
  const [removed, setRemoved] = useState({});
  const [ack, setAck] = useState(false);
  const [open, setOpen] = useState({});
  const draftSeq = ["Matching your goals\u2026", "Selecting evidence-backed modules\u2026", "Personalising your 90 days\u2026"];
  const [draftLine, setDraftLine] = useState(0);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function startDraft() {
    const p = assemblePlan(intake);
    setPlan(p);
    setStep("drafting");
    setDraftLine(0);
    timers.current.push(setTimeout(() => setDraftLine(1), 850));
    timers.current.push(setTimeout(() => setDraftLine(2), 1700));
    timers.current.push(setTimeout(() => { setStatus("pending"); setStep("plan"); }, 2600));
  }
  function approve() { setStatus("approved"); }
  function reset() {
    setRole("member"); setStep("welcome"); setIStep(0);
    setIntake({ symptoms: {}, primaryGoal: null, diagnosed: null, conditions: [], note: "" });
    setPlan(null); setStatus("none"); setRemoved({}); setAck(false); setOpen({});
  }

  return (
    <div className="hh-app">
      <style>{STYLE}</style>

      <header className="hh-header">
        <div className="hh-brand">
          <span className="hh-logo">Humm</span>
          <span className="hh-sub">Her Health Hub · PCOS care</span>
        </div>
        <div className={"hh-roletoggle role-" + role} role="tablist" aria-label="Demo role">
          <span className="hh-roleslider" aria-hidden="true" />
          <button className={"hh-rolebtn" + (role === "member" ? " on" : "")} onClick={() => setRole("member")}>
            <User size={15} /> Member
          </button>
          <button className={"hh-rolebtn" + (role === "clinician" ? " on" : "")} onClick={() => setRole("clinician")}>
            <Stethoscope size={15} /> Clinician
          </button>
        </div>
        <button className="hh-reset" onClick={reset}><RotateCcw size={13} /> Restart</button>
      </header>

      <div className="hh-ribbon">
        Prototype · plan content modelled on the {SRC}; illustrative, needs clinical sign-off. Not medical advice.
      </div>

      <HintBar role={role} step={step} status={status} escalation={plan?.escalation} />

      <main className="hh-stage">
        {role === "member"
          ? <MemberView {...{ step, setStep, iStep, setIStep, intake, setIntake, startDraft, draftLine, draftSeq, plan, status, removed, open, setOpen }} />
          : <ClinicianView {...{ plan, status, approve, removed, setRemoved, ack, setAck }} />}
      </main>
    </div>
  );
}

/* --------------------------- hint bar --------------------------- */
function HintBar({ role, step, status, escalation }) {
  let msg = null;
  if (role === "member" && step === "welcome") msg = "You're the member. Start the intake to see a plan get built.";
  else if (role === "member" && step === "plan" && status === "pending")
    msg = "Plan is drafted and waiting for a clinician. Switch to the Clinician tab to review and release it.";
  else if (role === "member" && step === "plan" && status === "approved")
    msg = "Approved \u2713 Open any recommendation's \u201CWhy this?\u201D to see the evidence behind it.";
  else if (role === "clinician" && status === "none") msg = "Nothing in the queue yet — run the member intake first.";
  else if (role === "clinician" && status === "pending")
    msg = escalation
      ? "A draft is waiting. Note the wellbeing flag at the top before you release it."
      : "A draft is waiting. Review each recommendation, then release it to the member.";
  else if (role === "clinician" && status === "approved") msg = "Released \u2713 Switch back to Member to see the live plan.";
  if (!msg) return null;
  return <div className="hh-hint"><ArrowRight size={13} /> {msg}</div>;
}

/* ========================== MEMBER ========================== */
function MemberView({ step, setStep, iStep, setIStep, intake, setIntake, startDraft, draftLine, draftSeq, plan, status, removed, open, setOpen }) {
  return (
    <div className="hh-phone">
      <div className="hh-phone-notch" />
      <div className="hh-phone-inner">
        {step === "welcome" && <Welcome onStart={() => setStep("intake")} />}
        {step === "intake" && <Intake {...{ iStep, setIStep, intake, setIntake, startDraft }} />}
        {step === "drafting" && <Drafting line={draftLine} seq={draftSeq} />}
        {step === "plan" && status === "pending" && <Pending escalation={plan?.escalation} />}
        {step === "plan" && status === "approved" && <PlanView {...{ plan, removed, open, setOpen }} />}
      </div>
    </div>
  );
}

function Welcome({ onStart }) {
  return (
    <div className="hh-screen hh-welcome">
      <div className="hh-eyebrow">For you, {`{`}Priya{`}`}</div>
      <h1 className="hh-h1">Let's turn your diagnosis into a plan you can actually follow.</h1>
      <p className="hh-lead">A few quick questions. We'll draft a personalised 90-day plan, a clinician checks it, and you'll see the evidence behind every step.</p>
      <ul className="hh-assure">
        <li><ShieldCheck size={15} /> Reviewed by a clinician before you see it</li>
        <li><BookOpen size={15} /> Every recommendation shows its “why”</li>
        <li><Check size={15} /> Takes under 3 minutes</li>
      </ul>
      <button className="hh-btn hh-btn-primary hh-block" onClick={onStart}>Start <ArrowRight size={16} className="hh-arrow" /></button>
    </div>
  );
}

function Intake({ iStep, setIStep, intake, setIntake, startDraft }) {
  const total = 3;
  const set = (patch) => setIntake((s) => ({ ...s, ...patch }));
  const toggleSym = (k) =>
    setIntake((s) => {
      const sym = { ...s.symptoms };
      if (sym[k]) delete sym[k]; else sym[k] = { sev: "Mild" };
      return { ...s, symptoms: sym };
    });
  const setSev = (k, sev) => setIntake((s) => ({ ...s, symptoms: { ...s.symptoms, [k]: { sev } } }));
  const toggleCond = (c) =>
    setIntake((s) => {
      let arr = s.conditions.includes(c) ? s.conditions.filter((x) => x !== c) : [...s.conditions, c];
      if (c === "None of these") arr = s.conditions.includes(c) ? [] : ["None of these"];
      else arr = arr.filter((x) => x !== "None of these");
      return { ...s, conditions: arr };
    });

  const canNext =
    (iStep === 0 && Object.keys(intake.symptoms).length > 0) ||
    (iStep === 1 && intake.primaryGoal) ||
    iStep === 2;

  return (
    <div className="hh-screen">
      <Dots n={total} i={iStep} />
      {iStep === 0 && (
        <>
          <h2 className="hh-h2">What's been bothering you?</h2>
          <p className="hh-muted">Pick what applies. Set how much it affects you.</p>
          <div className="hh-symwrap">
            {SYMPTOMS.map((s) => {
              const on = !!intake.symptoms[s.key];
              const Icon = s.icon;
              return (
                <div key={s.key} className={"hh-sym" + (on ? " on" : "")}>
                  <button className="hh-sym-head" onClick={() => toggleSym(s.key)}>
                    <span className="hh-sym-ic"><Icon size={16} /></span>
                    <span className="hh-sym-label">{s.label}</span>
                    <span className={"hh-check" + (on ? " on" : "")}>{on && <Check size={13} />}</span>
                  </button>
                  {on && (
                    <div className="hh-seg">
                      {SEV.map((v) => (
                        <button key={v}
                          className={"hh-segbtn" + (intake.symptoms[s.key].sev === v ? " on" : "")}
                          onClick={() => setSev(s.key, v)}>{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {iStep === 1 && (
        <>
          <h2 className="hh-h2">What matters most right now?</h2>
          <p className="hh-muted">Your top goal shapes what we lead with.</p>
          <div className="hh-goals">
            {GOALS.map((g) => (
              <button key={g.key}
                className={"hh-goalcard" + (intake.primaryGoal === g.key ? " on" : "")}
                onClick={() => set({ primaryGoal: g.key })}>
                <span className="hh-goaldot" />{g.label}
                {intake.primaryGoal === g.key && <Check size={15} className="hh-goalcheck" />}
              </button>
            ))}
          </div>
        </>
      )}

      {iStep === 2 && (
        <>
          <h2 className="hh-h2">A little context</h2>
          <p className="hh-muted">Optional, but it helps your clinician.</p>
          <div className="hh-field">
            <label className="hh-flabel">Already diagnosed with PCOS?</label>
            <div className="hh-seg hh-seg-inline">
              {["Yes", "Not sure", "No"].map((v) => (
                <button key={v} className={"hh-segbtn" + (intake.diagnosed === v ? " on" : "")}
                  onClick={() => set({ diagnosed: v })}>{v}</button>
              ))}
            </div>
          </div>
          <div className="hh-field">
            <label className="hh-flabel">Any of these?</label>
            <div className="hh-chipwrap">
              {CONDITIONS.map((c) => (
                <button key={c} className={"hh-chip" + (intake.conditions.includes(c) ? " on" : "")}
                  onClick={() => toggleCond(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div className="hh-field">
            <label className="hh-flabel">Anything else you'd want a clinician to know?</label>
            <textarea className="hh-textarea" rows={2} placeholder="Free text — read by a human, not used to auto-generate your plan."
              value={intake.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
        </>
      )}

      <div className="hh-intake-nav">
        {iStep > 0
          ? <button className="hh-btn hh-btn-ghost" onClick={() => setIStep(iStep - 1)}>Back</button>
          : <span />}
        {iStep < total - 1
          ? <button className="hh-btn hh-btn-primary" disabled={!canNext} onClick={() => setIStep(iStep + 1)}>Next <ArrowRight size={15} className="hh-arrow" /></button>
          : <button className="hh-btn hh-btn-primary" onClick={startDraft}>Generate my plan <Sparkles size={15} className="hh-spark" /></button>}
      </div>
    </div>
  );
}

function Drafting({ line, seq }) {
  return (
    <div className="hh-screen hh-draft">
      <div className="hh-orbit"><Sparkles size={22} /></div>
      <h2 className="hh-h2 hh-center">Building your plan</h2>
      <div className="hh-draftlines">
        {seq.map((s, i) => (
          <div key={i} className={"hh-draftline" + (i <= line ? " on" : "") + (i === line ? " active" : "")}>
            <span className="hh-draftcheck">{i < line ? <Check size={13} /> : i === line ? <span className="hh-mini-spin" /> : null}</span>
            {s}
          </div>
        ))}
      </div>
      <p className="hh-muted hh-center hh-tiny">Assembling from a curated, evidence-backed library — not free-text generation.</p>
    </div>
  );
}

function Pending({ escalation }) {
  return (
    <div className="hh-screen hh-pending">
      <div className="hh-pendmark"><Stethoscope size={20} /></div>
      <h2 className="hh-h2 hh-center">Your plan is with a clinician</h2>
      <p className="hh-muted hh-center">We've drafted your 90 days. A clinician is reviewing it now — usually within a day. You'll get a nudge the moment it's ready.</p>
      {escalation && (
        <div className="hh-care-note">
          <Brain size={16} />
          <div>Because you mentioned you've been feeling low, a care companion will check in with you. You don't have to wait for the plan.</div>
        </div>
      )}
      <div className="hh-pendmeta"><span className="hh-sla">Typical review · under 24h</span></div>
    </div>
  );
}

function PlanView({ plan, removed, open, setOpen }) {
  const mods = plan.modules.filter((m) => !removed[m.id]);
  const thisWeek = mods.find((m) => m.thisWeek) || mods[0];
  let order = 0;
  const phaseBlocks = [1, 2, 3].map((p) => {
    const rows = mods.filter((m) => m.phase === p && m.id !== thisWeek?.id);
    if (!rows.length) return null;
    return (
      <div key={p} className="hh-phase">
        <div className="hh-phase-label">{PHASE_LABEL[p]}</div>
        {rows.map((m) => <Rec key={m.id} m={m} idx={order++} open={open} setOpen={setOpen} />)}
      </div>
    );
  });
  return (
    <div className="hh-screen hh-plan">
      <div className="hh-planhead">
        <div>
          <div className="hh-eyebrow">Your PCOS care plan · 90 days</div>
          <h2 className="hh-h2">Here's your path, {`{`}Priya{`}`}</h2>
        </div>
        <span className="hh-reviewed"><ShieldCheck size={13} /> Clinician-reviewed</span>
      </div>

      {thisWeek && (
        <div className="hh-thisweek">
          <div className="hh-tw-label">This week</div>
          <div className="hh-tw-title">{thisWeek.title}</div>
          <div className="hh-tw-action">{thisWeek.action}</div>
          <Why m={thisWeek} open={open} setOpen={setOpen} light />
        </div>
      )}

      {phaseBlocks}

      <button className="hh-btn hh-btn-ghost hh-block hh-checkin">Start this week's check-in</button>
    </div>
  );
}

function Rec({ m, idx, open, setOpen }) {
  const Icon = m.icon || Check;
  return (
    <div className={"hh-rec" + (m.kind === "referral" ? " referral" : "") + (m.kind === "safety" ? " safety" : "")}
      style={{ animationDelay: (idx * 55) + "ms" }}>
      <div className="hh-rec-head">
        <span className="hh-rec-ic"><Icon size={15} /></span>
        <span className="hh-rec-title">{m.title}</span>
        <span className="hh-cadence">{m.cadence}</span>
      </div>
      <div className="hh-rec-action">{m.action}</div>
      <Why m={m} open={open} setOpen={setOpen} />
    </div>
  );
}

function Why({ m, open, setOpen, light }) {
  const isOpen = !!open[m.id];
  return (
    <div className={"hh-why" + (light ? " light" : "")}>
      <button className="hh-whybtn" onClick={() => setOpen((s) => ({ ...s, [m.id]: !s[m.id] }))} aria-expanded={isOpen}>
        Why this? <ChevronDown size={14} className={"hh-chev" + (isOpen ? " open" : "")} />
      </button>
      {isOpen && (
        <div className="hh-evidence">
          <div className="hh-evrow">
            <span className={"hh-badge " + m.ev.level.cls}>{m.ev.level.label}</span>
            <span className="hh-source">{SRC}</span>
          </div>
          <p className="hh-evtext">{m.ev.rationale}</p>
          <div className="hh-reviewedby"><ShieldCheck size={12} /> Reviewed by {REVIEWER}</div>
        </div>
      )}
    </div>
  );
}

/* ======================== CLINICIAN ======================== */
function ClinicianView({ plan, status, approve, removed, setRemoved, ack, setAck }) {
  if (!plan || status === "none") {
    return (
      <div className="hh-console hh-empty">
        <ClipboardList size={26} />
        <h2 className="hh-h2">No drafts in the queue</h2>
        <p className="hh-muted">Run the member intake first, then come back to review and release the plan.</p>
      </div>
    );
  }
  const active = plan.modules.filter((m) => !removed[m.id]);
  return (
    <div className="hh-console">
      <div className="hh-console-head">
        <div>
          <div className="hh-eyebrow">Review queue</div>
          <h2 className="hh-h2">Priya S. · PCOS draft plan</h2>
          <div className="hh-console-meta">
            Primary goal: <b>{GOALS.find((g) => g.key === plan.primaryGoal)?.label || "—"}</b> ·
            {" "}{active.length} recommendations · SLA <b>under 24h</b>
          </div>
        </div>
        <span className={"hh-status-pill " + (status === "approved" ? "ok" : "wait")}>
          {status === "approved" ? <><Check size={13} /> Released</> : <><span className="hh-pulsedot" /> Awaiting review</>}
        </span>
      </div>

      {plan.escalation && (
        <div className={"hh-flag" + (ack ? " ack" : "")}>
          <AlertTriangle size={16} />
          <div className="hh-flag-body">
            <b>Wellbeing flag — Priya reported marked low mood.</b>
            <div>Guideline advises screening and support. Recommend a care-companion check-in before release.</div>
          </div>
          {!ack
            ? <button className="hh-btn hh-btn-flag" onClick={() => setAck(true)}>Acknowledge & route to care companion</button>
            : <span className="hh-flag-done"><Check size={13} /> Routed</span>}
        </div>
      )}

      <div className="hh-review-list">
        {plan.modules.map((m) => {
          const off = !!removed[m.id];
          const Icon = m.icon || Check;
          return (
            <div key={m.id} className={"hh-rrec" + (off ? " off" : "")}>
              <span className="hh-rrec-ic"><Icon size={15} /></span>
              <div className="hh-rrec-main">
                <div className="hh-rrec-top">
                  <span className="hh-rrec-title">{m.title}</span>
                  <span className={"hh-badge " + m.ev.level.cls}>{m.ev.level.label}</span>
                </div>
                <div className="hh-rrec-action">{m.action}</div>
                <div className="hh-rrec-ev"><span className="hh-source">{SRC}</span> · {m.ev.rationale}</div>
              </div>
              {status !== "approved" && (
                <button className="hh-rrec-toggle" onClick={() => setRemoved((s) => ({ ...s, [m.id]: !s[m.id] }))}>
                  {off ? "Restore" : "Remove"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="hh-console-foot">
        {status === "approved"
          ? <div className="hh-released"><Check size={15} /> Plan released to Priya. Switch to the Member tab to see it live.</div>
          : <>
              <button className="hh-btn hh-btn-ghost">Request changes</button>
              <button className="hh-btn hh-btn-primary" onClick={approve}>Approve & release plan <ArrowRight size={15} className="hh-arrow" /></button>
            </>}
      </div>
    </div>
  );
}

function Dots({ n, i }) {
  return <div className="hh-dots">{Array.from({ length: n }).map((_, k) => <span key={k} className={"hh-dot" + (k === i ? " on" : k < i ? " done" : "")} />)}</div>;
}

/* ============================== STYLE ============================== */
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..48,500;12..48,600;12..48,700&family=Inter:wght@400;500;600;700&display=swap');

.hh-app{
  --bg:#E9EEE8; --surface:#ffffff; --surface2:#F5F8F3;
  --ink:#15302C; --ink2:#46605A; --ink3:#76897F;
  --teal:#1F6E63; --teal-d:#134E46; --teal-soft:#E1EDE8;
  --clay:#BC663A; --clay-soft:#F6E6DB;
  --amber:#9A6B12; --amber-soft:#F4E9CF;
  --rose:#A8442C; --rose-soft:#F4E0D9;
  --line:#DCE4DB; --cool:#EDF1F4; --cool-line:#D6DEE4;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink);
  background:var(--bg); min-height:100%; padding-bottom:40px;
  -webkit-font-smoothing:antialiased;
}
.hh-app *{box-sizing:border-box}
.hh-app button:focus-visible,.hh-app textarea:focus-visible{outline:2px solid var(--teal);outline-offset:2px}

/* header */
.hh-header{display:flex;align-items:center;gap:16px;padding:16px 22px;background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5;flex-wrap:wrap}
.hh-brand{display:flex;flex-direction:column;line-height:1.1;margin-right:auto}
.hh-logo{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:20px;color:var(--teal-d);letter-spacing:-.02em}
.hh-sub{font-size:11.5px;color:var(--ink3);font-weight:500;margin-top:1px}

/* role toggle with sliding pill — the signature tab delighter */
.hh-roletoggle{position:relative;display:flex;width:280px;background:var(--surface2);border:1px solid var(--line);border-radius:999px;padding:3px}
.hh-roleslider{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);background:var(--teal);border-radius:999px;box-shadow:0 2px 7px rgba(19,78,70,.32);transition:transform .34s cubic-bezier(.34,1.45,.5,1)}
.role-clinician .hh-roleslider{transform:translateX(100%)}
.hh-rolebtn{position:relative;z-index:1;flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:none;background:transparent;color:var(--ink2);font:inherit;font-size:13px;font-weight:600;padding:9px 10px;border-radius:999px;cursor:pointer;transition:color .28s}
.hh-rolebtn.on{color:#fff}
.hh-rolebtn.on svg{animation:hh-settle .42s ease}
.hh-rolebtn:not(.on):hover{color:var(--teal-d)}
.hh-rolebtn:not(.on):hover svg{transform:translateY(-1px);transition:transform .15s}

.hh-reset{display:flex;align-items:center;gap:5px;border:1px solid var(--line);background:var(--surface);color:var(--ink2);font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:9px;cursor:pointer;transition:border-color .15s,color .15s}
.hh-reset:hover{border-color:var(--ink3);color:var(--ink)}
.hh-reset:hover svg{animation:hh-spin .6s ease}

.hh-ribbon{background:var(--amber-soft);color:#6f4e0c;font-size:11.5px;text-align:center;padding:7px 18px;border-bottom:1px solid #e7d8b3}
.hh-hint{max-width:920px;margin:16px auto 0;display:flex;align-items:center;gap:8px;background:var(--teal-soft);color:var(--teal-d);font-size:13px;font-weight:500;padding:10px 14px;border-radius:11px;border:1px solid #cbe0d8}
.hh-hint svg{flex-shrink:0}

.hh-stage{max-width:920px;margin:0 auto;padding:22px 18px 0;display:flex;justify-content:center}

/* phone mockup (desktop/tablet) */
.hh-phone{width:100%;max-width:412px;background:#0e2723;border-radius:34px;padding:10px;box-shadow:0 24px 60px -24px rgba(15,48,44,.55),0 4px 14px rgba(15,48,44,.2)}
.hh-phone-notch{width:104px;height:6px;background:#1d3a35;border-radius:99px;margin:3px auto 8px}
.hh-phone-inner{background:var(--surface);border-radius:26px;overflow:hidden;min-height:560px}
.hh-screen{padding:24px 22px 26px;animation:hh-fade .35s ease}

.hh-eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--teal)}
.hh-h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:25px;line-height:1.16;letter-spacing:-.02em;margin:12px 0 10px}
.hh-h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:20px;line-height:1.2;letter-spacing:-.015em;margin:6px 0 4px}
.hh-lead{font-size:14.5px;line-height:1.5;color:var(--ink2);margin:0 0 18px}
.hh-muted{font-size:13px;color:var(--ink3);margin:0 0 14px;line-height:1.45}
.hh-center{text-align:center}
.hh-tiny{font-size:11.5px;margin-top:14px}

.hh-assure{list-style:none;padding:0;margin:0 0 22px;display:flex;flex-direction:column;gap:11px}
.hh-assure li{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:500;color:var(--ink);animation:hh-rise .5s ease backwards}
.hh-assure li:nth-child(1){animation-delay:.05s}
.hh-assure li:nth-child(2){animation-delay:.13s}
.hh-assure li:nth-child(3){animation-delay:.21s}
.hh-assure svg{color:var(--teal)}

/* buttons */
.hh-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;border-radius:12px;font:inherit;font-weight:600;font-size:14.5px;padding:13px 18px;cursor:pointer;transition:transform .12s,background .15s,box-shadow .18s}
.hh-btn:active{transform:translateY(1px)}
.hh-btn-primary{background:var(--teal);color:#fff}
.hh-btn-primary:hover{background:var(--teal-d);transform:translateY(-1px);box-shadow:0 8px 20px -8px rgba(19,78,70,.55)}
.hh-btn-primary:disabled{background:#b7ccc5;cursor:not-allowed;transform:none;box-shadow:none}
.hh-btn-ghost{background:var(--surface);color:var(--ink);border:1px solid var(--line)}
.hh-btn-ghost:hover{border-color:var(--ink3);transform:translateY(-1px)}
.hh-btn .hh-arrow{transition:transform .18s}
.hh-btn-primary:hover .hh-arrow{transform:translateX(3px)}
.hh-btn-primary:hover .hh-spark{animation:hh-twinkle .8s ease}
.hh-block{width:100%}

.hh-dots{display:flex;gap:6px;margin-bottom:18px}
.hh-dot{height:4px;flex:1;background:var(--line);border-radius:99px;transition:background .3s}
.hh-dot.on{background:var(--teal)}
.hh-dot.done{background:var(--teal-soft)}

/* symptoms */
.hh-symwrap{display:flex;flex-direction:column;gap:10px;margin-bottom:6px}
.hh-sym{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface);transition:border-color .2s,background .2s,box-shadow .2s}
.hh-sym.on{border-color:var(--teal);background:var(--teal-soft);box-shadow:0 4px 14px -10px rgba(31,110,99,.5)}
.hh-sym-head{width:100%;display:flex;align-items:center;gap:11px;background:transparent;border:none;font:inherit;padding:13px 14px;cursor:pointer;text-align:left}
.hh-sym-ic{width:30px;height:30px;border-radius:8px;background:var(--surface2);display:flex;align-items:center;justify-content:center;color:var(--teal);flex-shrink:0;transition:background .2s,transform .2s}
.hh-sym.on .hh-sym-ic{background:#fff;transform:scale(1.05)}
.hh-sym-label{flex:1;font-size:13.8px;font-weight:600}
.hh-check{width:21px;height:21px;border-radius:99px;border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;transition:background .2s,border-color .2s}
.hh-check.on{background:var(--teal);border-color:var(--teal)}
.hh-check.on svg{animation:hh-pop .32s cubic-bezier(.34,1.56,.64,1)}
.hh-seg{display:flex;gap:6px;padding:0 14px 13px}
.hh-seg-inline{padding:0}
.hh-segbtn{flex:1;border:1px solid var(--line);background:#fff;color:var(--ink2);font:inherit;font-size:12.5px;font-weight:600;padding:8px 6px;border-radius:9px;cursor:pointer;transition:background .18s,color .18s,border-color .18s,transform .12s}
.hh-segbtn:hover{border-color:var(--teal)}
.hh-segbtn.on{background:var(--teal);color:#fff;border-color:var(--teal)}
.hh-segbtn:active{transform:scale(.96)}

/* goals */
.hh-goals{display:flex;flex-direction:column;gap:10px}
.hh-goalcard{display:flex;align-items:center;gap:11px;border:1px solid var(--line);background:var(--surface);border-radius:13px;padding:15px 15px;font:inherit;font-size:14px;font-weight:600;color:var(--ink);cursor:pointer;text-align:left;transition:transform .15s,border-color .2s,background .2s,box-shadow .2s}
.hh-goalcard:hover{transform:translateY(-2px);border-color:var(--teal);box-shadow:0 8px 18px -12px rgba(20,48,44,.4)}
.hh-goalcard.on{border-color:var(--teal);background:var(--teal-soft)}
.hh-goaldot{width:9px;height:9px;border-radius:99px;background:var(--line);transition:background .2s,transform .2s}
.hh-goalcard.on .hh-goaldot{background:var(--teal);transform:scale(1.3)}
.hh-goalcheck{margin-left:auto;color:var(--teal);animation:hh-pop .32s cubic-bezier(.34,1.56,.64,1)}

.hh-field{margin-bottom:18px}
.hh-flabel{display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--ink)}
.hh-chipwrap{display:flex;flex-wrap:wrap;gap:8px}
.hh-chip{border:1px solid var(--line);background:#fff;color:var(--ink2);font:inherit;font-size:12.5px;font-weight:600;padding:8px 13px;border-radius:99px;cursor:pointer;transition:background .18s,color .18s,border-color .18s,transform .12s}
.hh-chip:hover{border-color:var(--teal)}
.hh-chip.on{background:var(--teal);color:#fff;border-color:var(--teal)}
.hh-chip:active{transform:scale(.95)}
.hh-textarea{width:100%;border:1px solid var(--line);border-radius:11px;padding:11px 12px;font:inherit;font-size:13px;color:var(--ink);resize:none;background:var(--surface2);transition:border-color .15s}
.hh-textarea:focus{outline:2px solid var(--teal-soft);border-color:var(--teal)}

.hh-intake-nav{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:22px}
.hh-intake-nav .hh-btn-primary{margin-left:auto}

/* drafting */
.hh-draft{display:flex;flex-direction:column;align-items:center;padding-top:54px}
.hh-orbit{width:64px;height:64px;border-radius:99px;background:var(--teal-soft);color:var(--teal);display:flex;align-items:center;justify-content:center;margin-bottom:18px;animation:hh-pulse 1.6s ease-in-out infinite}
.hh-draftlines{display:flex;flex-direction:column;gap:11px;margin:18px 0 4px;width:100%}
.hh-draftline{display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--ink3);font-weight:500;opacity:.5;transition:.3s}
.hh-draftline.on{opacity:1;color:var(--ink)}
.hh-draftcheck{width:18px;height:18px;display:flex;align-items:center;justify-content:center;color:var(--teal)}
.hh-mini-spin{width:13px;height:13px;border:2px solid var(--teal-soft);border-top-color:var(--teal);border-radius:99px;animation:hh-spin .7s linear infinite;display:block}

/* pending */
.hh-pending{display:flex;flex-direction:column;align-items:center;padding-top:46px}
.hh-pendmark{width:58px;height:58px;border-radius:99px;background:var(--teal-soft);color:var(--teal-d);display:flex;align-items:center;justify-content:center;margin-bottom:16px;animation:hh-pulse 2s ease-in-out infinite}
.hh-care-note{display:flex;gap:10px;background:var(--clay-soft);border:1px solid #ecd4c2;border-radius:13px;padding:13px 14px;font-size:13px;line-height:1.45;color:#6e3c1d;margin-top:18px}
.hh-care-note svg{color:var(--clay);flex-shrink:0;margin-top:1px}
.hh-pendmeta{margin-top:20px}
.hh-sla{font-size:11.5px;font-weight:600;color:var(--ink3);background:var(--surface2);padding:6px 12px;border-radius:99px;border:1px solid var(--line)}

/* plan */
.hh-planhead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:16px}
.hh-reviewed{display:inline-flex;align-items:center;gap:5px;background:var(--teal-soft);color:var(--teal-d);font-size:11px;font-weight:700;padding:5px 9px;border-radius:99px;white-space:nowrap;flex-shrink:0}
.hh-thisweek{position:relative;overflow:hidden;background:var(--ink);color:#fff;border-radius:16px;padding:17px 17px 15px;margin-bottom:20px;animation:hh-rise .5s ease backwards}
.hh-thisweek::after{content:'';position:absolute;inset:0;background:radial-gradient(130% 90% at 112% -12%, rgba(157,198,189,.26), transparent 60%);pointer-events:none;z-index:0}
.hh-thisweek > *{position:relative;z-index:1}
.hh-tw-label{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#9dc6bd}
.hh-tw-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:600;font-size:17px;margin:6px 0 4px}
.hh-tw-action{font-size:13px;line-height:1.45;color:#cfe0db}
.hh-phase{margin-bottom:18px}
.hh-phase-label{font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3);margin:0 0 10px;padding-bottom:7px;border-bottom:1px solid var(--line)}
.hh-rec{border:1px solid var(--line);border-radius:13px;padding:13px 14px;margin-bottom:10px;background:var(--surface);animation:hh-rise .45s ease backwards;transition:transform .18s,box-shadow .2s,border-color .2s}
.hh-rec:hover{transform:translateY(-2px);border-color:var(--teal);box-shadow:0 10px 22px -14px rgba(20,48,44,.4)}
.hh-rec.referral{background:var(--surface2);border-style:dashed}
.hh-rec.safety{background:var(--rose-soft);border-color:#eccfc6}
.hh-rec.safety:hover{border-color:var(--rose)}
.hh-rec-head{display:flex;align-items:center;gap:9px;margin-bottom:5px}
.hh-rec-ic{width:27px;height:27px;border-radius:7px;background:var(--teal-soft);color:var(--teal-d);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.hh-rec.safety .hh-rec-ic{background:#fff;color:var(--rose)}
.hh-rec-title{font-size:14px;font-weight:600;flex:1}
.hh-cadence{font-size:11px;font-weight:600;color:var(--ink3);background:var(--surface2);padding:3px 8px;border-radius:99px;white-space:nowrap}
.hh-rec.referral .hh-cadence,.hh-rec.safety .hh-cadence{background:#fff}
.hh-rec-action{font-size:13px;line-height:1.45;color:var(--ink2)}

/* why / evidence — the signature element */
.hh-why{margin-top:9px}
.hh-whybtn{display:inline-flex;align-items:center;gap:5px;background:transparent;border:none;color:var(--teal);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:2px 0;transition:gap .15s}
.hh-whybtn:hover{gap:8px}
.hh-why.light .hh-whybtn{color:#9dc6bd}
.hh-chev{transition:transform .25s}
.hh-chev.open{transform:rotate(180deg)}
.hh-evidence{margin-top:9px;border-left:2.5px solid var(--teal);padding:11px 0 3px 12px;animation:hh-evopen .3s ease}
.hh-why.light .hh-evidence{border-color:#5d9b90}
.hh-evrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}
.hh-badge{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:6px;letter-spacing:.02em}
.b-guideline{background:var(--teal-soft);color:var(--teal-d)}
.b-good{background:#e7eef4;color:#33566f}
.b-referral{background:var(--clay-soft);color:#8a4a23}
.b-safety{background:var(--rose-soft);color:var(--rose)}
.hh-source{font-size:11px;font-weight:600;color:var(--ink3)}
.hh-why.light .hh-source{color:#9dc6bd}
.hh-evtext{font-size:12.5px;line-height:1.5;color:var(--ink2);margin:0 0 8px}
.hh-why.light .hh-evtext{color:#cfe0db}
.hh-reviewedby{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--teal-d)}
.hh-why.light .hh-reviewedby{color:#9dc6bd}
.hh-checkin{margin-top:8px}

/* clinician console */
.hh-console{width:100%;max-width:760px;background:var(--surface);border:1px solid var(--cool-line);border-radius:18px;overflow:hidden;box-shadow:0 18px 44px -28px rgba(20,48,44,.4);animation:hh-fade .35s ease}
.hh-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:60px 30px;color:var(--ink3)}
.hh-empty svg{color:var(--ink3);margin-bottom:6px}
.hh-empty .hh-h2{color:var(--ink)}
.hh-console-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:20px 22px;background:var(--cool);border-bottom:1px solid var(--cool-line)}
.hh-console-meta{font-size:12.5px;color:var(--ink2);margin-top:6px}
.hh-status-pill{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;padding:6px 11px;border-radius:99px;white-space:nowrap}
.hh-status-pill.wait{background:var(--amber-soft);color:#6f4e0c}
.hh-status-pill.ok{background:var(--teal-soft);color:var(--teal-d)}
.hh-pulsedot{width:7px;height:7px;border-radius:99px;background:#b07d12;animation:hh-blink 1.4s ease-in-out infinite}

.hh-flag{display:flex;align-items:center;gap:12px;margin:16px 22px 0;background:var(--rose-soft);border:1px solid #ecccc1;border-radius:13px;padding:13px 15px;flex-wrap:wrap}
.hh-flag>svg{color:var(--rose);flex-shrink:0}
.hh-flag-body{flex:1;min-width:200px;font-size:12.5px;line-height:1.4;color:#7a3320}
.hh-flag-body b{color:var(--rose)}
.hh-btn-flag{background:var(--rose);color:#fff;font-size:12.5px;padding:9px 13px;border:none;border-radius:9px;font-weight:600;cursor:pointer;font-family:inherit;transition:transform .12s,box-shadow .18s}
.hh-btn-flag:hover{transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(168,68,44,.5)}
.hh-flag-done{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:var(--rose)}
.hh-flag.ack{opacity:.7}

.hh-review-list{padding:14px 22px}
.hh-rrec{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--line);transition:opacity .2s}
.hh-rrec:last-child{border-bottom:none}
.hh-rrec.off{opacity:.42}
.hh-rrec-ic{width:30px;height:30px;border-radius:8px;background:var(--cool);color:var(--teal-d);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.hh-rrec-main{flex:1}
.hh-rrec-top{display:flex;align-items:center;gap:9px;margin-bottom:3px;flex-wrap:wrap}
.hh-rrec-title{font-size:14px;font-weight:600}
.hh-rrec-action{font-size:12.5px;color:var(--ink2);line-height:1.4;margin-bottom:5px}
.hh-rrec-ev{font-size:11.5px;color:var(--ink3);line-height:1.45}
.hh-rrec-toggle{align-self:flex-start;border:1px solid var(--line);background:#fff;color:var(--ink2);font:inherit;font-size:11.5px;font-weight:600;padding:6px 11px;border-radius:8px;cursor:pointer;white-space:nowrap;transition:border-color .15s,color .15s}
.hh-rrec-toggle:hover{border-color:var(--rose);color:var(--rose)}

.hh-console-foot{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px;background:var(--cool);border-top:1px solid var(--cool-line)}
.hh-released{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--teal-d);margin-right:auto;animation:hh-rise .4s ease}

/* keyframes */
@keyframes hh-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes hh-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes hh-evopen{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes hh-pop{0%{transform:scale(0)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes hh-settle{0%{transform:scale(.78)}60%{transform:scale(1.14)}100%{transform:scale(1)}}
@keyframes hh-twinkle{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.28) rotate(14deg)}}
@keyframes hh-pulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(31,110,99,.18)}50%{transform:scale(1.05);box-shadow:0 0 0 12px rgba(31,110,99,0)}}
@keyframes hh-spin{to{transform:rotate(360deg)}}
@keyframes hh-blink{0%,100%{opacity:1}50%{opacity:.3}}

/* ====================== RESPONSIVE ====================== */
/* tablet */
@media (max-width:1024px){
  .hh-hint,.hh-stage{max-width:760px}
}
@media (max-width:820px){
  .hh-console-head{flex-direction:column;align-items:flex-start;gap:10px}
  .hh-flag{flex-direction:column;align-items:flex-start}
  .hh-btn-flag{width:100%}
}
/* mobile — the phone chrome melts away so the app fills the screen */
@media (max-width:640px){
  .hh-header{gap:10px;padding:12px 16px}
  .hh-roletoggle{order:3;width:100%;margin-top:2px}
  .hh-ribbon{font-size:11px;padding:7px 14px}
  .hh-hint{margin-top:12px;font-size:12.5px}
  .hh-stage{padding:14px 12px 0}
  .hh-phone{max-width:none;background:transparent;padding:0;border-radius:0;box-shadow:none}
  .hh-phone-notch{display:none}
  .hh-phone-inner{border-radius:16px;min-height:auto;border:1px solid var(--line)}
  .hh-screen{padding:22px 18px 24px}
  .hh-h1{font-size:23px}
  .hh-btn{padding:14px 18px;font-size:15px}
  .hh-segbtn{padding:11px 6px}
  .hh-chip{padding:10px 14px}
  .hh-sym-head{padding:15px 14px}
  .hh-goalcard{padding:16px 15px}
  .hh-console{border-radius:14px}
  .hh-console-foot{flex-direction:column}
  .hh-console-foot .hh-btn{width:100%}
}
@media (max-width:520px){
  .hh-rrec{flex-wrap:wrap}
  .hh-rrec-toggle{margin-left:42px}
}

/* accessibility: honour reduced-motion */
@media (prefers-reduced-motion: reduce){
  .hh-app *{animation:none !important;transition:none !important}
}
`;
