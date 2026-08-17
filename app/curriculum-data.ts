export type CurriculumProgramId = "biology-bs" | "chemistry-bs" | "chemistry-biochemistry-bs";
export type RequirementType = "named_course" | "elective" | "restricted_elective" | "general_education_category" | "free_elective" | "other_published_requirement";
export type EvidenceStatus = "published_in_source" | "sequence_based_observation" | "needs_prerequisite_confirmation" | "needs_offering_confirmation" | "institutionally_confirmed";

export type CurriculumRequirement = {
  id: string;
  rawCourseCode: string;
  normalizedCourseCode: string;
  publishedTitle: string;
  publishedCreditText: string;
  creditHours: number | null;
  requirementType: RequirementType;
  generalEducation: boolean;
  sequenceOrder: number;
  sourcePage: number;
  annualOfferingStatus: "unconfirmed";
};

export type CurriculumTerm = {
  id: string;
  classYear: "Freshman" | "Sophomore" | "Junior" | "Senior";
  term: "First Semester" | "Second Semester";
  sequenceOrder: number;
  publishedTermTotal: number;
  requirements: CurriculumRequirement[];
};

export type CurriculumProgram = {
  id: CurriculumProgramId;
  institution: "Bethune-Cookman University";
  name: string;
  catalogYear: "2025-2026";
  publishedTotalCreditHours: number;
  sourceFilename: string;
  terms: CurriculumTerm[];
  active: true;
};

export type CurriculumDataNote = {
  id: string;
  programId: CurriculumProgramId;
  requirementId: string | null;
  noteType: "duplicate" | "missing_credit" | "total_reconciliation" | "source_review";
  description: string;
  reviewStatus: "needs_review" | "confirmed" | "rejected";
  studentVisible: boolean;
  sourcePage: number;
};

export type CurriculumAnnotation = {
  id: string;
  programId: CurriculumProgramId;
  requirementId: string | null;
  annotationType: "planning_attention" | "program_requirement";
  title: string;
  description: string;
  evidenceStatus: EvidenceStatus;
  studentVisible: boolean;
  advisorVisible: boolean;
  reviewStatus: "approved" | "needs_review";
};

export const curriculumDisclaimer = "This is a planning reference based on the 2025-2026 published curriculum. It is not an official transcript, degree audit, or pre-med requirement list. Requirements may vary by catalog year and student circumstances. Confirm decisions with an academic or pre-health advisor.";

export function normalizeCourseCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function req(program: CurriculumProgramId, term: number, order: number, code: string, title: string, creditText: string, creditHours: number | null, sourcePage: number, requirementType: RequirementType = "named_course", generalEducation = false): CurriculumRequirement {
  return {
    id: `${program}-t${term}-r${order}`,
    rawCourseCode: code,
    normalizedCourseCode: code ? normalizeCourseCode(code) : "",
    publishedTitle: title,
    publishedCreditText: creditText,
    creditHours,
    requirementType,
    generalEducation,
    sequenceOrder: order,
    sourcePage,
    annualOfferingStatus: "unconfirmed",
  };
}

function term(program: CurriculumProgramId, sequenceOrder: number, classYear: CurriculumTerm["classYear"], semester: CurriculumTerm["term"], publishedTermTotal: number, requirements: CurriculumRequirement[]): CurriculumTerm {
  return { id: `${program}-term-${sequenceOrder}`, classYear, term: semester, sequenceOrder, publishedTermTotal, requirements };
}

