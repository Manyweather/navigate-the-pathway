"use client";

import { useEffect, useMemo, useState } from "react";

type Focus = "records" | "courses" | "story" | "support" | "unsure";
type Standing = "junior" | "senior" | "gap" | "unsure";
type Records = "current" | "scattered" | "memory";
type Cycle = "this-year" | "next-year" | "later" | "unsure";
type Bandwidth = "steady" | "tight" | "overloaded";
type Participation = "observe" | "react" | "respond" | "connect";
type Support = "mapped" | "some" | "not-sure";

type Branch = {
  id: string;
  title: string;
  eyebrow: string;
  reason: string;
  nextMove: string;
  outcome: string;
};

type Station = {
  id: string;
  branchId: string;
  name: string;
  label: string;
  icon: string;
  action: string;
  science: string;
};

type TransitionState = {
  target: number;
  kicker: string;
  title: string;
  copy: string;
};

const transitionMoments: Record<number, Omit<TransitionState, "target">> = {
  5: {
    kicker: "District unlocked",
    title: "Your pathway map is ready.",
    copy: "Tap a station to see one useful action and one practical tip.",
  },
  7: {
    kicker: "Experience captured",
    title: "Memory becomes evidence.",
    copy: "A few specific details can become reflection, learning, and clearer writing later.",
  },
  10: {
    kicker: "Setup complete",
    title: "Your pathway is ready.",
    copy: "You saved one experience and chose one clear next action.",
  },
};

const focusOptions: { value: Focus; title: string; note: string; icon: string }[] = [
  { value: "records", title: "My records are scattered", note: "Organize what you have", icon: "▤" },
  { value: "courses", title: "I need course direction", note: "Clarify what comes next", icon: "⌁" },
  { value: "story", title: "Writing feels difficult", note: "Find meaning first", icon: "✎" },
  { value: "support", title: "I need more support", note: "Connect at your pace", icon: "◎" },
  { value: "unsure", title: "I am still exploring", note: "Start with curiosity", icon: "✦" },
];

const branches: Record<string, Branch> = {
  evidence: {
    id: "evidence",
    title: "Recover the Evidence",
    eyebrow: "Recommended first route",
    reason: "You already have experiences. Capturing one well gives you more value than chasing another hour today.",
    nextMove: "Turn one experience into an application-ready record.",
    outcome: "A reusable experience artifact",
  },
  course: {
    id: "course",
    title: "Chart the Route",
    eyebrow: "Recommended first route",
    reason: "Course clarity will make the rest of your planning more grounded and easier to sequence.",
    nextMove: "Map one prerequisite and the question you still need answered.",
    outcome: "A course-planning question",
  },
  story: {
    id: "story",
    title: "Find the Story",
    eyebrow: "Recommended first route",
    reason: "You have material already. Reflection can reveal what an admissions reader cannot learn from hours alone.",
    nextMove: "Name the moment that changed how you think or act.",
    outcome: "A reflection seed",
  },
  explore: {
    id: "explore",
    title: "Explore the Next Door",
    eyebrow: "Recommended first route",
    reason: "You do not need a perfect plan yet. A small, informed exploration can tell you what deserves deeper commitment.",
    nextMove: "Choose one setting or role to investigate.",
    outcome: "A bounded exploration",
  },
  quiet: {
    id: "quiet",
    title: "Quiet Start",
    eyebrow: "Recommended first route",
    reason: "Contribution does not have to begin with speaking. Observation and low-stakes responses can build belonging first.",
    nextMove: "Observe one cohort exchange and save a useful idea.",
    outcome: "A low-pressure connection",
  },
  constellation: {
    id: "constellation",
    title: "Build the Constellation",
    eyebrow: "Recommended first route",
    reason: "Premed progress is more sustainable when you can name who offers perspective, care, accountability, and expertise.",
    nextMove: "Identify one person you can ask for a specific kind of support.",
    outcome: "A support network",
  },
  sustainable: {
    id: "sustainable",
    title: "Make It Sustainable",
    eyebrow: "Recommended first route",
    reason: "Your current bandwidth matters. A smaller plan you can keep is stronger than an ambitious plan that drains you.",
    nextMove: "Choose one habit small enough for a crowded week.",
    outcome: "A realistic study-life experiment",
  },
  assemble: {
    id: "assemble",
    title: "Assemble the Evidence",
    eyebrow: "Recommended first route",
    reason: "Your application window is close enough that organizing evidence now will reduce pressure later.",
    nextMove: "Connect one experience to a value, learning moment, and future action.",
    outcome: "An application evidence block",
  },
};

