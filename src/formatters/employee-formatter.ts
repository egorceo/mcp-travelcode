import { EmployeeDetail, EmployeeEffectivePolicy, EmployeeListItem, EmployeesSearchResponse } from "../client/types.js";

const POLICY_SOURCE_LABELS: Record<string, string> = {
  personal: "assigned personally",
  departmentMember: "inherited from department",
  departmentAdmin: "inherited as department admin",
  role: "inherited from role",
};

export function describeEffectivePolicy(policy: EmployeeEffectivePolicy | null): string {
  if (!policy) return "no travel policy";
  const source = POLICY_SOURCE_LABELS[policy.source] ?? policy.source;
  const dept = policy.department ? ` "${policy.department}"` : "";
  return `${policy.name} (${source}${dept})`;
}

export function formatEmployeeShort(u: EmployeeListItem): string {
  const bits: string[] = [`#${u.id}  ${u.username || u.email}`];
  if (u.email) bits.push(u.email);
  if (u.role) bits.push(u.role);
  if (u.agencyName) bits.push(u.agencyName);
  if (u.department) bits.push(`dept: ${u.department}`);
  bits.push(`policy: ${describeEffectivePolicy(u.travelPolicy)}`);
  return bits.join(" · ");
}

export function formatEmployeeList(resp: EmployeesSearchResponse): string {
  const items = resp.data ?? [];
  const { page = 1, perpage = 0, total = 0, pages = 1 } = resp.meta ?? {};
  if (items.length === 0) {
    return `No employees found (total ${total}).`;
  }
  const header = `${items.length} of ${total} employees (page ${page}/${pages}, ${perpage} per page):`;
  return [header, ...items.map((u) => `  ${formatEmployeeShort(u)}`)].join("\n");
}

export function formatEmployeeDetail(u: EmployeeDetail): string {
  const lines: string[] = [];
  lines.push(`Employee #${u.id}: ${u.username || u.email}`);
  if (u.email) lines.push(`Email: ${u.email}`);
  if (u.phone) lines.push(`Phone: ${u.phone}`);
  lines.push(`Role: ${u.role}`);
  lines.push(`Status: ${u.status}`);
  if (u.agencyName) lines.push(`Company: ${u.agencyName}${u.companyId !== null ? ` (#${u.companyId})` : ""}`);
  lines.push(`Department: ${u.department ?? "none"}`);
  lines.push(`Travel policy: ${describeEffectivePolicy(u.travelPolicy)}`);
  if (u.createdAt) lines.push(`Registered: ${u.createdAt}`);
  return lines.join("\n");
}