const biology: CurriculumProgram = {
  id: "biology-bs",
  institution: "Bethune-Cookman University",
  name: "Biology, B.S.",
  catalogYear: "2025-2026",
  publishedTotalCreditHours: 123,
  sourceFilename: "Biology, B.S. - Bethune-Cookman University - Modern Campus Catalog.pdf",
  active: true,
  terms: [
    term("biology-bs", 1, "Freshman", "First Semester", 17, [
      req("biology-bs", 1, 1, "BI 141", "Principles of Biology I (For Science Majors)", "3 Credit Hours", 3, 1, "named_course", true),
      req("biology-bs", 1, 2, "BIL 141", "Principles of Biology I Lab", "1 Credit Hour", 1, 1, "named_course", true),
      req("biology-bs", 1, 3, "EN 131", "College English I", "3 Credit Hours", 3, 1, "named_course", true),
      req("biology-bs", 1, 4, "", "Historical and Cultural Perspectives", "GE 3 Credit Hours", 3, 1, "general_education_category", true),
      req("biology-bs", 1, 5, "MAT 135", "Pre-Calculus", "3 Credit Hours", 3, 1, "named_course", true),
      req("biology-bs", 1, 6, "SEM 111", "Fundamentals of Science I", "1 Credit Hour", 1, 1),
      req("biology-bs", 1, 7, "", "Social Foundations and Civic Engagement", "GE 3 Credits", 3, 1, "general_education_category", true),
    ]),
    term("biology-bs", 2, "Freshman", "Second Semester", 17, [
      req("biology-bs", 2, 1, "BI 142", "Principles of Biology II (For Science Majors)", "4 Credit Hours", 4, 1),
      req("biology-bs", 2, 2, "CH 141", "General Chemistry I", "3 Credit Hours", 3, 1),
      req("biology-bs", 2, 3, "CHL 141", "General Chemistry I Laboratory", "1 Credit Hour", 1, 1),
      req("biology-bs", 2, 4, "", "Faith and Wellness Awareness", "GE 3 Credits", 3, 1, "general_education_category", true),
      req("biology-bs", 2, 5, "EN 132", "College English II", "3 Credit Hours", 3, 1, "named_course", true),
      req("biology-bs", 2, 6, "MAT 136", "Analytical Trigonometry", "3 Credit Hours", 3, 1, "named_course", true),
    ]),
    term("biology-bs", 3, "Sophomore", "First Semester", 15, [
      req("biology-bs", 3, 1, "BI 240", "Principles of Biology III", "4 Credit Hours", 4, 1),
      req("biology-bs", 3, 2, "CH 142", "General Chemistry II", "3 Credit Hours", 3, 1),
      req("biology-bs", 3, 3, "CHL 142", "General Chemistry II Laboratory", "1 Credit Hour", 1, 1),
      req("biology-bs", 3, 4, "MAT 241", "Calculus I with Analytic Geometry", "4 Credit Hours", 4, 1),
      req("biology-bs", 3, 5, "SC 230", "Introduction to Effective Oral Communication", "3 Credit Hours", 3, 1, "named_course", true),
    ]),
    term("biology-bs", 4, "Sophomore", "Second Semester", 16, [
      req("biology-bs", 4, 1, "BI 213", "Research Methods in Biology", "4 Credit Hours", 4, 1),
      req("biology-bs", 4, 2, "", "BI 200 Level Restricted Electives***", "Credit value not displayed", null, 1, "restricted_elective"),
      req("biology-bs", 4, 3, "CH 241", "Organic Chemistry I and Lab", "4 Credit Hours", 4, 1),
      req("biology-bs", 4, 4, "MAT 260", "Practical Statistics", "3 Credit Hours", 3, 1),
      req("biology-bs", 4, 5, "SEM 222", "Fundamentals of Science II", "1 Credit Hour", 1, 1),
      req("biology-bs", 4, 6, "BI 255", "Introduction to Biostatistics and Data Analysis", "3 Credit Hours", 3, 1),
    ]),
    term("biology-bs", 5, "Junior", "First Semester", 14, [
      req("biology-bs", 5, 1, "", "BI 300 Level Elective", "3 Credit Hour", 3, 2, "elective"),
      req("biology-bs", 5, 2, "CH 242", "Organic Chemistry II and Lab", "4 Credit Hours", 4, 2),
      req("biology-bs", 5, 3, "PH 241", "General Physics I", "4 Credit Hours", 4, 2),
      req("biology-bs", 5, 4, "PHL 241", "General Physics I Laboratory", "0 Credit Hours", 0, 2),
      req("biology-bs", 5, 5, "", "MAT 260 - Practical Statistics OR ES 215 Environmetrics", "3 Credits", 3, 2, "other_published_requirement"),
    ]),
    term("biology-bs", 6, "Junior", "Second Semester", 15, [
      req("biology-bs", 6, 1, "", "BI 300 Level Elective", "3 Credit Hours", 3, 2, "elective"),
      req("biology-bs", 6, 2, "BI 333", "Seminar In Biology", "1 Credit Hour", 1, 2),
      req("biology-bs", 6, 3, "", "Social Foundations and Civic Engagement", "GE 3 Credits", 3, 2, "general_education_category", true),
      req("biology-bs", 6, 4, "CH 445", "Biochemistry I", "4 Credit Hours", 4, 2),
      req("biology-bs", 6, 5, "PH 242", "General Physics II", "4 Credit Hours", 4, 2),
      req("biology-bs", 6, 6, "PHL 242", "General Physics II Laboratory", "0 Credit Hours", 0, 2),
    ]),
    term("biology-bs", 7, "Senior", "First Semester", 16, [
      req("biology-bs", 7, 1, "", "Historical and Cultural Perspectives", "GE 3 Credits", 3, 2, "general_education_category", true),
      req("biology-bs", 7, 2, "", "BI 300/400 Elective", "3 Credits", 3, 2, "elective"),
      req("biology-bs", 7, 3, "", "BI 300/400 Elective", "4 Credits", 4, 2, "elective"),
      req("biology-bs", 7, 4, "CS 215", "Fundamentals of Scientific Computing", "3 Credit Hours", 3, 2),
      req("biology-bs", 7, 5, "", "Free Elective", "3 Credits", 3, 2, "free_elective"),
    ]),
    term("biology-bs", 8, "Senior", "Second Semester", 13, [
      req("biology-bs", 8, 1, "", "BI 400 Level Elective", "3 Credit Hours", 3, 2, "elective"),
      req("biology-bs", 8, 2, "", "BI 400 Level Elective", "4 Credit Hours", 4, 2, "elective"),
      req("biology-bs", 8, 3, "BI 499", "Senior Seminar", "3 Credit Hours", 3, 2),
      req("biology-bs", 8, 4, "FI 310", "Personal Finance", "3 Credit Hours", 3, 2),
    ]),
  ],
};

