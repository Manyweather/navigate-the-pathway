/** Deterministic topic coding. Matches describe documented subjects, never diagnoses. */
export const themeRuleVersion = "compass-themes-v1";
export const themeDefinitions = [
  { key: "study_strategies", label: "Study strategies", pattern: "study strateg(?:y|ies)|study (?:habit|method|routine)s?|active recall|spaced repetition|anki|flashcards?|practice questions?|question banks?|note taking|learning strateg(?:y|ies)|summariz(?:e|ing)|reviewing material" },
  { key: "exam_preparation", label: "Exam preparation", pattern: "exams?|test preparation|test taking|assessment|nbme|cba|remediat(?:ion|e)|board preparation|step [12]" },
  { key: "time_management", label: "Time management", pattern: "time management|study schedul(?:e|ing)|planning time|procrastinat(?:ion|ing)|prioriti[sz](?:e|ing|ation)|time blocking|timers?|workload|keeping (?:up|on top)" },
  { key: "academic_planning", label: "Academic planning", pattern: "academic plan(?:ning)?|course schedul(?:e|ing)|curriculum|graduation|clerkships?|rotation[s]?|academic progress|learning communit(?:y|ies)|cohort|block schedule" },
  { key: "wellbeing", label: "Wellbeing", pattern: "wellbeing|well being|stress|anxiet(?:y|ies)|anxious|sleep|burnout|overwhelmed|self care|mental health|counsel(?:ing|ling)|work life balance|motivation" },
  { key: "study_environment", label: "Study-environment barriers", pattern: "study environment|study space|distraction[s]?|housing|displaced|home repairs|quiet space|food access|food insecurity|transportation|family responsibilities" },
  { key: "tutoring_resources", label: "Tutoring and resources", pattern: "tutor(?:s|ing)?|resource[s]?|referral[s]?|referred|qrs|academic support|learning specialist|office hours" },
  { key: "career_exploration", label: "Career exploration", pattern: "career[s]?|specialt(?:y|ies)|residenc(?:y|ies)|shadow(?:ing)?|obgyn|surgery|pediatrics|internal medicine|family medicine|professional interests" },
  { key: "follow_up", label: "Follow-up", pattern: "follow[ -]?up|check[ -]?in|revisit|next (?:week|month|meeting|session)|meet again|after (?:the )?(?:final )?exam" },
] as const;
export type ThemeKey = typeof themeDefinitions[number]["key"];
export type ThemeMatch = { theme: ThemeKey; ruleId: string; sourceField: string };
export type ThemeAnalysis = { version: string; state: "missing" | "uncategorized" | "categorized"; matches: ThemeMatch[]; followUpDocumented: boolean };

const rules = themeDefinitions.map((definition) => ({ ...definition, regex: new RegExp(`\\b(?:${definition.pattern})\\b`, "gi") }));
const emptyNote = /^(?:n\/?a|none|no|not applicable|[-–—])\.?$/i;

export function codeNarrativeThemes(fields: Record<string, string>): ThemeAnalysis {
  const matches: ThemeMatch[] = [];
  let hasText = false;
  for (const [sourceField, raw] of Object.entries(fields)) {
    const text = raw.trim();
    if (!text || emptyNote.test(text)) continue;
    hasText = true;
    // Negation is clause-local; a later affirmative sentence can still match.
    for (const clause of text.toLowerCase().split(/[.!?;\n]|\bbut\b|\bhowever\b/)) {
      for (const rule of rules) {
        for (const hit of clause.matchAll(new RegExp(rule.regex.source, "gi"))) {
          const prefix = clause.slice(0, hit.index);
          const suffix = clause.slice((hit.index || 0) + hit[0].length);
          if (/\b(?:no|not|never|without|denies|denied|declined|doesn't|does not|didn't|did not)\b(?:\s+[\w'-]+){0,4}\s*$/.test(prefix)
            || /^\s+(?:(?:preparation|planning|support|resources|was|were|is|are)\s+){0,3}(?:not discussed|not needed|declined|denied|not requested)\b/.test(suffix)) continue;
          if (!matches.some((match) => match.theme === rule.key && match.sourceField === sourceField)) {
            matches.push({ theme: rule.key, ruleId: `${themeRuleVersion}:${rule.key}`, sourceField });
          }
        }
      }
    }
  }
  return { version: themeRuleVersion, state: !hasText ? "missing" : matches.length ? "categorized" : "uncategorized", matches, followUpDocumented: matches.some((match) => match.theme === "follow_up") };
}

export const fictionalThemeSentences: Record<ThemeKey, string> = {
  study_strategies: "The fictional student discussed study strategies and ways to review learning material.",
  exam_preparation: "The fictional student discussed exam preparation.",
  time_management: "The fictional student discussed time management and planning study time.",
  academic_planning: "The fictional student discussed academic planning.",
  wellbeing: "The fictional student discussed wellbeing in relation to their studies.",
  study_environment: "The fictional student described a temporary disruption to their study environment.",
  tutoring_resources: "The fictional student discussed tutoring and available learning resources.",
  career_exploration: "The fictional student discussed career exploration.",
  follow_up: "A follow-up discussion was documented; completion is not established.",
};
