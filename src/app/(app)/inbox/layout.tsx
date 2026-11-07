"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ConversationList } from "@/components/cx/inbox/ConversationList";
import { cx } from "@/components/cx/ui";

// Phones: list OR chat. Tablet and up: list beside chat.
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const selectedId = params.id ?? null;
  return (
    <div className="h-full flex">
      <div className={cx("w-full md:w-[340px] lg:w-[380px] shrink-0 md:border-r border-line", selectedId && "hidden md:block")}>
        <Suspense>
          <ConversationList selectedId={selectedId} />
        </Suspense>
      </div>
      <div className={cx("flex-1 min-w-0", !selectedId && "hidden md:block")}>
        <Suspense>{children}</Suspense>
      </div>
    </div>
  );
}