const chemistry: CurriculumProgram = {
  id: "chemistry-bs", institution: "Bethune-Cookman University", name: "Chemistry, B.S.", catalogYear: "2025-2026", publishedTotalCreditHours: 122,
  sourceFilename: "Chemistry, B.S. - Bethune-Cookman University - Modern Campus Catalog.pdf", active: true,
  terms: [
    term("chemistry-bs", 1, "Freshman", "First Semester", 14, [
      req("chemistry-bs", 1, 1, "CH 141", "General Chemistry I", "3 Credit Hours", 3, 1, "named_course", true), req("chemistry-bs", 1, 2, "CHL 141", "General Chemistry I Laboratory", "1 Credit Hour", 1, 1),
      req("chemistry-bs", 1, 3, "", "Faith and Wellness Awareness", "GE 3 Credit Hours", 3, 1, "general_education_category", true), req("chemistry-bs", 1, 4, "EN 131", "College English I", "3 Credit Hours", 3, 1, "named_course", true),
      req("chemistry-bs", 1, 5, "MAT 135", "Pre-Calculus", "3 Credit Hours", 3, 1, "named_course", true), req("chemistry-bs", 1, 6, "SEM 111", "Fundamentals of Science I", "1 Credit Hour", 1, 1),
    ]),
    term("chemistry-bs", 2, "Freshman", "Second Semester", 17, [
      req("chemistry-bs", 2, 1, "BI 141", "Principles of Biology I (For Science Majors)", "3 Credit Hours", 3, 1), req("chemistry-bs", 2, 2, "BIL 141", "Principles of Biology I Lab", "1 Credit Hour", 1, 1),
      req("chemistry-bs", 2, 3, "CH 142", "General Chemistry II", "3 Credit Hours", 3, 1), req("chemistry-bs", 2, 4, "CHL 142", "General Chemistry II Laboratory", "1 Credit Hour", 1, 1),
      req("chemistry-bs", 2, 5, "EN 132", "College English II", "3 Credit Hours", 3, 1, "named_course", true), req("chemistry-bs", 2, 6, "MAT 136", "Analytical Trigonometry", "3 Credit Hours", 3, 1, "named_course", true),
      req("chemistry-bs", 2, 7, "CS 215", "Fundamentals of Scientific Computing", "3 Credit Hours", 3, 1),
    ]),
    term("chemistry-bs", 3, "Sophomore", "First Semester", 15, [
      req("chemistry-bs", 3, 1, "BI 142", "Principles of Biology II (For Science Majors)", "4 Credit Hours", 4, 1), req("chemistry-bs", 3, 2, "CH 241", "Organic Chemistry I and Lab", "4 Credit Hours", 4, 1),
      req("chemistry-bs", 3, 3, "MAT 241", "Calculus I with Analytic Geometry", "4 Credit Hours", 4, 1), req("chemistry-bs", 3, 4, "SC 230", "Introduction to Effective Oral Communication", "3 Credit Hours", 3, 1),
    ]),
    term("chemistry-bs", 4, "Sophomore", "Second Semester", 15, [
      req("chemistry-bs", 4, 1, "CH 242", "Organic Chemistry II and Lab", "4 Credit Hours", 4, 1), req("chemistry-bs", 4, 2, "MAT 242", "Calculus II with Analytic Geometry", "4 Credit Hours", 4, 1),
      req("chemistry-bs", 4, 3, "SEM 222", "Fundamentals of Science II", "1 Credit Hour", 1, 1), req("chemistry-bs", 4, 4, "CH 238", "Principles of Research", "3 Credit Hours", 3, 1),
      req("chemistry-bs", 4, 5, "ES 215", "Environmetrics", "3 Credit Hours", 3, 1),
    ]),
    term("chemistry-bs", 5, "Junior", "First Semester", 15, [
      req("chemistry-bs", 5, 1, "CH 345", "Quantitative Analysis", "4 Credit Hours", 4, 1), req("chemistry-bs", 5, 2, "CH 445", "Biochemistry I", "4 Credit Hours", 4, 1),
      req("chemistry-bs", 5, 3, "PH 251", "College Physics I", "3 Credit Hours", 3, 1), req("chemistry-bs", 5, 4, "PHL 251", "College Physics I Laboratory", "1 Credit Hour", 1, 1),
    ]),
    term("chemistry-bs", 6, "Junior", "Second Semester", 15, [
      req("chemistry-bs", 6, 1, "CH 333", "Seminar in Chemistry", "1 Credit Hour", 1, 1), req("chemistry-bs", 6, 2, "CH 346", "Instrumental Analysis", "4 Credit Hours", 4, 1),
      req("chemistry-bs", 6, 3, "MAT 334", "Differential Equations", "3 Credit Hours", 3, 1), req("chemistry-bs", 6, 4, "PH 252", "College Physics II", "3 Credit Hours", 3, 1),
      req("chemistry-bs", 6, 5, "PHL 252", "College Physics II Laboratory", "1 Credit Hour", 1, 1),
    ]),
    term("chemistry-bs", 7, "Senior", "First Semester", 15, [
      req("chemistry-bs", 7, 1, "", "Social Foundations and Civic Engagement", "GE 3 Credits", 3, 2, "general_education_category", true), req("chemistry-bs", 7, 2, "CS 215", "Fundamentals of Scientific Computing", "3 Credit Hours", 3, 2),
      req("chemistry-bs", 7, 3, "", "CH 300/400 Elective / CSEM 300-400 Elective / BI 2XX Intro to Data Science", "Individual credit value not displayed", null, 2, "other_published_requirement"),
    ]),
    term("chemistry-bs", 8, "Senior", "Second Semester", 15, [
      req("chemistry-bs", 8, 1, "", "Chemistry 400 Elective", "3 Credit Hours", 3, 2, "elective"), req("chemistry-bs", 8, 2, "CH 499", "Senior Seminar", "3 Credit Hours", 3, 2),
      req("chemistry-bs", 8, 3, "FI 310", "Personal Finance", "3 Credit Hours", 3, 2), req("chemistry-bs", 8, 4, "", "Historical and Cultural Perspectives", "GE 3 Credit Hours", 3, 2, "general_education_category", true),
      req("chemistry-bs", 8, 5, "", "Social Foundations and Civic Engagement", "GE 3 Credits", 3, 2, "general_education_category", true),
    ]),
  ],
};

