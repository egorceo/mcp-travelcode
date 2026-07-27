import { AssignPolicyConflict, AssignTravelPolicyResponse } from "../client/types.js";

export function formatAssignConflicts(conflicts: AssignPolicyConflict[], requested: number): string {
  const lines: string[] = [];
  lines.push(
    `Nothing was changed yet. ${conflicts.length} of ${requested} selected employee(s) already have a different personal travel policy:`,
  );
  lines.push("");
  for (const c of conflicts) {
    lines.push(`  - employee #${c.id} — currently has "${c.policyName}"`);
  }
  lines.push("");
  lines.push(
    "Ask the user whether these personal policies should be replaced. If they agree, call this tool again with the same arguments plus confirmReplace=true.",
  );
  return lines.join("\n");
}

export function formatAssignTravelPolicyResult(r: AssignTravelPolicyResponse): string {
  const lines: string[] = [];
  const succeeded = r.succeeded ?? [];
  const failed = r.failed ?? [];
  const skipped = r.skipped ?? [];

  if (succeeded.length > 0) {
    lines.push(`Policy assigned to ${succeeded.length} employee(s): ${succeeded.map((id) => `#${id}`).join(", ")}.`);
  } else {
    lines.push("Policy was not assigned to anyone.");
  }
  if (skipped.length > 0) {
    lines.push("");
    lines.push(`${skipped.length} employee(s) kept their existing personal policy:`);
    for (const s of skipped) {
      lines.push(`  - employee #${s.id} — kept "${s.policyName}"`);
    }
  }
  if (failed.length > 0) {
    lines.push("");
    lines.push(`${failed.length} employee(s) failed:`);
    for (const f of failed) {
      lines.push(`  - employee #${f.id} — ${f.error}`);
    }
  }
  if (r.approvals) {
    lines.push("");
    lines.push("Note: some pending trip approvals were reset because the applicable policy changed.");
  }
  return lines.join("\n");
}
