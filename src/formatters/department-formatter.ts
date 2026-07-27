import { DepartmentNode, DepartmentsResponse } from "../client/types.js";

function nodeLine(d: DepartmentNode): string {
  const bits: string[] = [`${d.name} (#${d.id})`];
  if (d.directMembers !== undefined || d.totalMembers !== undefined) {
    const direct = d.directMembers ?? 0;
    const total = d.totalMembers ?? direct;
    bits.push(total !== direct ? `${direct} member(s), ${total} incl. sub-departments` : `${direct} member(s)`);
  }
  if (d.admins && d.admins.length > 0) {
    bits.push(`admins: ${d.admins.map((a) => a.name).join(", ")}`);
  }
  return bits.join(" — ");
}

function renderTree(nodes: DepartmentNode[], depth: number, out: string[]): void {
  for (const node of nodes) {
    out.push(`${"  ".repeat(depth)}- ${nodeLine(node)}`);
    if (node.children && node.children.length > 0) {
      renderTree(node.children, depth + 1, out);
    }
  }
}

export function formatDepartmentTree(resp: DepartmentsResponse): string {
  const items = resp.items ?? [];
  const lines: string[] = [];
  const companyLabel = resp.companyName ?? (resp.companyId !== undefined ? `company #${resp.companyId}` : "current company");
  if (items.length === 0) {
    return `No departments defined for ${companyLabel}.`;
  }
  lines.push(`Departments of ${companyLabel}:`);
  lines.push("");
  renderTree(items, 0, lines);
  if (resp.unassignedCount !== undefined && resp.unassignedCount > 0) {
    lines.push("");
    lines.push(`${resp.unassignedCount} employee(s) are not assigned to any department.`);
  }
  return lines.join("\n");
}