const chemistryBiochemistry: CurriculumProgram = {
  id: "chemistry-biochemistry-bs", institution: "Bethune-Cookman University", name: "Chemistry, Biochemistry, B.S.", catalogYear: "2025-2026", publishedTotalCreditHours: 123,
  sourceFilename: "Chemistry, Biochemistry, B.S. - Bethune-Cookman University - Modern Campus Catalog.pdf", active: true,
  terms: [
    term("chemistry-biochemistry-bs", 1, "Freshman", "First Semester", 15, [
      req("chemistry-biochemistry-bs", 1, 1, "BI 141", "Principles of Biology I (For Science Majors)", "3 Credit Hours", 3, 1), req("chemistry-biochemistry-bs", 1, 2, "BIL 141", "Principles of Biology I Lab", "1 Credit Hour", 1, 1, "named_course", true),
      req("chemistry-biochemistry-bs", 1, 3, "CH 141", "General Chemistry I", "3 Credit Hours", 3, 1, "named_course", true), req("chemistry-biochemistry-bs", 1, 4, "CHL 141", "General Chemistry I Laboratory", "1 Credit Hour", 1, 1, "named_course", true),
      req("chemistry-biochemistry-bs", 1, 5, "EN 131", "College English I", "3 Credit Hours", 3, 1, "named_course", true), req("chemistry-biochemistry-bs", 1, 6, "MAT 135", "Pre-Calculus", "3 Credit Hours", 3, 1, "named_course", true),
      req("chemistry-biochemistry-bs", 1, 7, "SEM 111", "Fundamentals of Science I", "1 Credit Hour", 1, 1),
    ]),
    term("chemistry-biochemistry-bs", 2, "Freshman", "Second Semester", 17, [
      req("chemistry-biochemistry-bs", 2, 1, "BI 142", "Principles of Biology II (For Science Majors)", "4 Credit Hours", 4, 1), req("chemistry-biochemistry-bs", 2, 2, "CH 142", "General Chemistry II", "3 Credit Hours", 3, 1),
      req("chemistry-biochemistry-bs", 2, 3, "CHL 142", "General Chemistry II Laboratory", "1 Credit Hour", 1, 1), req("chemistry-biochemistry-bs", 2, 4, "EN 132", "College English II", "3 Credit Hours", 3, 1, "named_course", true),
      req("chemistry-biochemistry-bs", 2, 5, "", "Historical and Cultural Perspectives", "GE 3 Credits", 3, 1, "general_education_category", true), req("chemistry-biochemistry-bs", 2, 6, "MAT 136", "Analytical Trigonometry", "3 Credit Hours", 3, 1, "named_course", true),
    ]),
    term("chemistry-biochemistry-bs", 3, "Sophomore", "First Semester", 17, [
      req("chemistry-biochemistry-bs", 3, 1, "BI 255", "Introduction to Biostatistics and Data Analysis", "3 Credit Hours", 3, 1), req("chemistry-biochemistry-bs", 3, 2, "CH 241", "Organic Chemistry I and Lab", "4 Credit Hours", 4, 1),
      req("chemistry-biochemistry-bs", 3, 3, "MAT 241", "Calculus I with Analytic Geometry", "4 Credit Hours", 4, 1), req("chemistry-biochemistry-bs", 3, 4, "PHIL 230", "Ethics", "3 Credit Hours", 3, 1),
      req("chemistry-biochemistry-bs", 3, 5, "SC 230", "Introduction to Effective Oral Communication", "3 Credit Hours", 3, 1, "named_course", true),
    ]),
    term("chemistry-biochemistry-bs", 4, "Sophomore", "Second Semester", 17, [
      req("chemistry-biochemistry-bs", 4, 1, "BI 322", "Principles of Modern Microbiology", "4 Credit Hours", 4, 1), req("chemistry-biochemistry-bs", 4, 2, "CH 238", "Principles of Research", "3 Credit Hours", 3, 1),
      req("chemistry-biochemistry-bs", 4, 3, "CH 242", "Organic Chemistry II and Lab", "4 Credit Hours", 4, 1), req("chemistry-biochemistry-bs", 4, 4, "MAT 242", "Calculus II with Analytic Geometry", "4 Credit Hours", 4, 1),
      req("chemistry-biochemistry-bs", 4, 5, "SEM 222", "Fundamentals of Science II", "1 Credit Hour", 1, 1),
    ]),
    term("chemistry-biochemistry-bs", 5, "Junior", "First Semester", 15, [
      req("chemistry-biochemistry-bs", 5, 1, "BI 340", "Molecular Biology", "4 Credit Hours", 4, 1), req("chemistry-biochemistry-bs", 5, 2, "CH 345", "Quantitative Analysis", "4 Credit Hours", 4, 1),
      req("chemistry-biochemistry-bs", 5, 3, "", "Faith and Wellness Awareness", "GE 3 Credits", 3, 1, "general_education_category", true), req("chemistry-biochemistry-bs", 5, 4, "PH 251", "College Physics I", "3 Credit Hours", 3, 1),
      req("chemistry-biochemistry-bs", 5, 5, "PHL 251", "College Physics I Laboratory", "1 Credit Hour", 1, 1),
    ]),
    term("chemistry-biochemistry-bs", 6, "Junior", "Second Semester", 15, [
      req("chemistry-biochemistry-bs", 6, 1, "BI 330", "Bioinformatics", "3 Credit Hours", 3, 1), req("chemistry-biochemistry-bs", 6, 2, "CH 333", "Seminar in Chemistry", "1 Credit Hour", 1, 1),
      req("chemistry-biochemistry-bs", 6, 3, "CH 346", "Instrumental Analysis", "4 Credit Hours", 4, 1), req("chemistry-biochemistry-bs", 6, 4, "", "CSEM 300/400 Elective", "3 Credits", 3, 1, "elective"),
      req("chemistry-biochemistry-bs", 6, 5, "PH 252", "College Physics II", "3 Credit Hours", 3, 2), req("chemistry-biochemistry-bs", 6, 6, "PHL 252", "College Physics II Laboratory", "1 Credit Hour", 1, 2),
    ]),
    term("chemistry-biochemistry-bs", 7, "Senior", "First Semester", 13, [
      req("chemistry-biochemistry-bs", 7, 1, "CH 445", "Biochemistry I", "4 Credit Hours", 4, 2), req("chemistry-biochemistry-bs", 7, 2, "CH 499", "Senior Seminar", "3 Credit Hours", 3, 2),
      req("chemistry-biochemistry-bs", 7, 3, "", "Historical and Cultural Perspectives", "GE 3 Credits", 3, 2, "general_education_category", true), req("chemistry-biochemistry-bs", 7, 4, "", "Social Foundations and Civic Engagement", "GE 3 Credits", 3, 2, "general_education_category", true),
    ]),
    term("chemistry-biochemistry-bs", 8, "Senior", "Second Semester", 14, [
      req("chemistry-biochemistry-bs", 8, 1, "BI 450", "Cell Biology", "4 Credit Hours", 4, 2), req("chemistry-biochemistry-bs", 8, 2, "CH 446", "Biochemistry II", "4 Credit Hours", 4, 2),
      req("chemistry-biochemistry-bs", 8, 3, "", "CSEM 300/400 Elective", "3 Credits", 3, 2, "elective"), req("chemistry-biochemistry-bs", 8, 4, "FI 310", "Personal Finance", "3 Credit Hours", 3, 2),
    ]),
  ],
};

