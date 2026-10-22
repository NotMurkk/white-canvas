import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home" },
      { name: "description", content: "A clean, empty landing page." },
      { property: "og:title", content: "Home" },
      { property: "og:description", content: "A clean, empty landing page." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return <main className="min-h-screen bg-background" />;
}
