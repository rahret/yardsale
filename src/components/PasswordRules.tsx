import { PASSWORD_RULES } from "@/lib/utils";

/** Live checklist of password requirements, shown under a new-password field. */
export default function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="mt-1.5 space-y-0.5 text-xs">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.label} className={ok ? "text-grass-dark font-semibold" : "opacity-60"}>
            <span aria-hidden>{ok ? "✓" : "○"}</span> {rule.label}
            <span className="sr-only">{ok ? " (met)" : " (not met)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
