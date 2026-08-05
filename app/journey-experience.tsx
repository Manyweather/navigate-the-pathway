"use client";

import { useMemo, useState } from "react";

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

const focusOptions: { value: Focus; title: string; note: string }[] = [
  { value: "records", title: "I’ve done a lot, but my records are scattered.", note: "Turn memory into usable evidence." },
  { value: "courses", title: "I know my courses, but not what comes next.", note: "See the route without pretending there is only one route." },
  { value: "story", title: "I have experience, but struggle to write about it.", note: "Find meaning before drafting an essay." },
  { value: "support", title: "I want a stronger support system.", note: "Build connection at a comfortable pace." },
  { value: "unsure", title: "I’m still figuring out where I am.", note: "Start with curiosity, not comparison." },
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
    outcome: "A support-system map",
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

const experienceOptions = ["Clinical exposure", "Community service", "Research", "Leadership", "Employment", "Shadowing", "Caregiving", "None yet"];

const commitments = [
  ["Log another experience", "Keep your evidence trail alive."],
  ["Map one course question", "Turn uncertainty into a question you can act on."],
  ["Contact one support person", "Ask for one specific kind of help."],
  ["Try one study strategy", "Run a small experiment, then reflect."],
  ["Join a cohort prompt", "Participate at the level that fits today."],
  ["Review this reflection", "Return with fresh eyes before you reuse it."],
] as const;

function ChoiceButton({ selected, title, note, onClick }: { selected: boolean; title: string; note?: string; onClick: () => void }) {
  return (
    <button className={`choice ${selected ? "choice--selected" : ""}`} type="button" aria-pressed={selected} onClick={onClick}>
      <span className="choice__marker" aria-hidden="true">{selected ? "✓" : ""}</span>
      <span><strong>{title}</strong>{note ? <small>{note}</small> : null}</span>
    </button>
  );
}

function SectionHeading({ kicker, title, copy }: { kicker: string; title: string; copy: string }) {
  return <div className="section-heading"><p className="kicker">{kicker}</p><h1>{title}</h1><p className="lede">{copy}</p></div>;
}

function MiniCompass() {
  return <span className="mini-compass" aria-hidden="true"><span /></span>;
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
  const alternatives = Object.values(branches).filter((branch) => branch.id !== recommendedBranch.id).slice(0, 2);
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
    setExperienceRole(""); setExperiencePeople(""); setExperienceLesson(""); setCohortMode(null); setCommitment(null); setReminder("In 3 days");
  };

  const next = () => { setStep((current) => Math.min(10, current + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const back = () => { setStep((current) => Math.max(0, current - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <main className="site-shell">
      <div className="ambient ambient--one" aria-hidden="true" /><div className="ambient ambient--two" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Navigate Pathways home"><MiniCompass /><span><strong>Navigate</strong><small>Pathways</small></span></a>
        <span className="concept-label">Concept prototype</span>
      </header>
      {step < 10 ? <div className="progress-wrap" aria-label={`Journey progress: ${progress}%`}><div className="progress-meta"><span>Your first map</span><span>{progress}%</span></div><div className="progress-track"><span style={{ width: `${Math.max(4, progress)}%` }} /></div></div> : null}

      <div className="experience" id="top">
        {step === 0 ? <section className="screen welcome-screen" aria-labelledby="welcome-title">
          <div className="hero-mark" aria-hidden="true"><span className="hero-mark__path" /><span className="hero-mark__point hero-mark__point--one" /><span className="hero-mark__point hero-mark__point--two" /><span className="hero-mark__point hero-mark__point--three" /></div>
          <p className="kicker">Your path is already in motion</p><h1 id="welcome-title">You have already started your path to medicine.</h1>
          <p className="lede">Let’s make what you’ve learned, contributed, and overcome visible—then choose one useful next move.</p>
          <div className="prompt-block"><h2>Which sounds most like you today?</h2><div className="choice-stack">{focusOptions.map((option) => <ChoiceButton key={option.value} selected={focus === option.value} title={option.title} note={option.note} onClick={() => setFocus(option.value)} />)}</div></div>
          <button className="primary-button" type="button" disabled={!focus} onClick={next}>Begin my map <span aria-hidden="true">→</span></button><p className="microcopy">No score. No ranking. About 6 minutes.</p>
        </section> : null}

        {step === 1 ? <section className="screen" aria-labelledby="trust-title">
          <SectionHeading kicker="Before we map anything" title="This space is for preparation—not prediction." copy="You decide what to capture and what to share. The goal is to help you notice evidence of growth, not judge whether you belong." />
          <div className="trust-grid">
            <article className="trust-card"><span className="trust-icon" aria-hidden="true">01</span><h2 id="trust-title">Private by default</h2><p>Your reflections stay yours unless you deliberately choose to share something.</p></article>
            <article className="trust-card"><span className="trust-icon" aria-hidden="true">02</span><h2>Preparation, not prediction</h2><p>This tool coaches your process. It does not estimate or promise an admissions outcome.</p></article>
            <article className="trust-card trust-card--warm"><span className="trust-icon" aria-hidden="true">03</span><h2>Protect people</h2><p>Never enter patient names or identifying details. Use a fictionalized example in this prototype.</p></article>
          </div><div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" onClick={next}>I understand <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 2 ? <section className="screen" aria-labelledby="stage-title">
          <SectionHeading kicker="A quick landscape · 1 of 3" title="Where are you standing right now?" copy="There is no ‘behind’ here. This helps the experience start from your real context." />
          <div className="prompt-block"><h2 id="stage-title">Current stage</h2><div className="compact-grid">{(["junior", "senior", "gap", "unsure"] as Standing[]).map((value) => <ChoiceButton key={value} selected={standing === value} title={({ junior: "Junior", senior: "Senior", gap: "Gap or bridge year", unsure: "I’m not sure" } as Record<Standing, string>)[value]} onClick={() => setStanding(value)} />)}</div></div>
          <div className="prompt-block"><h2>When might you apply?</h2><div className="compact-grid">{(["this-year", "next-year", "later", "unsure"] as Cycle[]).map((value) => <ChoiceButton key={value} selected={cycle === value} title={({ "this-year": "This cycle", "next-year": "Next cycle", later: "Later", unsure: "I’m not sure" } as Record<Cycle, string>)[value]} onClick={() => setCycle(value)} />)}</div></div>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!standing || !cycle} onClick={next}>Continue <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 3 ? <section className="screen" aria-labelledby="evidence-title">
          <SectionHeading kicker="A quick landscape · 2 of 3" title="What evidence do you already carry?" copy="Courses matter. So do service, work, caregiving, research, leadership, and the moments that changed your perspective." />
          <div className="prompt-block"><h2 id="evidence-title">My experience records are…</h2><div className="compact-grid compact-grid--three">{(["current", "scattered", "memory"] as Records[]).map((value) => <ChoiceButton key={value} selected={records === value} title={({ current: "Mostly current", scattered: "Scattered", memory: "Mostly in my memory" } as Record<Records, string>)[value]} onClick={() => setRecords(value)} />)}</div></div>
          <div className="prompt-block"><h2>What have you explored?</h2><p className="question-note">Choose all that apply. Informal and paid roles count.</p><div className="tag-grid">{experienceOptions.map((value) => <button className={`tag-choice ${experiences.includes(value) ? "tag-choice--selected" : ""}`} type="button" aria-pressed={experiences.includes(value)} key={value} onClick={() => toggleExperience(value)}>{value}</button>)}</div></div>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!records || experiences.length === 0} onClick={next}>Continue <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 4 ? <section className="screen" aria-labelledby="rhythm-title">
          <SectionHeading kicker="A quick landscape · 3 of 3" title="What pace and kind of support fit you?" copy="A strong plan fits your actual life. You can change any of these later." />
          <div className="prompt-block"><h2 id="rhythm-title">My bandwidth feels…</h2><div className="compact-grid compact-grid--three">{(["steady", "tight", "overloaded"] as Bandwidth[]).map((value) => <ChoiceButton key={value} selected={bandwidth === value} title={({ steady: "Steady", tight: "Tight", overloaded: "Overloaded" } as Record<Bandwidth, string>)[value]} onClick={() => setBandwidth(value)} />)}</div></div>
          <div className="prompt-block"><h2>In a new group, I’d rather start by…</h2><div className="compact-grid">{(["observe", "react", "respond", "connect"] as Participation[]).map((value) => <ChoiceButton key={value} selected={participation === value} title={({ observe: "Observing", react: "Reacting", respond: "Using a prompt", connect: "Connecting 1:1" } as Record<Participation, string>)[value]} onClick={() => setParticipation(value)} />)}</div></div>
          <div className="prompt-block"><h2>My support system is…</h2><div className="compact-grid compact-grid--three">{(["mapped", "some", "not-sure"] as Support[]).map((value) => <ChoiceButton key={value} selected={support === value} title={({ mapped: "Clear to me", some: "Partly there", "not-sure": "Hard to name" } as Record<Support, string>)[value]} onClick={() => setSupport(value)} />)}</div></div>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!bandwidth || !participation || !support} onClick={next}>Build my map <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 5 ? <section className="screen map-screen" aria-labelledby="map-title">
          <SectionHeading kicker="Your first map" title="You are not starting from zero." copy="Your route begins with what you already carry—and one next move that makes it more useful." />
          <div className="strength-map">
            <article><span className="map-number">01</span><p>What you already carry</p><h2 id="map-title">{experiences.includes("None yet") ? "Curiosity, course experience, and a place to begin" : `${experiences.slice(0, 3).join(", ")}${experiences.length > 3 ? ` +${experiences.length - 3}` : ""}`}</h2></article><span className="map-connector" aria-hidden="true">↓</span>
            <article><span className="map-number">02</span><p>What this can become</p><h2>{recommendedBranch.outcome}</h2></article><span className="map-connector" aria-hidden="true">↓</span>
            <article className="strength-map__next"><span className="map-number">03</span><p>One useful next move</p><h2>{recommendedBranch.nextMove}</h2></article>
          </div>
          <div className="route-section"><p className="kicker">Choose your door</p>
            <article className={`route-card route-card--featured ${activeBranch.id === recommendedBranch.id ? "route-card--selected" : ""}`}>
              <div className="route-card__top"><span>{recommendedBranch.eyebrow}</span>{activeBranch.id === recommendedBranch.id ? <span className="selected-label">Selected</span> : null}</div>
              <h2>{recommendedBranch.title}</h2><p>{recommendedBranch.nextMove}</p><details><summary>Why we suggested this</summary><p>{recommendedBranch.reason}</p></details>
              <button type="button" onClick={() => setSelectedBranch(recommendedBranch.id)}>Choose this route</button>
            </article>
            <div className="alternative-routes">{alternatives.map((branch) => <button type="button" key={branch.id} className={`route-card route-card--compact ${activeBranch.id === branch.id ? "route-card--selected" : ""}`} onClick={() => setSelectedBranch(branch.id)}><span>Another valid start</span><strong>{branch.title}</strong><small>{branch.nextMove}</small></button>)}</div>
          </div>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" onClick={next}>Open {activeBranch.title} <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 6 ? <section className="screen" aria-labelledby="quest-title">
          <SectionHeading kicker={`Five-minute quest · ${activeBranch.title}`} title="Recover one experience before the details fade." copy="Use a fictionalized example for this prototype. Never include patient names or identifying details." />
          <div className="quest-banner"><span aria-hidden="true">5:00</span><p><strong>Your goal:</strong> create something useful now—not something perfectly written.</p><button type="button" onClick={loadExample}>Load a fictional example</button></div>
          <form className="artifact-form" onSubmit={(event) => event.preventDefault()}>
            <label><span><b>1</b> What was the experience?</span><input id="quest-title" value={experienceTitle} onChange={(event) => setExperienceTitle(event.target.value)} placeholder="Role or experience name" /></label>
            <label><span><b>2</b> When—and about how much?</span><input value={experienceWhen} onChange={(event) => setExperienceWhen(event.target.value)} placeholder="Semester, dates, or estimated hours" /></label>
            <label><span><b>3</b> What did you actually do?</span><textarea value={experienceRole} onChange={(event) => setExperienceRole(event.target.value)} placeholder="Use specific verbs. What was your part?" /></label>
            <label><span><b>4</b> Who was involved or affected?</span><textarea value={experiencePeople} onChange={(event) => setExperiencePeople(event.target.value)} placeholder="Describe roles or groups—never names." /></label>
            <label><span><b>5</b> What stayed with you?</span><textarea value={experienceLesson} onChange={(event) => setExperienceLesson(event.target.value)} placeholder="A surprise, tension, question, or change in how you think." /></label>
          </form>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!artifactComplete} onClick={next}>See what I built <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 7 ? <section className="screen reveal-screen" aria-labelledby="reveal-title">
          <div className="reveal-badge" aria-hidden="true">✓</div><SectionHeading kicker="Artifact created" title="That was more than an hour count." copy="You just preserved three things your future application—and your future self—can use." />
          <div className="artifact-value-grid">
            <article><span>01</span><h2 id="reveal-title">An accurate activity record</h2><p>{experienceTitle} · {experienceWhen}</p></article>
            <article><span>02</span><h2>Evidence of learning</h2><p>{experienceLesson}</p></article>
            <article><span>03</span><h2>A story seed for later</h2><p>{experienceRole} {experiencePeople}</p></article>
          </div>
          <div className="depth-contrast"><div><p className="contrast-label">Hours alone</p><blockquote>“Volunteered 42 hours at a food pantry.”</blockquote></div><div className="depth-contrast__rich"><p className="contrast-label">Evidence-rich</p><blockquote>“I noticed a barrier in the check-in process, asked what would help, and learned not to assume I knew the answer.”</blockquote></div></div>
          <p className="insight-callout"><strong>The through line:</strong> accurate record → reflection → evidence → clearer writing later.</p>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Edit artifact</button><button className="primary-button" type="button" onClick={next}>Meet the cohort <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 8 ? <section className="screen" aria-labelledby="cohort-title">
          <SectionHeading kicker="Cohort arrival" title="Belonging has more than one volume." copy="You can learn with classmates without being pushed into public performance. Choose how you want to arrive today." />
          <article className="cohort-prompt"><div className="cohort-prompt__meta"><span>Today’s cohort prompt</span><span>18 classmates here</span></div><h2 id="cohort-title">What is one small way a classmate could support your next step?</h2><div className="sample-reply"><span className="avatar" aria-hidden="true">M</span><p><strong>Maya · Senior</strong>I’d appreciate an accountability check after I contact my research mentor.</p></div></article>
          <div className="choice-stack cohort-choices">
            <ChoiceButton selected={cohortMode === "observe"} title="Observe quietly" note="Read the exchange and save one useful idea. This counts as participation." onClick={() => setCohortMode("observe")} />
            <ChoiceButton selected={cohortMode === "react"} title="React to a classmate" note="Acknowledge something useful without composing a post." onClick={() => setCohortMode("react")} />
            <ChoiceButton selected={cohortMode === "prompt"} title="Use a sentence starter" note="‘One small thing that would help me is…’" onClick={() => setCohortMode("prompt")} />
            <ChoiceButton selected={cohortMode === "connect"} title="Offer or request a 1:1 connection" note="Choose a specific topic and keep the invitation bounded." onClick={() => setCohortMode("connect")} />
          </div><p className="quiet-assurance">Quiet participation is real participation. You can change modes any time.</p>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!cohortMode} onClick={next}>Choose my next move <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 9 ? <section className="screen" aria-labelledby="next-title">
          <SectionHeading kicker="Finish with one commitment" title="Make the next step small enough to keep." copy="Medical learning asks you to adapt, reflect, and lean on others. Practice that rhythm before the stakes rise." />
          <div className="commitment-grid" id="next-title">{commitments.map(([title, note]) => <ChoiceButton key={title} selected={commitment === title} title={title} note={note} onClick={() => setCommitment(title)} />)}</div>
          <div className="reminder-card"><div><p className="kicker">Gentle follow-through</p><h2>When should Navigate bring this back?</h2></div><select value={reminder} onChange={(event) => setReminder(event.target.value)} aria-label="Reminder timing"><option>Tomorrow</option><option>In 3 days</option><option>In one week</option><option>No reminder</option></select></div>
          <div className="action-row"><button className="text-button" type="button" onClick={back}>Back</button><button className="primary-button" type="button" disabled={!commitment} onClick={next}>Save my first map <span aria-hidden="true">→</span></button></div>
        </section> : null}

        {step === 10 ? <section className="dashboard" aria-labelledby="dashboard-title">
          <div className="dashboard-hero"><div><p className="kicker">Your path · Today</p><h1 id="dashboard-title">You made your experience usable.</h1><p>Not because a meter filled up—because you turned experience into evidence and chose what comes next.</p></div><div className="completion-ring" aria-label="First map complete"><span>1</span><small>map built</small></div></div>
          <div className="dashboard-grid">
            <article className="dash-card dash-card--artifact"><p className="card-label">Saved artifact</p><h2>{experienceTitle}</h2><p>{experienceLesson}</p><span className="status-line"><b aria-hidden="true">✓</b> Reflection attached</span></article>
            <article className="dash-card"><p className="card-label">Active route</p><h2>{activeBranch.title}</h2><p>{activeBranch.nextMove}</p></article>
            <article className="dash-card"><p className="card-label">Cohort mode</p><h2>{({ observe: "Observing", react: "Reacting", prompt: "Prompted response", connect: "1:1 connection" } as Record<string, string>)[cohortMode ?? "observe"]}</h2><p>Your participation setting can change whenever your comfort or context changes.</p></article>
            <article className="dash-card dash-card--next"><p className="card-label">Your next move</p><h2>{commitment}</h2><p>{reminder === "No reminder" ? "No reminder set." : `We’ll bring this back ${reminder.toLowerCase()}.`}</p><button type="button">Open next move <span aria-hidden="true">→</span></button></article>
          </div>
          <div className="values-line"><span>Reflect with honesty</span><span>Act with compassion</span><span>Grow with others</span></div><button className="reset-button" type="button" onClick={reset}>Restart the prototype</button><p className="prototype-note">Navigate Pathways is a concept prototype. It is not an admissions portal or admissions decision tool.</p>
        </section> : null}
      </div>
      <footer className="site-footer"><p>Designed for the journey before application.</p><p>Concept prototype · Not an admissions decision tool</p></footer>
    </main>
  );
}
