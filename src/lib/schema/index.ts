import { z } from "zod";

/**
 * Data model from the handoff prototype
 * (docs/handoff/feedback-tracker/README.md — "State management" / "Data model").
 *
 * `status: 'done'` renders as "Fixed" for bugs and "Shipped" for features.
 * `votes` is the number of distinct backing stores (one vote per store).
 * `reports` are the preserved per-store originals — merges aggregate, never flatten.
 */

export const ItemTypeSchema = z.enum(["bug", "feature"]);
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const ItemStatusSchema = z.enum(["new", "planned", "done", "declined"]);
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

export const StoreReportSchema = z.object({
  store: z.string(),
  when: z.string(),
  name: z.string().nullable(),
  text: z.string(),
});
export type StoreReport = z.infer<typeof StoreReportSchema>;

export const ItemCommentSchema = z.object({
  store: z.string(),
  text: z.string(),
});
export type ItemComment = z.infer<typeof ItemCommentSchema>;

export const FeedbackItemSchema = z.object({
  id: z.number(),
  type: ItemTypeSchema,
  title: z.string(),
  desc: z.string(),
  area: z.string(),
  status: ItemStatusSchema,
  votes: z.number(),
  districts: z.number(),
  mine: z.boolean(),
  votedByMe: z.boolean(),
  followed: z.boolean(),
  inDistrict: z.boolean(),
  inRegion: z.boolean(),
  shippedIn: z.string().optional(),
  /** How many days ago this item's fix/feature shipped — drives the board's
      "Recently shipped" band (mock age, like the wires' other relative dates). */
  shippedDaysAgo: z.number().optional(),
  /** The store acknowledged this delivery in the "Recently shipped" band ("Got it"). */
  recentShipAcked: z.boolean().optional(),
  declineReason: z.string().optional(),
  comments: z.array(ItemCommentSchema),
  reports: z.array(StoreReportSchema),
});
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;

export const DeliveredItemSchema = z.object({
  id: z.number().nullable(),
  title: z.string(),
  stores: z.number(),
  yours: z.boolean(),
});
export type DeliveredItem = z.infer<typeof DeliveredItemSchema>;

export const ReleaseSchema = z.object({
  version: z.string(),
  date: z.string(),
  title: z.string(),
  summary: z.string(),
  yourStore: z.boolean(),
  latest: z.boolean(),
  features: z.array(DeliveredItemSchema),
  fixes: z.array(DeliveredItemSchema),
});
export type Release = z.infer<typeof ReleaseSchema>;

export const NotificationKindSchema = z.enum(["shipped", "status", "backed"]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const AppNotificationSchema = z.object({
  id: z.string(),
  kind: NotificationKindSchema,
  unread: z.boolean(),
  itemId: z.number(),
  release: z.string().nullable(),
  text: z.string(),
});
export type AppNotification = z.infer<typeof AppNotificationSchema>;

/** Status display metadata — label depends on item type at the delivery end. */
export function statusMeta(type: ItemType, status: ItemStatus): { label: string; dot: string } {
  if (status === "new") return { label: "New", dot: "#9a9a9a" };
  if (status === "planned") return { label: "Planned", dot: "#086DD2" };
  if (status === "done") return { label: type === "bug" ? "Fixed" : "Shipped", dot: "#2e8b3d" };
  return { label: type === "bug" ? "Closed" : "Declined", dot: "#bcbcbc" };
}
