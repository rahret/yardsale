"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { siteOrigin } from "@/lib/utils";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const siteUrl = siteOrigin(window.location.origin);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split("@")[0] },
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white border-2 border-cardboard-dark rounded-2xl p-7 shadow-tag text-center">
          <div className="text-4xl mb-2">📬</div>
          <div className="font-marker text-2xl text-marker mb-2">Check your email</div>
          <p className="text-sm opacity-75">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your
            account, then come back and log in.
          </p>
          <Link href="/login" className="inline-block mt-5 text-grass-dark font-semibold underline text-sm">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border-2 border-cardboard-dark rounded-2xl p-7 shadow-tag">
        <div className="font-marker text-3xl text-marker -rotate-1 mb-1">Garage Sale HQ</div>
        <p className="text-sm opacity-70 mb-6">Create an account to build your own sale.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold opacity-70 mb-1">Your name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg"
              placeholder="Jamie"
            />
          </div>
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
          <div>
            <label className="block text-xs font-bold opacity-70 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg"
              placeholder="At least 6 characters"
            />
          </div>
          {error && <div className="text-marker text-sm font-semibold">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-grass text-white font-bold py-3 rounded-lg shadow-tag disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-sm opacity-70 mt-5 text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-grass-dark font-semibold underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
