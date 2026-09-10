import type { AuthorizationContext } from "../app/production/types";
import type { ExperienceKey, ExperienceMembership } from "../app/production/platform-model";
import { acceptedUploadTypes, maximumUploadBytes, staffMfaRoles } from "../app/production/platform-model";
import { workspaceBody, workspaceJson, WorkspaceError, type WorkspaceServices } from "./workspace-api";

type ExperienceServices = WorkspaceServices & {
  context(): Promise<AuthorizationContext>;
};

async function memberships(services: ExperienceServices) {
  const value = await services.rpc<ExperienceMembership[]>("current_experience_memberships");
  return Array.isArray(value) ? value : [];
}

async function requireMembership(request: Request, services: ExperienceServices, experienceKey: ExperienceKey) {
  if (request.headers.get("x-navigate-experience") !== experienceKey) throw new WorkspaceError(403, "Open this action from its assigned Navigate workspace.");
  const membership = (await memberships(services)).find((item) => item.experienceKey === experienceKey && item.status === "active" && item.featureEnabled);
  if (!membership) throw new WorkspaceError(403, "An active experience membership is required.");
  if (membership.roles.some((role) => staffMfaRoles.has(role)) && services.user.aal !== "aal2") throw new WorkspaceError(403, "Verify your second factor before opening a staff workspace.");
  return membership;
}

function requireRole(membership: ExperienceMembership, roles: string[]) {
  if (!membership.roles.some((role) => roles.includes(role))) throw new WorkspaceError(403, "Your experience role does not permit this action.");
}

function requireCapability(membership: ExperienceMembership, capability: string, administratorBypass = true) {
  if (administratorBypass && membership.roles.includes("administrator")) return;
  if (!membership.capabilities.includes(capability)) throw new WorkspaceError(403, "A separate capability is required for this action.");
}

async function assignmentScope(services: ExperienceServices, experienceKey: ExperienceKey) {
  const rows = await services.service<Array<{ organization_id: string | null; program_id: string | null; cohort_id: string | null; role: string }>>(
    `experience_role_assignments?user_id=eq.${services.user.id}&experience_key=eq.${experienceKey}&revoked_at=is.null&select=organization_id,program_id,cohort_id,role`,
  );
  if (!rows.length) throw new WorkspaceError(403, "An active experience assignment is required.");
  return rows;
}

async function platformExperiences(services: ExperienceServices) {
  const context = await services.context();
  const assigned = await memberships(services);
  return { context: { ...context, experienceMemberships: assigned }, memberships: assigned };
}

async function platformAffiliations(services: ExperienceServices) {
  const assigned = await memberships(services);
  const isStudent = assigned.some((membership) => membership.status === "active" && membership.roles.includes("student"));
  if (!isStudent) return { isStudent: false, organizations: [], organizationIds: [], studentCouncil: false };
  const [organizations, affiliations] = await Promise.all([
    services.service<Array<Record<string, unknown>>>("genesis_organizations?archived_at=is.null&select=id,directory_key,name,college,campus,aliases,sort_priority&order=sort_priority,name"),
    services.service<Array<Record<string, unknown>>>(`platform_student_affiliations?student_id=eq.${services.user.id}&ended_at=is.null&select=affiliation_type,organization_id,designation`),
  ]);
  return {
    isStudent: true,
    organizations: organizations.map((item) => ({ id: item.id, key: item.directory_key, name: item.name, college: item.college, campus: item.campus, aliases: item.aliases || [] })),
    organizationIds: affiliations.filter((item) => item.affiliation_type === "interest_group").map((item) => item.organization_id),
    studentCouncil: affiliations.some((item) => item.affiliation_type === "student_council"),
  };
}

async function createFile(request: Request, services: ExperienceServices) {
  const body = await workspaceBody(request);
  const experienceKey = String(body.experienceKey || "") as ExperienceKey;
  if (!["pathway", "oaca", "genesis"].includes(experienceKey)) throw new WorkspaceError(400, "Choose a valid experience.");
  await requireMembership(request, services, experienceKey);
  const storagePath = String(body.storagePath || "");
  const mimeType = String(body.mimeType || "") as Parameters<typeof acceptedUploadTypes.has>[0];
  const sizeBytes = Number(body.sizeBytes || 0);
  const originalName = String(body.originalName || "").trim();
  if (!storagePath.startsWith(`${services.user.id}/${experienceKey}/`) || storagePath.includes("..")) throw new WorkspaceError(400, "The private storage path is invalid.");
  if (!acceptedUploadTypes.has(mimeType) || sizeBytes < 1 || sizeBytes > maximumUploadBytes || !originalName) throw new WorkspaceError(400, "The file type or size is not allowed.");
  const result = await services.service<Array<{ id: string; scan_status: string }>>("platform_files", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ owner_id: services.user.id, experience_key: experienceKey, storage_path: storagePath, original_name: originalName.slice(0, 240), mime_type: mimeType, size_bytes: sizeBytes, scan_status: "pending" }),
  });
  return { id: result[0]?.id, scanStatus: result[0]?.scan_status || "pending" };
}