export const curriculumPrograms: CurriculumProgram[] = [biology, chemistry, chemistryBiochemistry];

export const curriculumDataNotes: CurriculumDataNote[] = [
  { id: "chemistry-cs215-repeat", programId: "chemistry-bs", requirementId: null, noteType: "duplicate", description: "CS 215 appears in Freshman Second Semester and Senior First Semester. Preserve both rows until the institution confirms the intended sequence.", reviewStatus: "needs_review", studentVisible: false, sourcePage: 2 },
  { id: "chemistry-senior-credit-gaps", programId: "chemistry-bs", requirementId: "chemistry-bs-t7-r3", noteType: "missing_credit", description: "The senior elective choice row does not display an individual credit value. The value remains null.", reviewStatus: "needs_review", studentVisible: false, sourcePage: 2 },
  { id: "biology-mat260-repeat", programId: "biology-bs", requirementId: null, noteType: "duplicate", description: "MAT 260 appears in Sophomore Second Semester and later within a Junior First Semester MAT 260 or ES 215 option. Preserve both source entries pending review.", reviewStatus: "needs_review", studentVisible: false, sourcePage: 2 },
  { id: "biology-sophomore-total", programId: "biology-bs", requirementId: "biology-bs-t4-r2", noteType: "total_reconciliation", description: "The displayed values do not reconcile to the printed semester total because the restricted elective credit is not displayed. Preserve the printed total and null credit value.", reviewStatus: "needs_review", studentVisible: false, sourcePage: 1 },
  { id: "chemistry-junior-totals", programId: "chemistry-bs", requirementId: null, noteType: "total_reconciliation", description: "Displayed Junior-year course credits do not reconcile to the printed semester totals. Preserve both the printed totals and individual published values.", reviewStatus: "needs_review", studentVisible: false, sourcePage: 1 },
];

