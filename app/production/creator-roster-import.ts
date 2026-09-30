export function parseRosterText(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((item) => item.trim().toLowerCase().replaceAll(/[^a-z0-9]/g, ""));
  return lines.slice(1).map((line) => {
    const cells = line.split(delimiter).map((item) => item.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
    const roleText = row.roles || row.role || "";
    const viewText = row.permissionsviews || row.views || row.permissions || "";
    const roleLower = roleText.toLowerCase();
    const roles = [
      /creator/.test(roleLower) ? "creator" : "",
      /principal\s*investigator|pathway\s*pi/.test(roleLower) ? "principal_investigator" : "",
      /administrator|director|impact/.test(roleLower) ? "administrator" : "",
      /academic\s*advisor|career\s*advisor|advisor/.test(roleLower) ? "advisor" : "",
      /faculty/.test(roleLower) ? "faculty" : "",
      /staff/.test(roleLower) ? "staff" : "",
    ].filter((item, index, all) => item && all.indexOf(item) === index);
    const workspaceRoles: Record<string, string[]> = {};
    if (/facilities/i.test(viewText)) workspaceRoles.facilities = ["requester"];
    if (/student|academic|career|peer|tutor/i.test(viewText)) workspaceRoles.oaca = ["advisor"];
    if (/pathway/i.test(viewText)) workspaceRoles.pathway = [/admin|pi/i.test(viewText) ? "administrator" : "staff"];
    if (/impact/i.test(viewText)) workspaceRoles.genesis = ["staff"];
    if (roles.includes("creator")) {
      workspaceRoles.pathway = ["creator"];
      workspaceRoles.oaca = ["creator"];
      workspaceRoles.genesis = ["creator"];
      workspaceRoles.facilities = ["administrator", "requester"];
    }
    const capabilities = [
      /student/i.test(viewText) ? "oaca.view.student" : "",
      /academic/i.test(viewText) ? "oaca.advisor.academic" : "",
      /career/i.test(viewText) ? "oaca.advisor.career" : "",
      /peer/i.test(viewText) ? "oaca.view.peer_tutor" : "",
      /tutoring\s*manager/i.test(viewText) ? "oaca.tutoring.manage" : "",
    ].filter(Boolean);
    return { email: row.email, displayName: row.name || row.displayname, roleTitle: row.title || row.roletitle || (/career\s*advisor/i.test(roleLower) ? "Career Associate Director" : null), roles, workspaceRoles, viewBundle: { capabilities } };
  });
}
