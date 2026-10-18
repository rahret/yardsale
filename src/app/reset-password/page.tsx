"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { passwordError } from "@/lib/utils";
import PasswordRules from "@/components/PasswordRules";

// Reached from the password-reset email: /auth/callback exchanges the link's
// one-time code for a session, then redirects here to choose a new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setHasSession(!!data.user));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const pwError = passwordError(password);
    if (pwError) {
      setError(pwError);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border-2 border-cardboard-dark rounded-2xl p-7 shadow-tag">
        <div className="font-marker text-3xl text-marker -rotate-1 mb-1">Yard Sale QR</div>
        {hasSession === false ? (
          <>
            <p className="text-sm opacity-75 mt-3">
              This reset link is invalid or has expired. Request a new one to continue.
            </p>
            <Link
              href="/forgot-password"
              className="block text-center mt-5 bg-grass text-white font-bold py-3 rounded-lg shadow-tag"
            >
              Send a new link
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm opacity-70 mb-6">Choose a new password for your account.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold opacity-70 mb-1">New password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg"
                  maxLength={20}
                  autoComplete="new-password"
                />
                <PasswordRules password={password} />
              </div>
              <div>
                <label className="block text-xs font-bold opacity-70 mb-1">Confirm new password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg"
                  autoComplete="new-password"
                />
              </div>
              {error && <div className="text-marker text-sm font-semibold">{error}</div>}
              <button
                type="submit"
                disabled={loading || hasSession === null}
                className="w-full bg-grass text-white font-bold py-3 rounded-lg shadow-tag disabled:opacity-60"
              >
                {loading ? "Saving…" : "Save new password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
