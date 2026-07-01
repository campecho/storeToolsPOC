import type { ItemComment } from "@/schema";

/** Simple, non-threaded comments list (wire): avatar, store number, text. */
export function CommentsList({ comments }: { comments: ItemComment[] }) {
  if (!comments.length) return null;
  return (
    <>
      <div className="mb-[11px] text-[11px] font-bold uppercase tracking-[.03em] text-[#5f5f5f]">Comments</div>
      <div className="flex flex-col gap-[9px]">
        {comments.map((c, idx) => (
          <div key={idx} className="flex gap-[9px]">
            <div className="h-[26px] w-[26px] shrink-0 rounded-full bg-[#e2e2e2]" />
            <div className="flex-1">
              <span className="text-[11px] font-bold text-[#555]">Store {c.store}</span>
              <div className="mt-[2px] text-[12px] leading-[1.45] text-[#666]">{c.text}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
