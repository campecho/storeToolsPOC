"use client";

import { useRouter } from "next/navigation";
import { ChevronUp, Clock } from "lucide-react";
import { useFeedbackStore, selectUnreadCount } from "@/store";
import { decorateNotification, notificationDestination } from "@/lib/notifications";
import { useOverlayTransition } from "@/lib/use-overlay-transition";
import { SparkStar } from "@/components/ui/SparkStar";
import type { AppNotification } from "@/schema";

/**
 * Notifications dropdown (wire view 6) — 384px, top-right, popIn/popOut: kind
 * icons in tinted bubbles, action links, unread dots. Tapping a row marks it
 * read and routes by kind: shipped → celebrate moment, release-tied → the
 * release note, everything else → the item on the board.
 */
export function NotificationsDropdown() {
  const router = useRouter();
  const open = useFeedbackStore((s) => s.notifOpen);
  const notifications = useFeedbackStore((s) => s.notifications);
  const unread = useFeedbackStore(selectUnreadCount);
  const celebrations = useFeedbackStore((s) => s.celebrations);
  const closeNotif = useFeedbackStore((s) => s.closeNotif);
  const markRead = useFeedbackStore((s) => s.markRead);
  const openCelebrate = useFeedbackStore((s) => s.openCelebrate);
  const goToNotifiedItem = useFeedbackStore((s) => s.goToNotifiedItem);

  const phase = useOverlayTransition(open, 190);
  const closing = phase === "closing";
  if (phase === "closed") return null;

  const see = (n: AppNotification) => {
    markRead(n.id);
    const dest = notificationDestination(n, celebrations);
    if (dest.type === "celebrate") {
      openCelebrate([{ itemId: dest.itemId, release: dest.release }]);
    } else if (dest.type === "releases") {
      closeNotif();
      router.push("/feedback/releases");
    } else {
      goToNotifiedItem(dest.itemId);
      router.push("/feedback/board");
    }
  };

  return (
    <>
      {!closing && <div className="fixed inset-0 z-30" onClick={closeNotif} />}
      <div
        data-testid="notif-dropdown"
        className={`fixed right-2 top-[56px] z-[31] w-[calc(100vw-16px)] max-w-[384px] overflow-hidden rounded-[11px] border border-[#e2e2e2] bg-white shadow-[0_16px_44px_rgba(0,0,0,.2)] sm:right-16 sm:w-[384px] ${
          closing ? "pointer-events-none animate-pop-out" : "animate-pop-in"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-[13px]">
          <span className="text-[14px] font-bold text-ink">Notifications</span>
          <span className="text-[11px] text-[#999]">{unread} unread</span>
        </div>
        <div className="max-h-[420px] overflow-auto">
          {notifications.map((n) => {
            const decor = decorateNotification(n);
            return (
              <button
                type="button"
                key={n.id}
                data-testid={`notif-${n.id}`}
                onClick={() => see(n)}
                className={`flex w-full cursor-pointer gap-[11px] border-b border-[#f4f4f4] px-4 py-[13px] text-left hover:bg-[#f7f7f7] ${
                  n.unread ? "bg-[#fcfaf7]" : "bg-white"
                }`}
              >
                <div
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]"
                  style={{ background: decor.iconBg }}
                >
                  {n.kind === "shipped" && <SparkStar size={16} className="text-brand" />}
                  {n.kind === "status" && <Clock size={16} strokeWidth={2} className="text-info" />}
                  {n.kind === "backed" && <ChevronUp size={16} strokeWidth={2.2} className="text-success" />}
                </div>
                <div className="flex-1">
                  <div className="text-[12px] leading-[1.45] text-[#3a3a3a]">{n.text}</div>
                  <div className="mt-[5px] text-[11px] font-semibold text-info">{decor.action}</div>
                </div>
                {n.unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
