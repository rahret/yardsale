"use client";

import { useState } from "react";

/** Opens the phone's native share sheet (Messages, Facebook, WhatsApp, …)
 * when the browser supports it; otherwise copies the link and says so. */
export default function ShareButton({
  url,
  title,
  text,
  label = "Share",
  className = "",
}: {
  url: string;
  title: string;
  text?: string;
  label?: string;
  className?: string;
}) {
  const [note, setNote] = useState("");

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url, title, text });
        return;
      } catch (e) {
        // user closed the share sheet — nothing to do
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied!");
    } catch {
      setNote("Couldn't copy — long-press the link instead.");
    }
    setTimeout(() => setNote(""), 2500);
  }

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={share} className={className}>
        {label}
      </button>
      {note && (
        <span
          role="status"
          className="absolute top-full mt-1 right-0 whitespace-nowrap text-[11px] font-bold bg-ink text-chalk px-2 py-1 rounded-md z-10"
        >
          {note}
        </span>
      )}
    </span>
  );
}
