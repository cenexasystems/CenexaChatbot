"use client";
import { useParams } from "next/navigation";
import { ChatView } from "@/components/cx/inbox/ChatView";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatView key={id} id={id} />;
}
