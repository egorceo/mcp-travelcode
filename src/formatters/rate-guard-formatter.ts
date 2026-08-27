import { RateGuardSection, RateGuardSettings } from "../client/types.js";

function formatSection(title: string, s: RateGuardSection, d: RateGuardSection): string[] {
  return [
    `${title}: ${s.enabled ? "enabled" : "disabled"}`,
    "  Thresholds (effective / default):",
    `    - Min savings, percent:        ${s.savingPercent} / ${d.savingPercent}`,
    `    - Min savings, USD:            ${s.savingAmountUsd} / ${d.savingAmountUsd}`,
    `    - Cancel-deadline shift, days: ${s.maxEarlierCancelShiftDays} / ${d.maxEarlierCancelShiftDays}`,
    `    - Min days before check-in:    ${s.minDaysBeforeCheckin} / ${d.minDaysBeforeCheckin}`,
  ];
}

export function formatRateGuardSettings(s: RateGuardSettings): string {
  const lines: string[] = [];
  lines.push(s.canEdit ? "Editing: allowed (pro plan / admin)" : "Editing: locked — read-only (Pro plan required)");
  lines.push("");
  lines.push(...formatSection("Email notifications", s.email, s.defaults.email));
  lines.push("");
  lines.push(...formatSection("Auto rebook", s.autoRebook, s.defaults.autoRebook));
  lines.push("");

  if (s.updatedAt === null) {
    lines.push("Status: no row stored yet — defaults are being used.");
  } else {
    const when = new Date(s.updatedAt * 1000).toISOString().replace("T", " ").slice(0, 19);
    lines.push(`Last update: ${when} UTC by user #${s.updatedBy ?? "?"}`);
  }

  return lines.join("\n");
}
