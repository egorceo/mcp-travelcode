import {
  PolicyGatedValue,
  TravelPoliciesResponse,
  TravelPolicyCityOverride,
  TravelPolicyFull,
  TravelPolicyListItem,
} from "../client/types.js";

function gated(label: string, g?: PolicyGatedValue, suffix = ""): string | undefined {
  if (!g || !g.enabled) return undefined;
  const value = g.value === "" ? "(not set)" : g.value;
  return `${label}: ${value}${suffix}`;
}

function scopeSummary(userIds: number[], departments: string[], roleIds: number[]): string {
  const parts: string[] = [];
  if (userIds.length > 0) parts.push(`${userIds.length} personal user(s)`);
  if (departments.length > 0) parts.push(`departments: ${departments.join(", ")}`);
  if (roleIds.length > 0) parts.push(`${roleIds.length} role(s)`);
  return parts.length > 0 ? parts.join(" · ") : "not assigned to anyone yet";
}

function formatPolicyListItem(p: TravelPolicyListItem): string {
  const lines: string[] = [];
  const company = p.agencyId !== null ? `company #${p.agencyId}` : "all companies";
  lines.push(`#${p.id}  ${p.name} — ${company}${p.editable ? "" : " (read-only)"}`);
  const deptNames = (p.departments ?? []).map((d) => d.name);
  lines.push(`  Applies to: ${scopeSummary(p.userId ?? [], deptNames, p.roleId ?? [])}`);
  if (p.flightDescription) lines.push(`  Flights:   ${p.flightDescription}`);
  if (p.hotelDescription) lines.push(`  Hotels:    ${p.hotelDescription}`);
  if (p.railwayDescription) lines.push(`  Railway:   ${p.railwayDescription}`);
  if (p.transferDescription) lines.push(`  Transfers: ${p.transferDescription}`);
  return lines.join("\n");
}

export function formatTravelPolicyList(resp: TravelPoliciesResponse): string {
  const items = resp.items ?? [];
  if (items.length === 0) {
    return "No travel policies found.";
  }
  const lines: string[] = [`${resp.total ?? items.length} travel policy(ies):`, ""];
  for (const p of items) {
    lines.push(formatPolicyListItem(p));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function cityOverrides(overrides?: TravelPolicyCityOverride[]): string[] {
  const rows = (overrides ?? []).filter((o) => o.cityName && o.value !== "");
  return rows.map((o) => `    city override — ${o.cityName}: ${o.value}`);
}

function pushSection(lines: string[], title: string, rules: Array<string | undefined>, extra: string[] = []): void {
  const active = rules.filter((r): r is string => r !== undefined);
  lines.push(`${title}:`);
  if (active.length === 0 && extra.length === 0) {
    lines.push("  no restrictions");
  } else {
    for (const r of active) lines.push(`  - ${r}`);
    for (const e of extra) lines.push(`  ${e.trim()}`);
  }
  lines.push("");
}

export function formatTravelPolicyFull(p: TravelPolicyFull): string {
  const lines: string[] = [];
  const company = p.agencyId !== null ? `company #${p.agencyId}` : "all companies";
  lines.push(`Travel policy #${p.id}: ${p.name} — ${company}${p.editable ? "" : " (read-only)"}`);
  if (p.author) lines.push(`Created by: ${p.author.name}`);
  lines.push("");

  const deptScope = (p.departmentId ?? []).map((id) => `#${id}`);
  lines.push("Applies to:");
  lines.push(`  ${scopeSummary(p.userId ?? [], deptScope, p.roleId ?? [])}`);
  if ((p.departmentId ?? []).length > 0) {
    lines.push(`  Department admins ${p.departmentAdminIncluded ? "are" : "are not"} covered by the policy.`);
  }
  lines.push("");

  const g = p.general;
  lines.push("General:");
  lines.push(`  - Currency: ${g.currency}`);
  lines.push(`  - Out-of-policy handling: ${g.violation}${g.violationUserIds.length > 0 ? ` (${g.violationUserIds.length} approver(s))` : ""}`);
  lines.push(`  - Purchase approval: ${g.purchase}${g.purchaseUserIds.length > 0 ? ` (${g.purchaseUserIds.length} approver(s))` : ""}`);
  lines.push(`  - Split payment: ${g.splitPaymentEnabled ? "enabled" : "disabled"}`);
  lines.push("");

  const f = p.flight;
  const cabins: string[] = [];
  if (f.classEconomyOnly) cabins.push("economy only");
  if (f.classPremiumEconomyOnly) cabins.push("premium economy only");
  if (f.classBusinessOnly) cabins.push("business only");
  if (f.classFirstOnly) cabins.push("first only");
  pushSection(
    lines,
    "Flights",
    [
      gated("Max price one-way", f.maxPriceOneWay),
      gated("Max above cheapest option", f.maxAfterCheapestPrice, f.maxAfterCheapestMode === "percent" ? "%" : " (currency)"),
      gated("Book at least N days before departure", f.minDaysBeforeFlight),
      cabins.length > 0 ? `Cabin class: ${cabins.join(", ")}` : undefined,
      f.onlyWithLuggage ? "Only fares with luggage" : undefined,
      f.onlyWorkingDays ? "Working-day travel only" : undefined,
      f.onlyFullyRefundable ? "Fully refundable fares only" : undefined,
    ],
    cityOverrides(f.cityOverrides),
  );

  const h = p.hotel;
  pushSection(
    lines,
    "Hotels",
    [
      gated("Max price per night", h.maxPriceNightly),
      gated("Max stars", h.maxStars),
      h.propertyTypes.enabled && h.propertyTypes.types.length > 0
        ? `Allowed property types: ${h.propertyTypes.types.join(", ")}`
        : undefined,
      h.longStayPropertyTypes.enabled
        ? `Long-stay rule from ${h.longStayPropertyTypes.minNights || "?"} nights` +
          (h.longStayPropertyTypes.alsoBlock.length > 0 ? `; also blocked: ${h.longStayPropertyTypes.alsoBlock.join(", ")}` : "") +
          (h.longStayPropertyTypes.allowAnyway.length > 0 ? `; always allowed: ${h.longStayPropertyTypes.allowAnyway.join(", ")}` : "")
        : undefined,
      gated("Book at least N days before check-in", h.minDaysBeforeCheckin),
      h.onlyFullyRefundable ? "Fully refundable rates only" : undefined,
    ],
    cityOverrides(h.cityOverrides),
  );

  const r = p.railway;
  pushSection(lines, "Railway", [
    gated("Max price one-way", r.maxPriceOneWay),
    r.wagonTypes.length > 0 ? `Allowed wagon types: ${r.wagonTypes.join(", ")}` : undefined,
    gated("Book at least N days before trip", r.minDaysBeforeTrip),
  ]);

  const t = p.transfer;
  pushSection(lines, "Transfers", [
    gated("Max price", t.maxPrice),
    gated("Book at least N days before pickup", t.minDaysBefore),
  ]);

  return lines.join("\n").trimEnd();
}
