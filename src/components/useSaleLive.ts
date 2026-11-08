"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FALLBACK_POLL_MS, type LiveMode } from "@/lib/liveUpdates";

/** Calls `onChange` whenever a buyer (or anyone) changes this sale's items,
 * holds or orders, using Supabase Realtime. If live updates can't connect it
 * falls back to checking every 15 seconds, and it always checks when the page
 * comes back into view (phones drop connections while asleep). Bursts of
 * changes are batched into one call. */
export function useSaleLive(saleId: string, onChange: () => void): LiveMode {
  const [mode, setMode] = useState<LiveMode>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), 400);
    };
    const startPolling = () => {
      if (poll) return;
      setMode("polling");
      poll = setInterval(() => {
        if (document.visibilityState === "visible") onChangeRef.current();
      }, FALLBACK_POLL_MS);
    };
    const stopPolling = () => {
      clearInterval(poll);
      poll = undefined;
    };

    const filter = `sale_id=eq.${saleId}`;
    const channel = supabase
      .channel(`sale-admin:${saleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter }, fire)
      .on("postgres_changes", { event: "*", schema: "public", table: "item_holds", filter }, fire)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter }, fire)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          stopPolling();
          setMode("live");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPolling();
        }
      });
    // if it hasn't connected after a while, don't leave the seller waiting
    const giveUp = setTimeout(() => {
      if (channel.state !== "joined") startPolling();
    }, 10_000);

    const onVisible = () => document.visibilityState === "visible" && onChangeRef.current();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      clearTimeout(giveUp);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [saleId]);

  return mode;
}
