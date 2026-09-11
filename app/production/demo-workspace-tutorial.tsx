"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SyntheticPersonaKey } from "./synthetic-preview";

export type DemoTutorialWorkspace = "compass" | "impact" | "pathway";

type TutorialStep = {
  title: string;
  body: string;
  selector: string;
};

const commonSteps: TutorialStep[] = [
  {
    title: "Choose a demonstration role",
    body: "Use Viewing as to compare the workspace exactly as a student, advisor, administrator, Liaison, or Creator would receive it. Each role gets separately scoped fictional data.",
    selector: "[data-demo-guide='role-switcher']",
  },
  {
    title: "Move between authorized workspaces",
    body: "The workspace control shows only destinations assigned to the selected role. Changing workspaces never adds permissions.",
    selector: "[data-demo-guide='workspace-switcher']",
  },
];

const compassStudentSteps: TutorialStep[] = [
  {
    title: "Start from your Compass home",
    body: "This welcome area summarizes what is coming up without exposing staff records or anyone else’s information.",
    selector: ".compass-student-hero",
  },
  {
    title: "Use the five quick actions",
    body: "Request an appointment, read notifications, open student event pages, display the permanent check-in code, or review appointments and published action plans.",
    selector: ".compass-hero-actions",
  },
  {
    title: "See what is next",
    body: "The at-a-glance cards show the next visit and upcoming event. Appointment status changes, including cancellation, appear here and in My visits.",
    selector: ".compass-at-a-glance",
  },
  {
    title: "Keep support materials together",
    body: "Requirements, the private portfolio, policy information, and tutoring tools stay within the student’s own Compass record.",
    selector: ".compass-secondary-actions",
  },
  {
    title: "Request Impact access",
    body: "Students can declare interest-group affiliations here. Impact access appears only after an authorized administrator or Community Liaison verifies an affiliation.",
    selector: ".hub-affiliations",
  },
];

const advisorSteps = (persona: SyntheticPersonaKey): TutorialStep[] => [
  {
    title: "Your advisor workspace",
    body:
      persona === "career_advisor"
        ? "The Career Advisor view focuses on the four-year career roadmap, career appointments, documents, and follow-through."
        : "The Academic Advisor view focuses on the permanent caseload, drop-ins, milestones, study plans, and shared advising history.",
    selector: ".advisor-workspace-hero",
  },
  {
    title: "Scan today’s workload",
    body: "Appointments, requests awaiting a decision, unread student messages, and open actions are visible at a glance.",
    selector: ".advisor-today-metrics",
  },
  {
    title: "Work the agenda and attention list",
    body: "Open the next session directly or use an explainable attention condition to move to messages, tasks, milestones, or appointment requests. There is no predictive risk score.",
    selector: ".advisor-home-grid",
  },
  {
    title: "Open every advisor tool",
    body:
      persona === "career_advisor"
        ? "These tiles open appointments, calendar, all RUCOM students, records, messages, tasks, events, outreach, the Career roadmap, reports, availability, and templates."
        : "These tiles open appointments, calendar, all RUCOM students, records, messages, tasks, events, outreach, milestones, study plans, reports, availability, and templates.",
    selector: ".advisor-tile-grid",
  },
];

const directorSteps: TutorialStep[] = [
  ...advisorSteps("compass_director"),
  {
    title: "Use administrator controls",
    body: "The Director can work in both advisor services and manage policy configuration, templates, requirements, handoffs, secure imports, and aggregate reporting.",
    selector: ".advisor-director-strip",
  },
];

const impactStudentSteps: TutorialStep[] = [
  {
    title: "Impact is a focused workspace",
    body: "The student lands directly in Impact, without advising tools. Verified affiliations determine where work may be published.",
    selector: ".experience-hero--genesis",
  },
  {
    title: "Build and preserve an initiative",
    body: "The journey captures reflection, sources, community listening, a theory of change, sustainability, and succession in a versioned student-owned portfolio.",
    selector: ".home-action-grid--experience",
  },
  {
    title: "Share without losing authorship",
    body: "Students publish immutable snapshots, connect related work, prepare explicit handoffs, and track approved events on the Impact calendar.",
    selector: ".home-action-grid--experience",
  },
];

