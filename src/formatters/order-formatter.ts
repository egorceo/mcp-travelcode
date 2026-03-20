import {
  OrderList,
  OrderFull,
  CancelCheckResponse,
  CancelResult,
  ModifyCheckResponse,
  ModifyResult,
} from "../client/types.js";

export function formatOrderList(data: OrderList): string {
  const lines: string[] = [];

  lines.push(`Orders: showing ${data.items.length} of ${data.total} (offset ${data.offset})`);
  lines.push("");

  if (data.items.length === 0) {
    lines.push("No orders found.");
    return lines.join("\n");
  }

  for (const order of data.items) {
    const date = order.createdAt ? order.createdAt.split("T")[0] : "—";
    lines.push(`#${order.orderId} [${order.code}] | ${order.status} | ${order.totalPrice} ${order.currency} | payment: ${order.paymentStatus} | ${date}`);
  }

  return lines.join("\n");
}

export function formatOrderDetail(order: OrderFull): string {
  const lines: string[] = [];

  lines.push(`Order #${order.orderId} [${order.code}]`);
  lines.push(`Status: ${order.status} | Payment: ${order.paymentStatus}`);
  lines.push(`Total: ${order.totalPrice} ${order.currency}`);

  if (order.ticketingDeadline) {
    lines.push(`Ticketing deadline: ${order.ticketingDeadline}`);
  }

  // Passengers
  if (order.passengers && order.passengers.length > 0) {
    lines.push("");
    lines.push("Passengers:");
    for (const p of order.passengers) {
      lines.push(`  - ${p.firstName} ${p.lastName} (${p.type}, id: ${p.id})`);
    }
  }

  // Services
  if (order.services && order.services.length > 0) {
    lines.push("");
    lines.push("Services:");
    for (const s of order.services) {
      const price = s.priceGross > 0 ? ` | ${s.priceGross}` : "";
      const pnr = s.pnr ? ` | PNR: ${s.pnr}` : "";
      const ticket = s.ticketNumber ? ` | Ticket: ${s.ticketNumber}` : "";
      lines.push(`  - [${s.id}] ${s.title}`);
      lines.push(`    ${s.status} | ${s.date}${price}${pnr}${ticket}`);
    }
  }

  // Tickets
  if (order.tickets && order.tickets.length > 0) {
    lines.push("");
    lines.push("Tickets:");
    for (const t of order.tickets) {
      lines.push(`  - ${t.ticketNumber} (service ${t.serviceId}) | ${t.status}`);
    }
  }

  // Timestamps
  lines.push("");
  if (order.createdAt) lines.push(`Created: ${order.createdAt}`);
  if (order.updatedAt) lines.push(`Updated: ${order.updatedAt}`);

  return lines.join("\n");
}

export function formatCancelCheck(data: CancelCheckResponse, orderId: number): string {
  const lines: string[] = [];

  lines.push(`Cancel check for order #${orderId}`);

  if (!data.cancellable) {
    lines.push(`Result: NOT cancellable`);
    if (data.rules) lines.push(`Reason: ${data.rules}`);
    return lines.join("\n");
  }

  lines.push(`Result: cancellable`);

  if (data.refund) {
    lines.push(`Refund: ${data.refund.estimatedAmount} ${data.refund.currency} (${data.refund.type})`);
    if (data.refund.penalty > 0) {
      lines.push(`Penalty: ${data.refund.penalty} ${data.refund.currency}`);
    }
  }

  if (data.deadline) lines.push(`Deadline: ${data.deadline}`);
  if (data.rules) lines.push(`Rules: ${data.rules}`);

  return lines.join("\n");
}

export function formatCancelResult(data: CancelResult): string {
  const lines: string[] = [];

  lines.push(`Order #${data.orderId} — ${data.status}`);

  if (data.cancelledAt) {
    lines.push(`Cancelled at: ${data.cancelledAt}`);
  }

  if (data.refund) {
    lines.push(`Refund: ${data.refund.amount} ${data.refund.currency} (${data.refund.type})`);
    if (data.refund.penalty > 0) {
      lines.push(`Penalty: ${data.refund.penalty} ${data.refund.currency}`);
    }
  }

  return lines.join("\n");
}

export function formatModifyCheck(data: ModifyCheckResponse, orderId: number): string {
  const lines: string[] = [];

  lines.push(`Modify check for order #${orderId}`);

  if (!data.modifiable) {
    lines.push(`Result: NOT modifiable`);
    return lines.join("\n");
  }

  lines.push(`Result: modifiable`);

  if (data.services && data.services.length > 0) {
    lines.push("");
    for (const s of data.services) {
      lines.push(`Service ${s.serviceId}: ${s.title}`);
      lines.push(`  Allowed changes: ${s.allowedChanges.join(", ")}`);
    }
  }

  return lines.join("\n");
}

export function formatModifyResult(data: ModifyResult): string {
  return `Order #${data.orderId} — ${data.status}\nUse get_order to check the result after modification completes.`;
}