const stations: Station[] = [
  {
    id: "courses",
    branchId: "course",
    name: "Course Camp",
    label: "Courses",
    icon: "▤",
    action: "Choose one prerequisite question to verify with an advisor.",
    science: "Reduce cognitive load by solving one planning question at a time.",
  },
  {
    id: "evidence",
    branchId: "evidence",
    name: "Experience Vault",
    label: "Experiences",
    icon: "⌕",
    action: "Save one recent role while the details are still specific.",
    science: "Frequent retrieval strengthens memory and gives future writing more detail.",
  },
  {
    id: "service",
    branchId: "explore",
    name: "Compassion Commons",
    label: "Service",
    icon: "♡",
    action: "Name who benefited, what you noticed, and what you would do differently.",
    science: "Self-explanation turns an activity into transferable learning.",
  },
  {
    id: "cohort",
    branchId: "constellation",
    name: "Cohort Commons",
    label: "Support",
    icon: "◎",
    action: "Choose one low-pressure way to learn with classmates this week.",
    science: "Belonging and social accountability make difficult goals easier to sustain.",
  },
  {
    id: "reflection",
    branchId: "story",
    name: "Reflection Studio",
    label: "Reflection",
    icon: "✦",
    action: "Capture one moment that changed how you think or act.",
    science: "Elaboration connects a specific experience to a durable idea.",
  },
  {
    id: "application",
    branchId: "assemble",
    name: "Application Outlook",
    label: "Application",
    icon: "⌁",
    action: "Connect one experience to a value, a learning moment, and a future action.",
    science: "Organizing evidence into small chunks lowers the effort of drafting later.",
  },
];

const branchStation: Record<string, string> = {
  evidence: "evidence",
  course: "courses",
  story: "reflection",
  explore: "service",
  quiet: "cohort",
  constellation: "cohort",
  sustainable: "reflection",
  assemble: "application",
};

const experienceOptions = ["Clinical exposure", "Community service", "Research", "Leadership", "Employment", "Shadowing", "Caregiving", "None yet"];

const experienceIcons: Record<string, string> = {
  "Clinical exposure": "+",
  "Community service": "♥",
  Research: "⌬",
  Leadership: "↑",
  Employment: "▣",
  Shadowing: "◉",
  Caregiving: "♡",
  "None yet": "○",
};

const commitments = [
  ["Log another experience", "Keep your evidence trail alive."],
  ["Map one course question", "Turn uncertainty into a question you can act on."],
  ["Contact one support person", "Ask for one specific kind of help."],
  ["Try one study strategy", "Run a small experiment, then reflect."],
  ["Join a cohort prompt", "Participate at the level that fits today."],
  ["Review this reflection", "Return with fresh eyes before you reuse it."],
] as const;

function ChoiceButton({ selected, title, note, icon, onClick }: { selected: boolean; title: string; note?: string; icon?: string; onClick: () => void }) {
  return (
    <button className={`choice ${selected ? "choice--selected" : ""}`} type="button" aria-pressed={selected} onClick={onClick}>
      <span className={`choice__marker ${icon ? "choice__marker--icon" : ""}`} aria-hidden="true">{selected ? "✓" : icon ?? ""}</span>
      <span><strong>{title}</strong>{note ? <small>{note}</small> : null}</span>
    </button>
  );
}

function SectionHeading({ kicker, title, copy }: { kicker: string; title: string; copy?: string }) {
  return <div className="section-heading"><p className="kicker">{kicker}</p><h1>{title}</h1>{copy ? <p className="lede">{copy}</p> : null}</div>;
}

