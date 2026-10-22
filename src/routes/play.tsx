import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

// The reference game (apps/game): plays a saved map the way the shipped game will.
//   /play?map=/maps/<id>.map.json&theme=winter
export const Route = createFileRoute("/play")({
  head: () => ({ meta: [{ title: "Play · TD Map Maker" }] }),
  component: Play,
});

function Play() {
  return (
    <ClientOnly fallback={<div className="h-screen w-screen bg-[#101820]" />}>
      <Game />
    </ClientOnly>
  );
}

function Game() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("@tdmm/game/start").then(({ startGame }) => {
      if (cancelled || !host.current) return;
      stop = startGame(host.current, {
        mapUrl: params.get("map") ?? "/maps/phase0-meadow.map.json",
        theme: params.get("theme") ?? undefined,
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return <div ref={host} className="h-screen w-screen overflow-hidden bg-[#101820]" />;
}
