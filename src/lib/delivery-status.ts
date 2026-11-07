export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export type DeliveryStatusEvent = {
  id?: unknown;
  status?: unknown;
  errors?: Array<{ code?: unknown }>;
};

export type DeliveryStatusUpdate = {
  messageId: string;
  status: WhatsAppDeliveryStatus;
  errorCode: string | null;
  eligiblePreviousStatuses: WhatsAppDeliveryStatus[];
};

const ELIGIBLE_PREVIOUS: Record<WhatsAppDeliveryStatus, WhatsAppDeliveryStatus[]> = {
  sent: ["sent"],
  failed: ["sent", "failed"],
  delivered: ["sent", "failed", "delivered"],
  read: ["sent", "failed", "delivered", "read"],
};

/** Convert a Meta status object into a monotonic update for one outbound message. */
export function parseDeliveryStatusEvent(event: DeliveryStatusEvent): DeliveryStatusUpdate | null {
  if (typeof event.id !== "string" || !event.id) return null;
  if (event.status !== "sent" && event.status !== "delivered" && event.status !== "read" && event.status !== "failed") {
    return null;
  }

  const errorCode = event.status === "failed" && event.errors?.[0]?.code != null
    ? String(event.errors[0].code)
    : null;

  return {
    messageId: event.id,
    status: event.status,
    errorCode,
    eligiblePreviousStatuses: ELIGIBLE_PREVIOUS[event.status],
  };
}