function annotation(id: string, programId: CurriculumProgramId, requirementId: string | null, title: string, description: string, evidenceStatus: EvidenceStatus, type: CurriculumAnnotation["annotationType"] = "planning_attention"): CurriculumAnnotation {
  return { id, programId, requirementId, annotationType: type, title, description, evidenceStatus, studentVisible: true, advisorVisible: true, reviewStatus: "approved" };
}

export const curriculumAnnotations: CurriculumAnnotation[] = [
  annotation("bio-sem222", "biology-bs", "biology-bs-t4-r5", "Biology SEM 222 examination", "The Biology source states that students take an examination during SEM 222 covering BI 141, BI 142, and BI 240. Continuation depends on passing or permission from the department chair and/or academic advisor.", "published_in_source", "program_requirement"),
  annotation("bio-organic", "biology-bs", null, "Organic chemistry sequence", "CH 241 and CH 242 appear as a sequence. Their placement is a planning attention point; prerequisite and future offering details still need confirmation.", "sequence_based_observation"),
  annotation("chem-organic", "chemistry-bs", null, "Organic chemistry sequence", "CH 241 and CH 242 appear as a sequence. Their placement is a planning attention point; prerequisite and future offering details still need confirmation.", "sequence_based_observation"),
  annotation("biochem-organic", "chemistry-biochemistry-bs", null, "Organic chemistry sequence", "CH 241 and CH 242 appear as a sequence. Their placement is a planning attention point; prerequisite and future offering details still need confirmation.", "sequence_based_observation"),
  annotation("bio-physics", "biology-bs", null, "Junior-year physics timing", "The published sequence places PH 241 and PH 242 in the Junior year and notes that PH 251 and PH 252 may be substituted. Treat this as a timing conversation, not a confirmed bottleneck.", "published_in_source"),
  annotation("chem-physics", "chemistry-bs", null, "Junior-year physics timing", "The published sequence places PH 251 and PH 252 in the Junior year. Treat this as a timing conversation, not a confirmed bottleneck.", "sequence_based_observation"),
  annotation("biochem-physics", "chemistry-biochemistry-bs", null, "Junior-year physics timing", "The published sequence places PH 251 and PH 252 in the Junior year. Treat this as a timing conversation, not a confirmed bottleneck.", "sequence_based_observation"),
  annotation("bio-biochem", "biology-bs", "biology-bs-t6-r4", "Biochemistry timing", "The published sequence places CH 445 in Junior Second Semester. Consider the timing with an advisor without treating it as an admissions claim.", "sequence_based_observation"),
  annotation("chem-biochem", "chemistry-bs", "chemistry-bs-t5-r2", "Biochemistry timing", "The published sequence places CH 445 in Junior First Semester. Consider the timing with an advisor without treating it as an admissions claim.", "sequence_based_observation"),
  annotation("biochem-biochem", "chemistry-biochemistry-bs", "chemistry-biochemistry-bs-t7-r1", "Biochemistry timing", "The published sequence places CH 445 in Senior First Semester and CH 446 in Senior Second Semester. Consider the timing with an advisor without treating it as an admissions claim.", "sequence_based_observation"),
];

