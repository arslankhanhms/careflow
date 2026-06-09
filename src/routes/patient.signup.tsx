import { createFileRoute, redirect } from "@tanstack/react-router";

// Patient signup is deprecated — accounts are auto-created on first booking via CNIC.
export const Route = createFileRoute("/patient/signup")({
  beforeLoad: () => { throw redirect({ to: "/find-doctor" }); },
  component: () => null,
});
