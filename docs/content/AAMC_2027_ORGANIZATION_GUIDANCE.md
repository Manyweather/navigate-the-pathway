# AAMC 2027 Organization Guidance

This note maps selected public guidance from the **2027 AMCAS Applicant Guide** into Navigate the Pathway. It is a content reference for the prototype, not a substitute for the current AMCAS instructions.

## Product posture

Navigate should steer students toward accurate application preparation without making the application form the starting point for every interaction.

- A student can save a course or experience from memory with only a name and one useful note.
- Transcript-aligned course details remain optional until the student has a transcript available.
- Experience dates, completed hours, anticipated hours, verifier information, and writing limits are available as a deeper preparation layer.
- The interface explains why a detail will help later and lets the student return to it.
- The prototype never claims to submit, verify, or transfer information to AMCAS.

## Coursework direction

The guide's Coursework section supports these organization choices:

1. Encourage students to compare records with a personal copy of each official transcript when available.
2. Keep every course attempt, including repeats, withdrawals, incompletes, failures, and coursework affected by institutional forgiveness policies.
3. Associate a course with the institution where it was originally attempted, even when credit transferred elsewhere.
4. Preserve transcript-facing fields for institution, academic year and term, year in school, course number, course title, credits, grade, lab designation, and special course type.
5. Treat course classification as a primary-content decision rather than a department-name decision.
6. Allow a working note to be saved before any transcript-facing field is complete.

Relevant guide sections: Coursework and Coursework Details, printed pages 27-38.

## Experience direction

The guide's Work/Activities section supports these organization choices:

1. Maintain a longitudinal experience library, then help a student choose no more than 15 entries for a particular AMCAS application.
2. Preserve up to four date ranges for a recurring experience.
3. Separate completed dates and hours from anticipated dates and hours.
4. Store experience name, planning category, organization, role, location, and a potential verifier.
5. Keep descriptions useful in plain text and provide a 700-character working boundary.
6. Let students flag up to three possible Most Meaningful experiences and develop an additional 1,325-character working note.
7. Emphasize accuracy and reflection. Hours are not treated as a score or a measure of student worth.

Relevant guide sections: Work/Activities and Most Meaningful Experiences Summary, printed pages 49-50.

## Essay direction

The guide's Essays and Certification Statements sections support these choices:

1. Use four student-facing lenses to collect essay ingredients: motivation for medicine, formative evidence, personal perspective, and future direction.
2. Keep the Personal Comments working draft in plain text with a 5,300-character boundary.
3. Encourage the student to add meaning instead of repeating information already documented elsewhere.
4. Make hardship and academic-context prompts optional. A student never has to disclose adversity to complete the pathway.
5. Reinforce that the final essay must accurately reflect the student's own work and experiences. Mentors, peers, advisors, and AI tools may support brainstorming, proofreading, or editing, but should not replace the student's authorship.
6. Remind students that the Personal Comments Essay goes to every medical school selected in the application and cannot be changed after submission.
7. Keep combined MD-PhD guidance in a secondary layer: 3,000 characters for the MD-PhD essay and 10,000 for the Significant Research Experience essay in this cycle's guide.

Relevant guide sections: Certification Statements, Other Impactful Experiences, Essays, and Essays for Combined MD-PhD Programs, printed pages 6, 26, and 59-60.

## Cycle maintenance

The implementation keeps cycle-specific limits in `app/aamc-guidance.ts`. Before each application cycle, a content owner should compare that configuration with the newest applicant guide and update the source note, field labels, limits, and tests.

Current reference: **2027 AMCAS Applicant Guide**, AAMC, copyright 2026.