async function oacaBootstrap(services: ExperienceServices, membership: ExperienceMembership) {
  const [scope, context] = await Promise.all([assignmentScope(services, "oaca"), services.context()]);
  const organizationIds = [...new Set(scope.map((item) => item.organization_id).filter(Boolean))] as string[];
  const activeOrganizationIds = context.activeOrganizationId && organizationIds.includes(context.activeOrganizationId) ? [context.activeOrganizationId] : organizationIds;
  const scopedCapabilities = organizationIds.length ? await services.service<Array<{ organization_id: string | null; capability: string }>>(`experience_capability_assignments?user_id=eq.${services.user.id}&experience_key=eq.oaca&revoked_at=is.null&select=organization_id,capability`) : [];
  const organizationFilter = organizationIds.length ? `&organization_id=in.(${organizationIds.join(",")})` : "";
  const serviceRows = await services.service<Array<Record<string, unknown>>>(`oaca_service_lines?select=id,key,name,provider_rule,policy_status,modalities,duration_minutes${organizationFilter}&order=name`);
  const providerRows = await services.service<Array<Record<string, unknown>>>(`oaca_providers?active=eq.true&select=id,user_id,classification,modalities${organizationFilter}`);
  const providerUserIds = providerRows.map((item) => String(item.user_id));
  const providerProfiles = providerUserIds.length ? await services.service<Array<{ user_id: string; display_name: string }>>(`profiles?user_id=in.(${providerUserIds.join(",")})&select=user_id,display_name`) : [];
  const serviceIds = serviceRows.map((item) => String(item.id));
  const providerServices = serviceIds.length && providerRows.length ? await services.service<Array<{ provider_id: string; service_line_id: string; subjects: string[]; formats: string[] }>>(`oaca_provider_services?provider_id=in.(${providerRows.map((item) => item.id).join(",")})&select=provider_id,service_line_id,subjects,formats`) : [];
  const providers = providerRows.map((item) => ({ id: String(item.id), displayName: providerProfiles.find((profile) => profile.user_id === item.user_id)?.display_name || "OACA provider", classification: String(item.classification), modalities: Array.isArray(item.modalities) ? item.modalities : [], subjects: providerServices.filter((row) => row.provider_id === item.id).flatMap((row) => row.subjects || []) }));
  const ownProvider = providerRows.find((item) => item.user_id === services.user.id);
  const outreachOrganizationIds = activeOrganizationIds.filter((organizationId) => scope.some((assignment) => assignment.organization_id === organizationId && assignment.role === "administrator") || scopedCapabilities.some((assignment) => assignment.organization_id === organizationId && assignment.capability === "oaca.outreach.manage"));
  const outreachInsightsOrganizationIds = activeOrganizationIds.filter((organizationId) => outreachOrganizationIds.includes(organizationId) || scopedCapabilities.some((assignment) => assignment.organization_id === organizationId && assignment.capability === "oaca.outreach.insights"));
  const canManageOutreach = outreachOrganizationIds.length > 0;
  const canViewOutreachInsights = outreachInsightsOrganizationIds.length > 0;
  const filters = [membership.roles.includes("student") ? `student_id.eq.${services.user.id}` : "", ownProvider ? `provider_id.eq.${ownProvider.id}` : ""].filter(Boolean);
  const appointmentRows = filters.length ? await services.service<Array<Record<string, unknown>>>(`oaca_appointments?or=(${filters.join(",")})&select=id,student_id,provider_id,service_line_id,subject,format,starts_at,ends_at,modality,status,sandbox,request_origin,obligation_id&order=starts_at.desc.nullslast&limit=100`) : [];
  const appointmentStudentIds = [...new Set(appointmentRows.map((item) => String(item.student_id)))];
  const appointmentStudentProfiles = appointmentStudentIds.length ? await services.service<Array<{ user_id: string; display_name: string }>>(`profiles?user_id=in.(${appointmentStudentIds.join(",")})&select=user_id,display_name`) : [];
  const records = membership.roles.includes("student") && appointmentRows.length ? await services.service<Array<{ appointment_id: string; student_recap: string; recap_published_at: string | null }>>(`oaca_encounter_records?appointment_id=in.(${appointmentRows.map((item) => item.id).join(",")})&recap_published_at=not.is.null&select=appointment_id,student_recap,recap_published_at`) : [];
  const assignments = membership.roles.includes("student") ? await services.service<Array<{ provider_id: string }>>(`oaca_advisor_assignments?student_id=eq.${services.user.id}&ended_at=is.null&select=provider_id&limit=1`) : [];
  const assignedStudentRows = ownProvider ? await services.service<Array<{ student_id: string }>>(`oaca_advisor_assignments?provider_id=eq.${ownProvider.id}&ended_at=is.null&select=student_id`) : [];
  const capabilityStudentRows = (membership.capabilities.includes("oaca.appointments.create_for_student") || canManageOutreach) && organizationIds.length ? await services.service<Array<{ user_id: string }>>(`experience_role_assignments?experience_key=eq.oaca&role=eq.student&organization_id=in.(${organizationIds.join(",")})&revoked_at=is.null&select=user_id`) : [];
  const assignedStudentIds = [...new Set([...assignedStudentRows.map((item) => item.student_id), ...capabilityStudentRows.map((item) => item.user_id)])];
  const assignedStudentProfiles = assignedStudentIds.length ? await services.service<Array<{ user_id: string; display_name: string }>>(`profiles?user_id=in.(${assignedStudentIds.join(",")})&select=user_id,display_name&order=display_name`) : [];
  const policyDocuments = await services.service<Array<Record<string, unknown>>>("oaca_policy_documents?status=eq.approved_source&select=id,policy_key,title,version_label,effective_date,last_updated_on,audience,requires_acknowledgment,status&order=title");
  const policyRules = await services.service<Array<Record<string, unknown>>>("oaca_policy_rules?active=eq.true&select=id,rule_key,service_key,audience,phase,year_number,trigger_type,required_provider,due_rule,summary,config&order=service_key,year_number,rule_key");
  const acknowledgments = await services.service<Array<Record<string, unknown>>>(`oaca_policy_acknowledgments?user_id=eq.${services.user.id}&select=id,policy_document_id,acknowledgment_kind,acknowledged_at`);
  const obligationStudentIds = membership.roles.includes("student") ? [services.user.id] : assignedStudentIds;
  const obligationRows = obligationStudentIds.length ? await services.service<Array<Record<string, unknown>>>(`oaca_advising_obligations?student_id=in.(${obligationStudentIds.join(",")})&status=in.(open,scheduled,completed)&select=id,student_id,policy_rule_id,assigned_provider_id,triggered_at,due_at,status,completed_appointment_id&order=due_at.asc.nullslast`) : [];
  const restrictions = membership.roles.includes("student") ? await services.service<Array<Record<string, unknown>>>(`oaca_scheduling_restrictions?student_id=eq.${services.user.id}&released_at=is.null&select=id,service_line_id,reason,starts_at,ends_at`) : [];
  const tutorComplianceRows = ownProvider?.classification === "peer_tutor" ? await services.service<Array<Record<string, unknown>>>(`oaca_tutor_compliance?provider_id=eq.${ownProvider.id}&select=provider_id,application_approved_at,faculty_recommendation_at,interview_completed_at,workday_onboarding_at,training_completed_at,handbook_acknowledgment_id,eligible_at,suspended_at,suspension_reason&limit=1`) : [];
  const calendar = await services.service<Array<{ id: string }>>(`pathway_calendar_connections?user_id=eq.${services.user.id}&provider=eq.microsoft&status=eq.connected&select=id&limit=1`);
  const importOrganizationIds = activeOrganizationIds.filter((organizationId) => scope.some((assignment) => assignment.organization_id === organizationId && assignment.role === "administrator") || scopedCapabilities.some((assignment) => assignment.organization_id === organizationId && assignment.capability === "oaca.import.manage"));
  const analyticsOrganizationIds = activeOrganizationIds.filter((organizationId) => scope.some((assignment) => assignment.organization_id === organizationId && assignment.role === "administrator") || scopedCapabilities.some((assignment) => assignment.organization_id === organizationId && assignment.capability === "oaca.analytics.aggregate"));
  const canManageImports = importOrganizationIds.length > 0;
  const canViewAnalytics = analyticsOrganizationIds.length > 0;
  const importBatches = canManageImports ? await services.service<Array<Record<string, unknown>>>(`oaca_import_batches?organization_id=in.(${importOrganizationIds.join(",")})&select=id,file_id,source_system,dataset_type,cohort_label,period_starts_on,period_ends_on,contains_real_student_data,source_headers,column_mapping,status,total_rows,valid_rows,invalid_rows,matched_students,quality_summary,requested_by,reviewed_by,reviewed_at,created_at,completed_at&order=created_at.desc&limit=50`) : [];
  const importIssues = canManageImports && importBatches.length ? await services.service<Array<Record<string, unknown>>>(`oaca_import_row_issues?batch_id=in.(${importBatches.map((item) => item.id).join(",")})&select=id,batch_id,row_number,severity,issue_code,field_key,message&order=row_number&limit=250`) : [];
  const analytics = canViewAnalytics ? await services.rpc<Record<string, unknown>>("oaca_aggregate_analytics", { payload: {} }) : null;
  const events = await services.rpc<Array<Record<string, unknown>>>("oaca_event_feed", { payload: {} });
  const nudgeFilter = membership.roles.includes("student") ? `student_id=eq.${services.user.id}&status=in.(queued,delivered,opened)` : canManageOutreach && activeOrganizationIds.length ? `organization_id=in.(${activeOrganizationIds.join(",")})` : `sent_by=eq.${services.user.id}`;
  const nudgeRows = await services.service<Array<Record<string, unknown>>>(`oaca_appointment_nudges?${nudgeFilter}&select=id,student_id,service_key,provider_id,due_by,status,created_at&order=created_at.desc&limit=100`);
  const nudgeStudentIds = [...new Set(nudgeRows.map((item) => String(item.student_id)))];
  const nudgeStudentProfiles = nudgeStudentIds.length ? await services.service<Array<{ user_id: string; display_name: string }>>(`profiles?user_id=in.(${nudgeStudentIds.join(",")})&select=user_id,display_name`) : [];
  const ownCampaignRecipients = membership.roles.includes("student") ? await services.service<Array<{ id: string; campaign_id: string }>>(`oaca_campaign_recipients?user_id=eq.${services.user.id}&delivery_status=in.(sent,delivered)&select=id,campaign_id&order=created_at.desc&limit=100`) : [];
  const communicationCampaigns = ownCampaignRecipients.length ? await services.service<Array<Record<string, unknown>>>(`oaca_outreach_campaigns?id=in.(${ownCampaignRecipients.map((item) => item.campaign_id).join(",")})&select=id,subject,preview_text,content,sent_at,event_id,form_id&order=created_at.desc`) : [];
  const communicationFormIds = [...new Set(communicationCampaigns.map((item) => item.form_id).filter(Boolean).map(String))];
  const communicationForms = communicationFormIds.length ? await services.service<Array<Record<string, unknown>>>(`oaca_forms?id=in.(${communicationFormIds.join(",")})&status=eq.published&select=id,title,form_schema`) : [];
  const formResponses = communicationFormIds.length && membership.roles.includes("student") ? await services.service<Array<{ form_id: string }>>(`oaca_form_responses?student_id=eq.${services.user.id}&form_id=in.(${communicationFormIds.join(",")})&select=form_id`) : [];
  const campaigns = canViewOutreachInsights ? await services.rpc<Array<Record<string, unknown>>>("oaca_campaign_insights", { payload: {} }) : [];
  const audienceOptions = canManageOutreach ? await services.rpc<Record<string, unknown>>("oaca_audience_options", { payload: {} }) : { cohorts: [], phases: [], years: [], campuses: [] };
  const unreadEventNotifications = await services.service<Array<{ id: string }>>(`platform_notifications?experience_key=eq.oaca&user_id=eq.${services.user.id}&read_at=is.null&dismissed_at=is.null&select=id&limit=1000`);
  return {
    services: serviceRows.map((item) => ({ id: item.id, key: item.key, name: item.name, providerRule: item.provider_rule, policyStatus: item.policy_status, modalities: item.modalities || [], durationMinutes: item.duration_minutes })),
    providers,
    appointments: appointmentRows.map((item) => ({ id: item.id, studentId: item.student_id, studentName: appointmentStudentProfiles.find((profile) => profile.user_id === item.student_id)?.display_name || "Student", serviceName: serviceRows.find((service) => service.id === item.service_line_id)?.name || "OACA visit", providerName: providers.find((provider) => provider.id === item.provider_id)?.displayName || null, subject: item.subject, format: item.format, startsAt: item.starts_at, endsAt: item.ends_at, modality: item.modality, status: item.status, sandbox: item.sandbox, requestOrigin: item.request_origin || "student", obligationId: item.obligation_id, studentRecap: records.find((record) => record.appointment_id === item.id)?.student_recap })),
    assignedAdvisor: providers.find((provider) => provider.id === assignments[0]?.provider_id) || null,
    assignedStudents: assignedStudentProfiles.map((profile) => ({ id: profile.user_id, displayName: profile.display_name })),
    currentProvider: ownProvider ? providers.find((provider) => provider.id === ownProvider.id) || null : null,
    policyDocuments: policyDocuments.map((item) => ({ id: item.id, key: item.policy_key, title: item.title, versionLabel: item.version_label, effectiveDate: item.effective_date, lastUpdatedOn: item.last_updated_on, audience: item.audience, requiresAcknowledgment: item.requires_acknowledgment, status: item.status })),
    policyRules: policyRules.map((item) => ({ id: item.id, key: item.rule_key, serviceKey: item.service_key, audience: item.audience, phase: item.phase, year: item.year_number, triggerType: item.trigger_type, requiredProvider: item.required_provider, dueRule: item.due_rule, summary: item.summary, config: item.config || {} })),
    acknowledgments: acknowledgments.map((item) => ({ id: item.id, policyDocumentId: item.policy_document_id, kind: item.acknowledgment_kind, acknowledgedAt: item.acknowledged_at })),
    obligations: obligationRows.map((item) => { const rule = policyRules.find((candidate) => candidate.id === item.policy_rule_id); return { id: item.id, studentId: item.student_id, studentName: appointmentStudentProfiles.concat(assignedStudentProfiles).find((profile) => profile.user_id === item.student_id)?.display_name || "Student", ruleKey: rule?.rule_key || "", title: rule?.summary || "Advising requirement", serviceKey: rule?.service_key || "academic_advising", requiredProvider: rule?.required_provider || null, triggeredAt: item.triggered_at, dueAt: item.due_at, status: item.status, completedAppointmentId: item.completed_appointment_id }; }),
    restrictions: restrictions.map((item) => ({ id: item.id, serviceLineId: item.service_line_id, reason: item.reason, startsAt: item.starts_at, endsAt: item.ends_at })),
    tutorCompliance: tutorComplianceRows[0] || null,
    liveScheduling: serviceRows.some((item) => item.policy_status === "live_approved"),
    calendarConnected: calendar.length > 0,
    canManageImports,
    canViewAnalytics,
    canManageOutreach,
    canViewOutreachInsights,
    importBatches: importBatches.map((item) => ({ id: item.id, fileId: item.file_id, sourceSystem: item.source_system, datasetType: item.dataset_type, cohortLabel: item.cohort_label, periodStartsOn: item.period_starts_on, periodEndsOn: item.period_ends_on, containsRealStudentData: item.contains_real_student_data, sourceHeaders: item.source_headers || [], columnMapping: item.column_mapping || {}, status: item.status, totalRows: item.total_rows, validRows: item.valid_rows, invalidRows: item.invalid_rows, matchedStudents: item.matched_students, qualitySummary: item.quality_summary || {}, requestedBy: item.requested_by, reviewedBy: item.reviewed_by, reviewedAt: item.reviewed_at, createdAt: item.created_at, completedAt: item.completed_at, issues: importIssues.filter((issue) => issue.batch_id === item.id).map((issue) => ({ id: issue.id, rowNumber: issue.row_number, severity: issue.severity, code: issue.issue_code, fieldKey: issue.field_key, message: issue.message })) })),
    analytics,
    events,
    campaigns,
    nudges: nudgeRows.map((item) => ({ id: item.id, studentId: item.student_id, studentName: nudgeStudentProfiles.find((profile) => profile.user_id === item.student_id)?.display_name || (item.student_id === services.user.id ? "You" : "Student"), serviceKey: item.service_key, providerName: providers.find((provider) => provider.id === item.provider_id)?.displayName || null, dueBy: item.due_by, status: item.status, createdAt: item.created_at })),
    communications: communicationCampaigns.map((item) => ({ id: ownCampaignRecipients.find((recipient) => recipient.campaign_id === item.id)?.id || item.id, campaignId: item.id, subject: item.subject, previewText: item.preview_text, content: item.content || {}, sentAt: item.sent_at, eventId: item.event_id, formId: item.form_id })),
    forms: communicationForms.map((item) => ({ id: item.id, title: item.title, fields: item.form_schema || [], submitted: formResponses.some((response) => response.form_id === item.id) })),
    audienceOptions,
    eventNotificationUnreadCount: unreadEventNotifications.length,
  };
}

