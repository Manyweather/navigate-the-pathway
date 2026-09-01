# Survey Analytics and Creator Governance

## Implemented pilot behavior

The secure pilot keeps student and advisor survey programs separate from assignment through reporting. Student dashboards receive the four approved student instruments. Advisor dashboards receive ACCS and the advisor-specific MacLeod Clark version. Participants see availability, progress, and completion but never scores or interpretations.

Administrator survey reporting includes separate Student Surveys and Advisor Surveys views, completion graphs, single-dimension comparisons, descriptive and comparative summaries, approved statistical outputs, small-cell suppression, small-sample warnings, and deterministic non-causal insight language. The Self-Assessment remains item-level. ACCS is labeled descriptive and provisional.

Protected exports are available as a ZIP of CSV files or a multi-sheet Excel workbook. De-identified output is the default. Identifiable output requires staff MFA, a stated purpose, an explicit warning, the `evaluation.raw_export` capability, and an audit event.

The qualitative workspace supports a human-managed codebook, response tagging, server-generated keyword suggestions, and recorded acceptance or rejection decisions. No external AI service receives open responses.

## Principal governance

The Creator is bootstrapped server-side and then bound by Supabase user UUID through persisted capability assignments. The Creator receives reset and purge capabilities. The Principal Investigator is designated from an existing Administrator account and receives equivalent evaluation and configuration capabilities without reset or purge execution.

Survey publication, outcome checkpoint activation, pilot resets, and account purges require separate initiation and approval. A principal cannot approve their own request. Pilot resets and permanent account purges can be executed only by the Creator after PI approval. Account purges also require a seven-day recovery period and retention review.

## Deliberately disabled

Grant Outcome Checkpoints remain disabled until the Creator and PI jointly approve the fields, consent implications, and activation request. Real participant invitations still depend on instrument permissions, finalized consent and withdrawal rules, IRB and privacy determinations, retention ownership, security review, and accessibility review.

## Deployment

- Supabase stores accounts, scoped roles, program records, protected survey data, governance records, qualitative coding, and audit history.
- The Cloudflare pilot API performs server-side authorization, calculation, suppression, export creation, and destructive-operation safeguards.
- The Sites application provides separate Student, Advisor, Administrator, and Creator Controls interfaces.
- The public GitHub Pages prototype remains fictional and browser-local.
