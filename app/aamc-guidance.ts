export const aamcGuide = {
  cycle: "2027",
  title: "2027 AMCAS Applicant Guide",
  sourceLabel: "AAMC",
  preparationNotice: "Preparation reference only. Confirm the current AMCAS guide before submitting.",
} as const;

export const aamcLimits = {
  experienceEntries: 15,
  recurringDateRanges: 4,
  mostMeaningfulEntries: 3,
  experienceDescriptionCharacters: 700,
  mostMeaningfulCharacters: 1325,
} as const;

export const aamcCourseClassifications = [
  "Biology (BIOL)",
  "Chemistry (CHEM)",
  "Physics (PHYS)",
  "Mathematics (MATH)",
  "Behavioral and Social Sciences (BESS)",
  "Business (BUSI)",
  "Communications (COMM)",
  "Computer Science and Technology (COMP)",
  "Education (EDUC)",
  "Engineering (ENGI)",
  "English Language and Literature (ENGL)",
  "Fine Arts (ARTS)",
  "Foreign Languages, Linguistics, and Literature (FLAN)",
  "Government, Political Science, and Law (GOVT)",
  "Health Sciences (HEAL)",
  "History (HIST)",
  "Natural and Physical Sciences (NPSC)",
  "Other (OTHR)",
  "Philosophy and Religion (PHIL)",
  "Special Studies (SSTU)",
] as const;

export const aamcAcademicStatuses = [
  ["HS", "High school"],
  ["FR", "Freshman"],
  ["SO", "Sophomore"],
  ["JR", "Junior"],
  ["SR", "Senior"],
  ["PB", "Postbaccalaureate undergraduate"],
  ["GR", "Graduate"],
] as const;

export const aamcSpecialCourseTypes = [
  "Advanced Placement (AP)",
  "Audit (AU)",
  "CLEP (CL)",
  "Current/Future (CC)",
  "Deferred Grade (DG)",
  "Exempt (EX)",
  "Honors (H)",
  "Incomplete (I)",
  "International Baccalaureate (IB)",
  "Military Credit (MC)",
  "No Record (NR)",
  "Pass/Fail (PF)",
  "Repeat (R)",
  "Withdrawal (W)",
] as const;

export const pathwayExperienceTypes = [
  "Community service or volunteer",
  "Clinical exposure or employment",
  "Research or lab",
  "Paid employment",
  "Leadership",
  "Teaching or tutoring",
  "Campus or community organization",
  "Physician shadowing",
  "Community health advocacy",
  "Caregiving or family responsibility",
  "Honors, publications, or presentations",
  "Other significant experience",
] as const;

export const aamcCourseworkChecks = [
  "Use a personal copy of every official transcript.",
  "Record every course attempt, including repeats, withdrawals, incompletes, and failures.",
  "Enter the course at the institution where it was originally attempted.",
  "Copy the course number, title, credits, and grade exactly as shown.",
  "Classify the course by its primary content, not the department name.",
] as const;

export const aamcExperienceChecks = [
  "Keep completed and anticipated hours separate.",
  "Use up to four date ranges when an experience recurs.",
  "Keep the description useful in plain text.",
  "Select up to three Most Meaningful experiences later in application preparation.",
] as const;