function BrandLockup() {
  return (
    <span className="brand-lockup">
      <img src="/assets/navigate-pipeline-roseman.png" alt="" />
    </span>
  );
}

function MilestoneSignal({ label }: { label: string }) {
  return (
    <div className="milestone-signal">
      <span className="milestone-signal__icon" aria-hidden="true">✓</span>
      <span><small>Navigate</small><strong>{label}</strong></span>
    </div>
  );
}

function AppDock({ step }: { step: number }) {
  const active = step >= 8 ? "cohort" : step >= 5 ? "path" : "setup";
  return (
    <nav className="app-dock" aria-label="Navigate sections">
      <span className={active === "setup" ? "app-dock__active" : ""}><b aria-hidden="true">◌</b>Setup</span>
      <span className={active === "path" ? "app-dock__active" : ""}><b aria-hidden="true">⌁</b>Path</span>
      <span className={active === "cohort" ? "app-dock__active" : ""}><b aria-hidden="true">◎</b>Cohort</span>
      <span><b aria-hidden="true">▤</b>Vault</span>
    </nav>
  );
}

export function JourneyExperience() {
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [records, setRecords] = useState<Records | null>(null);
  const [experiences, setExperiences] = useState<string[]>([]);
  const [bandwidth, setBandwidth] = useState<Bandwidth | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [support, setSupport] = useState<Support | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [experienceTitle, setExperienceTitle] = useState("");
  const [experienceWhen, setExperienceWhen] = useState("");
  const [experienceRole, setExperienceRole] = useState("");
  const [experiencePeople, setExperiencePeople] = useState("");
  const [experienceLesson, setExperienceLesson] = useState("");
  const [cohortMode, setCohortMode] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [reminder, setReminder] = useState("In 3 days");
  const [transition, setTransition] = useState<TransitionState | null>(null);

  useEffect(() => {
    if (!transition) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setStep(transition.target);
      setTransition(null);
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    }, reducedMotion ? 120 : 880);
    return () => window.clearTimeout(timer);
  }, [transition]);

  const recommendedBranch = useMemo(() => {
    if (focus === "records" || records === "scattered" || records === "memory") return branches.evidence;
    if (focus === "courses") return branches.course;
    if (focus === "story") return branches.story;
    if (focus === "support" || support === "not-sure") return branches.constellation;
    if (focus === "unsure" || experiences.length <= 1) return branches.explore;
    if (bandwidth === "overloaded") return branches.sustainable;
    if (participation === "observe") return branches.quiet;
    if (cycle === "this-year") return branches.assemble;
    return branches.story;
  }, [bandwidth, cycle, experiences.length, focus, participation, records, support]);

  const activeBranch = branches[selectedBranch ?? recommendedBranch.id];
  const recommendedStationId = branchStation[recommendedBranch.id];
  const activeStation = stations.find((station) => station.id === branchStation[activeBranch.id]) ?? stations[0];
  const progress = Math.min(100, Math.round((step / 10) * 100));

  const toggleExperience = (value: string) => {
    setExperiences((current) => {
      if (value === "None yet") return current.includes(value) ? [] : [value];
      const withoutNone = current.filter((item) => item !== "None yet");
      return withoutNone.includes(value) ? withoutNone.filter((item) => item !== value) : [...withoutNone, value];
    });
  };

  const loadExample = () => {
    setExperienceTitle("Community food access volunteer");
    setExperienceWhen("Spring semester · about 42 hours");
    setExperienceRole("Welcomed families, restocked staples, and helped with check-in.");
    setExperiencePeople("Families arriving after work and the volunteers coordinating intake.");
    setExperienceLesson("I noticed that the check-in process was difficult for people arriving late. I learned to ask what would make access easier before assuming I knew the answer.");
  };

  const artifactComplete = experienceTitle.trim() && experienceWhen.trim() && experienceRole.trim() && experiencePeople.trim() && experienceLesson.trim();

  const reset = () => {
    setStep(0); setFocus(null); setStanding(null); setCycle(null); setRecords(null); setExperiences([]); setBandwidth(null);
    setParticipation(null); setSupport(null); setSelectedBranch(null); setExperienceTitle(""); setExperienceWhen("");
    setExperienceRole(""); setExperiencePeople(""); setExperienceLesson(""); setCohortMode(null); setCommitment(null); setReminder("In 3 days"); setTransition(null);
  };

  const next = () => {
    const target = Math.min(10, step + 1);
    const moment = transitionMoments[target];
    if (moment) {
      setTransition({ target, ...moment });
      return;
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => { setStep((current) => Math.max(0, current - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <main className="site-shell">
      <div className="ambient ambient--one" aria-hidden="true" /><div className="ambient ambient--two" aria-hidden="true" />
      {transition ? <div className="transition-screen" role="status" aria-live="polite">
        <span className="transition-hex transition-hex--one" aria-hidden="true" /><span className="transition-hex transition-hex--two" aria-hidden="true" />
        <div className="transition-screen__inner">
          <img className="transition-logo" src="/assets/navigate-pipeline-roseman.png" alt="" />
          <p className="transition-kicker">{transition.kicker}</p>
          <h2>{transition.title}</h2>
          <p>{transition.copy}</p>
          <span className="transition-line" aria-hidden="true"><i /><i /><i /><i /></span>
          <small>Roseman University College of Medicine · concept experience</small>
        </div>
      </div> : null}
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Navigate Pre-Med Pathways home"><BrandLockup /></a>
        <span className="concept-label">Concept prototype</span>
      </header>
      {step < 10 ? <div className="progress-wrap" aria-label={`Pathway setup: ${progress}%`}><div className="progress-meta"><span>Pathway setup</span><span>{progress}%</span></div><div className="progress-track"><span style={{ width: `${Math.max(4, progress)}%` }} /></div></div> : null}

      <div className="experience" id="top">
        {step === 0 ? <section className="screen welcome-screen" aria-labelledby="welcome-title">
          <div className="institutional-line"><span>Roseman University</span><span>College of Medicine · concept experience</span></div>
          <img className="welcome-logo" src="/assets/navigate-pipeline-roseman.png" alt="Navigate the Pipeline" />
          <div className="welcome-visual">
            <div className="welcome-visual__copy"><p className="kicker">Personalized premed support</p><h1 id="welcome-title">Start with what you already have.</h1><p className="lede">Answer a few quick questions. Get one useful place to begin.</p></div>
            <img src="/assets/premed-pathway-illustration.png" alt="Premed students studying, serving, researching, reflecting, and supporting each other" />
          </div>
          <div className="prompt-block prompt-card"><div className="prompt-card__title"><span>1</span><h2>What feels hardest today?</h2></div><div className="choice-stack focus-grid">{focusOptions.map((option) => <ChoiceButton key={option.value} selected={focus === option.value} title={option.title} note={option.note} icon={option.icon} onClick={() => setFocus(option.value)} />)}</div></div>
          <button className="primary-button primary-button--wide" type="button" disabled={!focus} onClick={next}>Set up my pathway <span aria-hidden="true">→</span></button><p className="microcopy">About 6 minutes · Private by default</p>
        </section> : null}

        {step === 1 ? <section className="screen" aria-labelledby="trust-title">
          <SectionHeading kicker="Before you begin" title="Three things to know." copy="This is a preparation space, not an admissions prediction." />
          <div className="trust-grid">
            <article className="trust-card"><span className="trust-icon" aria-hidden="true">⌾</span><h2 id="trust-title">You control sharing</h2><p>Reflections stay private until you choose otherwise.</p></article>
            <article className="trust-card"><span className="trust-icon" aria-hidden="true">⌁</span><h2>Coaching only</h2><p>Navigate does not predict admission outcomes.</p></article>
            <article className="trust-card trust-card--warm"><span className="trust-icon" aria-hidden="true">♡</span><h2>Protect people</h2><p>Never enter patient names or identifying details.</p></article>
          </div><div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" onClick={next}>I understand <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 2 ? <section className="screen" aria-labelledby="stage-title">
          <SectionHeading kicker="Quick setup · 1 of 3" title="Where are you right now?" copy="There is no behind here." />
          <div className="prompt-block"><h2 id="stage-title">Current stage</h2><div className="compact-grid">{(["junior", "senior", "gap", "unsure"] as Standing[]).map((value) => <ChoiceButton key={value} selected={standing === value} title={({ junior: "Junior", senior: "Senior", gap: "Gap or bridge year", unsure: "I’m not sure" } as Record<Standing, string>)[value]} onClick={() => setStanding(value)} />)}</div></div>
          <div className="prompt-block"><h2>When might you apply?</h2><div className="compact-grid">{(["this-year", "next-year", "later", "unsure"] as Cycle[]).map((value) => <ChoiceButton key={value} selected={cycle === value} title={({ "this-year": "This cycle", "next-year": "Next cycle", later: "Later", unsure: "I’m not sure" } as Record<Cycle, string>)[value]} onClick={() => setCycle(value)} />)}</div></div>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!standing || !cycle} onClick={next}>Continue <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 3 ? <section className="screen" aria-labelledby="evidence-title">
          <SectionHeading kicker="Quick setup · 2 of 3" title="What is already part of your journey?" copy="Paid, unpaid, and informal roles count." />
          <div className="prompt-block"><h2 id="evidence-title">My records are</h2><div className="compact-grid compact-grid--three">{(["current", "scattered", "memory"] as Records[]).map((value) => <ChoiceButton key={value} selected={records === value} title={({ current: "Mostly current", scattered: "Scattered", memory: "Mostly in memory" } as Record<Records, string>)[value]} onClick={() => setRecords(value)} />)}</div></div>
          <div className="prompt-block"><h2>Select your experiences</h2><div className="tag-grid experience-tile-grid">{experienceOptions.map((value) => <button className={`tag-choice experience-tile ${experiences.includes(value) ? "tag-choice--selected" : ""}`} type="button" aria-pressed={experiences.includes(value)} key={value} onClick={() => toggleExperience(value)}><span aria-hidden="true">{experienceIcons[value]}</span>{value}</button>)}</div></div>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!records || experiences.length === 0} onClick={next}>Continue <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 4 ? <section className="screen" aria-labelledby="rhythm-title">
          <SectionHeading kicker="Quick setup · 3 of 3" title="How should Navigate support you?" copy="Choose what fits today. You can change it later." />
          <div className="prompt-block"><h2 id="rhythm-title">My bandwidth</h2><div className="compact-grid compact-grid--three">{(["steady", "tight", "overloaded"] as Bandwidth[]).map((value) => <ChoiceButton key={value} selected={bandwidth === value} title={({ steady: "Steady", tight: "Tight", overloaded: "Overloaded" } as Record<Bandwidth, string>)[value]} onClick={() => setBandwidth(value)} />)}</div></div>
          <div className="prompt-block"><h2>In a new group</h2><div className="compact-grid">{(["observe", "react", "respond", "connect"] as Participation[]).map((value) => <ChoiceButton key={value} selected={participation === value} title={({ observe: "I observe first", react: "I react", respond: "I use a prompt", connect: "I connect 1:1" } as Record<Participation, string>)[value]} onClick={() => setParticipation(value)} />)}</div></div>
          <div className="prompt-block"><h2>My support system</h2><div className="compact-grid compact-grid--three">{(["mapped", "some", "not-sure"] as Support[]).map((value) => <ChoiceButton key={value} selected={support === value} title={({ mapped: "Clear", some: "Partly there", "not-sure": "Hard to name" } as Record<Support, string>)[value]} onClick={() => setSupport(value)} />)}</div></div>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!bandwidth || !participation || !support} onClick={next}>Show my starting point <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 5 ? <section className="screen map-screen" aria-labelledby="map-title">
          <MilestoneSignal label="Premed district unlocked" />
          <SectionHeading kicker="Your pathway map" title="Choose a station." copy="Swipe to explore. Tap any station for an action and a practical learning tip." />
          <div className="map-recommendation"><span aria-hidden="true">✦</span><p><strong>Suggested first stop:</strong> {stations.find((station) => station.id === recommendedStationId)?.name}</p></div>
          <div className="district-map" aria-label="Interactive map of premed development stations">
            <div className="district-map__canvas">
              <img src="/assets/premed-district-map.png" alt="Illustrated premed pathway with connected learning stations" />
              {stations.map((station) => <button
                key={station.id}
                type="button"
                className={`station station--${station.id} ${activeStation.id === station.id ? "station--active" : ""} ${recommendedStationId === station.id ? "station--recommended" : ""}`}
                aria-pressed={activeStation.id === station.id}
                onClick={() => setSelectedBranch(station.branchId)}
              ><span aria-hidden="true">{station.icon}</span><strong>{station.label}</strong></button>)}
            </div>
          </div>
          <article className="station-sheet" id="map-title" aria-live="polite">
            <div className="station-sheet__title"><span aria-hidden="true">{activeStation.icon}</span><div><p>{activeStation.id === recommendedStationId ? "Recommended first stop" : "Explore this station"}</p><h2>{activeStation.name}</h2></div></div>
            <div className="station-sheet__grid"><div><small>Try this</small><p>{activeStation.action}</p></div><div><small>Why it works</small><p>{activeStation.science}</p></div></div>
          </article>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" onClick={next}>Enter {activeStation.name} <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 6 ? <section className="screen" aria-labelledby="quest-title">
          <SectionHeading kicker={`Five-minute activity · ${activeStation.name}`} title="Save one experience." copy="Use a fictionalized example. Never include identifying details." />
          <div className="quest-banner"><span aria-hidden="true">5:00</span><p><strong>Keep it simple.</strong> Capture useful details, not perfect writing.</p><button type="button" onClick={loadExample}>Try an example</button></div>
          <form className="artifact-form" onSubmit={(event) => event.preventDefault()}>
            <label><span><b>1</b> Experience</span><input id="quest-title" value={experienceTitle} onChange={(event) => setExperienceTitle(event.target.value)} placeholder="Role or experience name" /></label>
            <label><span><b>2</b> When and how much</span><input value={experienceWhen} onChange={(event) => setExperienceWhen(event.target.value)} placeholder="Semester, dates, or estimated hours" /></label>
            <label><span><b>3</b> What you did</span><textarea value={experienceRole} onChange={(event) => setExperienceRole(event.target.value)} placeholder="Use specific verbs" /></label>
            <label><span><b>4</b> Who benefited</span><textarea value={experiencePeople} onChange={(event) => setExperiencePeople(event.target.value)} placeholder="Describe roles or groups, never names" /></label>
            <label><span><b>5</b> What changed</span><textarea value={experienceLesson} onChange={(event) => setExperienceLesson(event.target.value)} placeholder="A lesson, question, or change in perspective" /></label>
          </form>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!artifactComplete} onClick={next}>Save experience <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 7 ? <section className="screen reveal-screen" aria-labelledby="reveal-title">
          <MilestoneSignal label="Experience saved" /><div className="reveal-badge" aria-hidden="true">✓</div><SectionHeading kicker="Saved to your vault" title="One experience. Three future uses." />
          <div className="artifact-value-grid">
            <article><span aria-hidden="true">▤</span><h2 id="reveal-title">Activity record</h2><p>{experienceTitle} · {experienceWhen}</p></article>
            <article><span aria-hidden="true">✦</span><h2>Reflection</h2><p>{experienceLesson}</p></article>
            <article><span aria-hidden="true">✎</span><h2>Story seed</h2><p>{experienceRole}</p></article>
          </div>
          <p className="insight-callout"><strong>Why it matters:</strong> Your hours now have context, learning, and a story you can return to.</p>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Edit artifact</button><button className="primary-button" type="button" onClick={next}>Meet the cohort <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 8 ? <section className="screen" aria-labelledby="cohort-title">
          <SectionHeading kicker="Cohort" title="Choose how you want to participate." copy="Quiet participation counts." />
          <div className="cohort-visual"><img src="/assets/premed-pathway-illustration.png" alt="Premed classmates learning and supporting one another" /><span>18 classmates here</span></div>
          <article className="cohort-prompt"><div className="cohort-prompt__meta"><span>Today’s cohort prompt</span><span>18 classmates here</span></div><h2 id="cohort-title">What is one small way a classmate could support your next step?</h2><div className="sample-reply"><span className="avatar" aria-hidden="true">M</span><p><strong>Maya · Senior</strong>I’d appreciate an accountability check after I contact my research mentor.</p></div></article>
          <div className="choice-stack cohort-choices">
            <ChoiceButton selected={cohortMode === "observe"} title="Observe" note="Read and save one idea" icon="◉" onClick={() => setCohortMode("observe")} />
            <ChoiceButton selected={cohortMode === "react"} title="React" note="Acknowledge a classmate" icon="♡" onClick={() => setCohortMode("react")} />
            <ChoiceButton selected={cohortMode === "prompt"} title="Use a prompt" note="Start with a sentence" icon="✎" onClick={() => setCohortMode("prompt")} />
            <ChoiceButton selected={cohortMode === "connect"} title="Connect 1:1" note="Invite one focused conversation" icon="◎" onClick={() => setCohortMode("connect")} />
          </div><p className="quiet-assurance">Quiet participation is real participation. You can change modes any time.</p>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!cohortMode} onClick={next}>Choose my next move <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 9 ? <section className="screen" aria-labelledby="next-title">
          <SectionHeading kicker="One next action" title="Choose something small enough to keep." />
          <div className="commitment-grid" id="next-title">{commitments.map(([title, note]) => <ChoiceButton key={title} selected={commitment === title} title={title} note={note} onClick={() => setCommitment(title)} />)}</div>
          <div className="reminder-card"><div><p className="kicker">Gentle follow-through</p><h2>When should Navigate bring this back?</h2></div><select value={reminder} onChange={(event) => setReminder(event.target.value)} aria-label="Reminder timing"><option>Tomorrow</option><option>In 3 days</option><option>In one week</option><option>No reminder</option></select></div>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!commitment} onClick={next}>Finish setup <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 10 ? <section className="dashboard" aria-labelledby="dashboard-title">
          <MilestoneSignal label="Pathway setup complete" />
          <div className="dashboard-hero"><div><p className="kicker">Your pathway · Today</p><h1 id="dashboard-title">You are ready for one next action.</h1><p>Your experience is saved. Your starting point is clear.</p></div><div className="completion-ring" aria-label="Pathway setup complete"><span>✓</span><small>ready</small></div></div>
          <div className="dashboard-grid">
            <article className="dash-card dash-card--artifact"><p className="card-label">Saved artifact</p><h2>{experienceTitle}</h2><p>{experienceLesson}</p><span className="status-line"><b aria-hidden="true">✓</b> Reflection attached</span></article>
            <article className="dash-card"><p className="card-label">Active station</p><h2>{activeStation.name}</h2><p>{activeStation.action}</p></article>
            <article className="dash-card"><p className="card-label">Cohort mode</p><h2>{({ observe: "Observing", react: "Reacting", prompt: "Prompted response", connect: "1:1 connection" } as Record<string, string>)[cohortMode ?? "observe"]}</h2><p>Your participation setting can change whenever your comfort or context changes.</p></article>
            <article className="dash-card dash-card--next"><p className="card-label">Your next move</p><h2>{commitment}</h2><p>{reminder === "No reminder" ? "No reminder set." : `We’ll bring this back ${reminder.toLowerCase()}.`}</p><button type="button">Open next move <span aria-hidden="true">→</span></button></article>
          </div>
          <div className="values-line"><span>Reflect with honesty</span><span>Act with compassion</span><span>Grow with others</span></div><button className="reset-button" type="button" onClick={reset}>Restart the prototype</button><p className="prototype-note">Navigate Pathways is a concept prototype. It is not an admissions portal or admissions decision tool.</p>
        </section> : null}
      </div>
      {step > 0 ? <AppDock step={step} /> : null}
      <footer className="site-footer"><p>Designed for the journey before application.</p><p>Concept prototype · Not an admissions decision tool</p></footer>
    </main>
  );
}
