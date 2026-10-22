import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The map editor (apps/map-editor) runs Phaser, which needs the browser's DOM and WebGL, so it is
// loaded on the client only and never server-rendered.
const MapEditor = lazy(() => import("@tdmm/map-editor/app"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TD Map Maker" },
      { name: "description", content: "Map editor for the tower defense game." },
    ],
  }),
  component: Index,
});

function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#14181d] text-sm text-[#8d98a6]">
      Loading the map editor…
    </main>
  );
}

function Index() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <MapEditor gameUrl="/play" />
      </Suspense>
    </ClientOnly>
  );
}
