import { createFileRoute } from "@tanstack/react-router";
import { MessagesInbox } from "@/components/messages-inbox";

export const Route = createFileRoute("/hospital/$slug/messages")({
  head: () => ({ meta: [{ title: "Messages — MediFlow AI" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  const { slug } = Route.useParams();
  return <MessagesInbox slug={slug} />;
}