export type CourseScenarioSlot = { id: string; title: string; status: "Draft" | "Approved" };
export const courseScenarioSlots: CourseScenarioSlot[] = ["Organic chemistry planning", "Physics timing", "Biochemistry timing", "Biology SEM 222 preparation", "Course repetition or rescheduling", "Transfer coursework", "Curriculum mismatch", "Selecting academic support"].map((title, index) => ({ id: `scenario-${index + 1}`, title, status: "Draft" }));
export const courseResourceSlots: Array<{ id: string; title: string; url: string; reviewStatus: "Approved" | "Under review" }> = [];
export const approvedCourseScenarios = courseScenarioSlots.filter((item) => item.status === "Approved");
export const approvedCourseResources = courseResourceSlots.filter((item) => item.reviewStatus === "Approved");

export type CourseMatchResult = { status: "exact" | "ambiguous" | "unmatched"; candidateRequirementIds: string[] };

export function matchCourseCode(programId: CurriculumProgramId, rawCode: string): CourseMatchResult {
  const program = curriculumPrograms.find((item) => item.id === programId);
  const normalized = normalizeCourseCode(rawCode);
  if (!program || !normalized) return { status: "unmatched", candidateRequirementIds: [] };
  const candidates = program.terms.flatMap((item) => item.requirements).filter((item) => item.normalizedCourseCode === normalized);
  if (!candidates.length) return { status: "unmatched", candidateRequirementIds: [] };
  return { status: candidates.length === 1 ? "exact" : "ambiguous", candidateRequirementIds: candidates.map((item) => item.id) };
}

export function requirementsThroughTerm(programId: CurriculumProgramId, termId: string) {
  const program = curriculumPrograms.find((item) => item.id === programId);
  if (!program) return [];
  const selected = program.terms.find((item) => item.id === termId);
  if (!selected) return [];
  return program.terms.filter((item) => item.sequenceOrder <= selected.sequenceOrder).flatMap((item) => item.requirements);
}

export function snapshotCompleteness(programId: CurriculumProgramId, termId: string, matchedRequirementIds: string[]) {
  const published = requirementsThroughTerm(programId, termId);
  const matched = new Set(matchedRequirementIds);
  return { reported: published.filter((item) => matched.has(item.id)).length, published: published.length };
}
