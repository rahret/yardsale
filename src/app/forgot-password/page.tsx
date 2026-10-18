"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { siteOrigin } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const siteUrl = siteOrigin(window.location.origin);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteUrl}/auth/callback?redirectTo=/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border-2 border-cardboard-dark rounded-2xl p-7 shadow-tag">
        <div className="font-marker text-3xl text-marker -rotate-1 mb-1">Yard Sale QR</div>
        {sent ? (
          <>
            <div className="text-4xl my-2">📬</div>
            <p className="text-sm opacity-75">
              If an account exists for <strong>{email}</strong>, we sent it a link to reset your password.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm opacity-70 mb-6">
              Enter your account email and we&apos;ll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold opacity-70 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg"
                  placeholder="you@example.com"
                />
              </div>
              {error && <div className="text-marker text-sm font-semibold">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-grass text-white font-bold py-3 rounded-lg shadow-tag disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <p className="text-sm opacity-70 mt-5 text-center">
          <Link href="/login" className="text-grass-dark font-semibold underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