async function genesisBootstrap(services: ExperienceServices, membership: ExperienceMembership) {
  await assignmentScope(services, "genesis");
  const organizations = await services.service<Array<Record<string, unknown>>>("genesis_organizations?archived_at=is.null&select=id,directory_key,name,college,campus,mission,advisor,aliases,source_date,pilot_available&order=sort_priority,name");
  const portfolios = await services.service<Array<Record<string, unknown>>>(`genesis_portfolios?owner_id=eq.${services.user.id}&archived_at=is.null&select=id,title,organization_id,current_version&order=updated_at.desc`);
  const versions = portfolios.length ? await services.service<Array<Record<string, unknown>>>(`genesis_portfolio_versions?portfolio_id=in.(${portfolios.map((item) => item.id).join(",")})&select=portfolio_id,version,content,status,mentor_feedback&order=version.desc`) : [];
  const initiativeRows = await services.service<Array<Record<string, unknown>>>(`genesis_initiatives?created_by=eq.${services.user.id}&archived_at=is.null&select=id,title,organization_id,status`);
  const initiativeIds = initiativeRows.map((item) => item.id);
  const snapshots = initiativeIds.length ? await services.service<Array<Record<string, unknown>>>(`genesis_snapshots?initiative_id=in.(${initiativeIds.join(",")})&select=id,initiative_id,published_at,attribution,content&order=published_at.desc`) : [];
  const handoffs = initiativeIds.length ? await services.service<Array<Record<string, unknown>>>(`genesis_handoffs?initiative_id=in.(${initiativeIds.join(",")})&select=id,initiative_id,status,next_steward_email&order=created_at.desc`) : [];
  const events = initiativeIds.length ? await services.service<Array<Record<string, unknown>>>(`genesis_events?initiative_id=in.(${initiativeIds.join(",")})&select=id,title,status,starts_at&order=starts_at.desc.nullslast`) : [];
  const reviewMemberships = membership.roles.some((role) => ["mentor","administrator"].includes(role)) ? await services.service<Array<{ organization_id: string }>>(`genesis_organization_memberships?user_id=eq.${services.user.id}&status=eq.approved&role=in.(mentor,administrator)&select=organization_id`) : [];
  const reviewPortfolios = reviewMemberships.length ? await services.service<Array<{ id: string; title: string; organization_id: string }>>(`genesis_portfolios?organization_id=in.(${reviewMemberships.map((item) => item.organization_id).join(",")})&archived_at=is.null&select=id,title,organization_id`) : [];
  const reviews = reviewPortfolios.length ? await services.service<Array<Record<string, unknown>>>(`genesis_portfolio_versions?portfolio_id=in.(${reviewPortfolios.map((item) => item.id).join(",")})&status=eq.submitted&select=id,portfolio_id,version,content,status&order=submitted_at`) : [];
  return {
    organizations: organizations.map((item) => ({ id: item.id, key: item.directory_key, name: item.name, college: item.college, campus: item.campus, mission: item.mission, advisor: item.advisor, aliases: item.aliases || [], sourceDate: item.source_date, pilotAvailable: item.pilot_available })),
    portfolios: portfolios.map((item) => { const version = versions.find((row) => row.portfolio_id === item.id && row.version === item.current_version) || versions.find((row) => row.portfolio_id === item.id); return { id: item.id, title: item.title, organizationId: item.organization_id, organizationName: organizations.find((organization) => organization.id === item.organization_id)?.name || "Organization", currentVersion: item.current_version, status: version?.status || "draft", content: version?.content || {}, mentorFeedback: version?.mentor_feedback }; }),
    reviews: reviews.map((item) => ({ id: item.portfolio_id, title: reviewPortfolios.find((portfolio) => portfolio.id === item.portfolio_id)?.title || "Submitted initiative", organizationId: reviewPortfolios.find((portfolio) => portfolio.id === item.portfolio_id)?.organization_id || "", organizationName: "", currentVersion: item.version, status: item.status, content: item.content || {} })),
    snapshots: snapshots.map((item) => ({ id: item.id, title: (item.content as Record<string, unknown>)?.title || "Initiative snapshot", publishedAt: item.published_at, authorName: (item.attribution as Record<string, unknown>)?.authorName || "Student author" })),
    handoffs: handoffs.map((item) => ({ id: item.id, title: initiativeRows.find((initiative) => initiative.id === item.initiative_id)?.title || "Initiative handoff", status: item.status, nextSteward: item.next_steward_email })),
    events: events.map((item) => ({ id: item.id, title: item.title, status: item.status, startsAt: item.starts_at })),
  };
}

