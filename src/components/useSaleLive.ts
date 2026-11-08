"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FALLBACK_POLL_MS, SAFETY_POLL_MS, type LiveMode } from "@/lib/liveUpdates";

/** Calls `onChange` whenever a buyer (or anyone) changes this sale's items,
 * holds or orders, using Supabase Realtime. If live updates can't connect it
 * falls back to checking every 15 seconds; even when connected it checks once
 * a minute as a safety net (e.g. if a table isn't published for Realtime), and
 * it always checks when the page comes back into view (phones drop
 * connections while asleep). Bursts of changes are batched into one call. */
export function useSaleLive(saleId: string, onChange: () => void): LiveMode {
  const [mode, setMode] = useState<LiveMode>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), 400);
    };
    const check = () => {
      if (document.visibilityState === "visible") onChangeRef.current();
    };
    const startPolling = () => {
      if (poll) return;
      setMode("polling");
      poll = setInterval(check, FALLBACK_POLL_MS);
    };
    const stopPolling = () => {
      clearInterval(poll);
      poll = undefined;
    };
    const safety = setInterval(check, SAFETY_POLL_MS);

    const filter = `sale_id=eq.${saleId}`;
    const connect = async () => {
      // join as the signed-in seller: holds and orders are only visible to the
      // sale's owner, so a connection made before the session has loaded (as
      // an anonymous visitor) would never hear about them
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
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
    };
    connect().catch(startPolling);
    // if it hasn't connected after a while, don't leave the seller waiting
    const giveUp = setTimeout(() => {
      if (channel?.state !== "joined") startPolling();
    }, 10_000);

    document.addEventListener("visibilitychange", check);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(giveUp);
      clearInterval(safety);
      stopPolling();
      document.removeEventListener("visibilitychange", check);
      if (channel) supabase.removeChannel(channel);
    };
  }, [saleId]);

  return mode;
}
