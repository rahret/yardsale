// Sale times are picked by the hour only, so stored times are snapped to "HH:00".
export const toHour = (t: string) => `${t.slice(0, 2)}:00`;

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: `${String(h).padStart(2, "0")}:00`,
  label: `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`,
}));