export async function experienceRoute(request: Request, services: ExperienceServices): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/platform/experiences" && request.method === "GET") return workspaceJson(await platformExperiences(services));
  if (url.pathname === "/api/platform/affiliations" && request.method === "GET") return workspaceJson(await platformAffiliations(services));
  if (url.pathname === "/api/platform/affiliations" && request.method === "POST") return workspaceJson(await services.rpc("platform_save_student_affiliations", { payload: await workspaceBody(request) }));
  if (url.pathname === "/api/platform/files" && request.method === "POST") return workspaceJson(await createFile(request, services), 201);
  if (url.pathname === "/api/platform/notifications/action" && request.method === "POST") return workspaceJson(await services.rpc("platform_update_notification", { payload: await workspaceBody(request) }));
  if (url.pathname === "/api/platform/push-subscriptions" && request.method === "POST") return workspaceJson(await services.rpc("platform_save_push_subscription", { payload: await workspaceBody(request) }), 201);
  if (url.pathname === "/api/platform/push-subscriptions" && request.method === "DELETE") return workspaceJson(await services.rpc("platform_remove_push_subscription", { payload: await workspaceBody(request) }));
  if (url.pathname === "/api/platform/notification-preferences" && request.method === "POST") return workspaceJson(await services.rpc("platform_save_notification_preferences", { payload: await workspaceBody(request) }));

  if (url.pathname.startsWith("/api/oaca/")) {
    const membership = await requireMembership(request, services, "oaca");
    if (url.pathname === "/api/oaca/bootstrap" && request.method === "GET") return workspaceJson(await oacaBootstrap(services, membership));
    if (url.pathname === "/api/oaca/events/workspace" && request.method === "GET") return workspaceJson(await services.rpc("oaca_event_workspace", { payload: { eventId: url.searchParams.get("eventId") || null } }));
    if (url.pathname === "/api/oaca/events/update" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_update_event", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/events/cancel" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_cancel_event", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/events/attendance" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_update_event_attendance", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/events/hosts" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_assign_event_host", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/events/check-in" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_set_event_checkin", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/events/check-in/self" && request.method === "POST") {
      requireRole(membership, ["student"]);
      return workspaceJson(await services.rpc("oaca_self_checkin", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/events/check-in/student-token" && request.method === "POST") {
      requireRole(membership, ["student"]);
      return workspaceJson(await services.rpc("oaca_issue_student_qr", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/events/check-in/scan" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_scan_student_qr", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/events/corrections/resolve" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_resolve_attendance_correction", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/events/corrections" && request.method === "POST") {
      requireRole(membership, ["student"]);
      return workspaceJson(await services.rpc("oaca_request_attendance_correction", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/event-imports" && request.method === "GET") {
      requireRole(membership, ["faculty","staff","administrator"]); requireCapability(membership, "oaca.import.manage");
      const scope = await assignmentScope(services, "oaca");
      const organizationIds = [...new Set(scope.map((item) => item.organization_id).filter(Boolean))] as string[];
      return workspaceJson(organizationIds.length ? await services.service(`oaca_event_import_packages?organization_id=in.(${organizationIds.join(",")})&select=id,status,source_event_rows,source_attendance_rows,occurrence_count,matched_students,merged_duplicates,quality_summary,requested_by,reviewed_by,reviewed_at,completed_at,created_at&order=created_at.desc&limit=50`) : []);
    }
    if (url.pathname === "/api/oaca/event-imports" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]); requireCapability(membership, "oaca.import.manage");
      return workspaceJson(await services.rpc("oaca_create_event_import_package", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/event-imports/review" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]); requireCapability(membership, "oaca.import.manage");
      return workspaceJson(await services.rpc("oaca_review_event_import_package", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/event-notifications" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_send_event_notification", { payload: await workspaceBody(request) }), 202);
    }
    if (url.pathname === "/api/oaca/event-notification-rules" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_save_event_notification_rule", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/event-messages" && request.method === "POST") {
      requireRole(membership, ["student","faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_send_event_message", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/events/publish" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      requireCapability(membership, "oaca.outreach.manage");
      return workspaceJson(await services.rpc("oaca_publish_event", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/events/register" && request.method === "POST") {
      requireRole(membership, ["student"]);
      return workspaceJson(await services.rpc("oaca_register_event", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/events" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      requireCapability(membership, "oaca.outreach.manage");
      return workspaceJson(await services.rpc("oaca_create_event", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/campaigns/send" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      requireCapability(membership, "oaca.outreach.manage");
      return workspaceJson(await services.rpc("oaca_queue_campaign", { payload: await workspaceBody(request) }), 202);
    }
    if (url.pathname === "/api/oaca/campaigns/engagement" && request.method === "POST") {
      requireRole(membership, ["student"]);
      return workspaceJson(await services.rpc("oaca_record_campaign_engagement", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/campaigns" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      requireCapability(membership, "oaca.outreach.manage");
      return workspaceJson(await services.rpc("oaca_create_campaign", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/forms/respond" && request.method === "POST") {
      requireRole(membership, ["student"]);
      return workspaceJson(await services.rpc("oaca_submit_form_response", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/nudges/action" && request.method === "POST") {
      requireRole(membership, ["student"]);
      return workspaceJson(await services.rpc("oaca_update_nudge", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/nudges" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_send_appointment_nudge", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/imports" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      requireCapability(membership, "oaca.import.manage");
      return workspaceJson(await services.rpc("oaca_create_import_batch", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/imports/mapping" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      requireCapability(membership, "oaca.import.manage");
      return workspaceJson(await services.rpc("oaca_save_import_mapping", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/imports/review" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      requireCapability(membership, "oaca.import.manage");
      return workspaceJson(await services.rpc("oaca_review_import_batch", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/analytics" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      requireCapability(membership, "oaca.analytics.aggregate");
      return workspaceJson(await services.rpc("oaca_aggregate_analytics", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/appointments/on-behalf" && request.method === "POST") {
      requireRole(membership, ["faculty","staff"]);
      return workspaceJson(await services.rpc("oaca_advisor_create_appointment", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/appointments/cancel" && request.method === "POST") {
      requireRole(membership, ["student"]);
      return workspaceJson(await services.rpc("oaca_student_cancel_appointment", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/appointments" && request.method === "POST") {
      requireRole(membership, ["student"]);
      const body = await workspaceBody(request);
      return workspaceJson(await services.rpc("oaca_create_appointment", { payload: body }), 201);
    }
    if (url.pathname === "/api/oaca/appointment-decisions" && request.method === "POST") {
      requireRole(membership, ["faculty","staff","administrator"]);
      return workspaceJson(await services.rpc("oaca_change_appointment", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/records" && request.method === "POST") {
      requireRole(membership, ["faculty","staff"]);
      return workspaceJson(await services.rpc("oaca_save_encounter", { payload: await workspaceBody(request) }));
    }
    if (url.pathname === "/api/oaca/policy-acknowledgments" && request.method === "POST") {
      requireRole(membership, ["student","faculty","staff"]);
      return workspaceJson(await services.rpc("oaca_acknowledge_policy", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/obligations" && request.method === "POST") {
      requireRole(membership, ["faculty","staff"]);
      return workspaceJson(await services.rpc("oaca_record_policy_trigger", { payload: await workspaceBody(request) }), 201);
    }
    if (url.pathname === "/api/oaca/tutor-session-logs" && request.method === "POST") {
      requireRole(membership, ["student","faculty","staff"]);
      return workspaceJson(await services.rpc("oaca_submit_tutor_session_log", { payload: await workspaceBody(request) }), 201);
    }
    throw new WorkspaceError(404, "OACA action not found.");
  }

  if (url.pathname.startsWith("/api/genesis/")) {
    const membership = await requireMembership(request, services, "genesis");
    if (url.pathname === "/api/genesis/bootstrap" && request.method === "GET") return workspaceJson(await genesisBootstrap(services, membership));
    const body = await workspaceBody(request);
    const routes: Record<string, { role: string[]; rpc: string }> = {
      "/api/genesis/reflections": { role: ["student"], rpc: "genesis_save_reflection" },
      "/api/genesis/reviews": { role: ["student"], rpc: "genesis_submit_review" },
      "/api/genesis/snapshots": { role: ["student"], rpc: "genesis_publish_snapshot" },
      "/api/genesis/handoffs": { role: ["student"], rpc: "genesis_create_handoff" },
      "/api/genesis/events": { role: ["student","mentor","community_liaison"], rpc: "genesis_create_event" },
      "/api/genesis/review-decisions": { role: ["mentor","administrator"], rpc: "genesis_review_decide" },
    };
    const route = routes[url.pathname];
    if (!route || request.method !== "POST") throw new WorkspaceError(404, "GENESIS action not found.");
    requireRole(membership, route.role);
    return workspaceJson(await services.rpc(route.rpc, { payload: body }), 201);
  }
  return null;
}