const impactStaffSteps: TutorialStep[] = [
  {
    title: "Review and connect Impact work",
    body: "This home surface gathers affiliation verification, mentor review, event decisions, and Community Liaison activity.",
    selector: ".experience-hero--genesis",
  },
  {
    title: "Verify access and coach submitted work",
    body: "Authorized reviewers can approve affiliation requests and comment on preserved submitted versions without rewriting a student’s canonical portfolio.",
    selector: ".home-action-grid--experience",
  },
  {
    title: "Move events through approval",
    body: "Impact events stay separate from general Compass events and reach the shared calendar only after the required mentor and Liaison approvals.",
    selector: ".home-action-grid--experience",
  },
];

const pathwaySteps: TutorialStep[] = [
  {
    title: "Pathway stays permission-separated",
    body: "External and Roseman pre-med participants open only the Pathway experience assigned to their account.",
    selector: ".production-welcome",
  },
  {
    title: "Follow the Pathway work",
    body: "The dashboard brings together upcoming sessions, attendance, portfolio artifacts, surveys, cohort spaces, and advising shares using fictional demonstration records.",
    selector: ".production-grid",
  },
];

export function demoTutorialSteps(workspace: DemoTutorialWorkspace, persona: SyntheticPersonaKey) {
  let workspaceSteps: TutorialStep[];
  if (workspace === "pathway") workspaceSteps = pathwaySteps;
  else if (workspace === "impact") {
    workspaceSteps = persona === "impact_student" ? impactStudentSteps : impactStaffSteps;
  } else if (persona === "compass_student") workspaceSteps = compassStudentSteps;
  else if (persona === "compass_director" || persona === "platform_creator") workspaceSteps = directorSteps;
  else workspaceSteps = advisorSteps(persona);
  return [...commonSteps, ...workspaceSteps];
}

export function DemoWorkspaceTutorial({
  workspace,
  persona,
}: {
  workspace: DemoTutorialWorkspace;
  persona: SyntheticPersonaKey;
}) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const titleId = useId();
  const bodyId = useId();
  const launchButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const steps = demoTutorialSteps(workspace, persona);
  const step = steps[stepIndex] || steps[0];

  const close = () => {
    setOpen(false);
    window.setTimeout(() => launchButton.current?.focus(), 0);
  };

  const start = () => {
    setStepIndex(0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const target = document.querySelector<HTMLElement>(step.selector);
    target?.setAttribute("data-demo-tutorial-highlight", "true");
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
    nextButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight")
        setStepIndex((current) => Math.min(steps.length - 1, current + 1));
      if (event.key === "ArrowLeft")
        setStepIndex((current) => Math.max(0, current - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      target?.removeAttribute("data-demo-tutorial-highlight");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, step, steps.length]);

  return (
    <>
      <button
        ref={launchButton}
        className="demo-tutorial-button"
        type="button"
        onClick={start}
      >
        <span aria-hidden="true">?</span> Tutorial
      </button>
      {open ? (
        <div className="demo-tutorial-layer">
          <button
            className="demo-tutorial-scrim"
            type="button"
            aria-label="Close tutorial"
            onClick={close}
          />
          <section
            className="demo-tutorial-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
          >
            <div className="demo-tutorial-card__heading">
              <span>
                Step {stepIndex + 1} of {steps.length}
              </span>
              <button type="button" onClick={close} aria-label="Close tutorial">
                ×
              </button>
            </div>
            <div className="demo-tutorial-progress" aria-hidden="true">
              <i style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
            </div>
            <h2 id={titleId}>{step.title}</h2>
            <p id={bodyId}>{step.body}</p>
            <div className="demo-tutorial-actions">
              <button
                className="text-button"
                type="button"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              >
                Back
              </button>
              {stepIndex < steps.length - 1 ? (
                <button
                  ref={nextButton}
                  className="primary-button"
                  type="button"
                  onClick={() => setStepIndex((current) => current + 1)}
                >
                  Next
                </button>
              ) : (
                <button
                  ref={nextButton}
                  className="primary-button"
                  type="button"
                  onClick={close}
                >
                  Finish
                </button>
              )}
            </div>
            <small>Use the arrow keys to move between steps. Press Escape to close.</small>
          </section>
        </div>
      ) : null}
    </>
  );
}
