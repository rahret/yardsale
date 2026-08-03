"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(searchParams.get("redirectTo") || "/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border-2 border-cardboard-dark rounded-2xl p-7 shadow-tag">
        <div className="font-marker text-3xl text-marker -rotate-1 mb-1">Garage Sale HQ</div>
        <p className="text-sm opacity-70 mb-6">Log in to manage your sale.</p>

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
          <div>
            <label className="block text-xs font-bold opacity-70 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg"
              placeholder="••••••••"
            />
          </div>
          {error && <div className="text-marker text-sm font-semibold">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-grass text-white font-bold py-3 rounded-lg shadow-tag disabled:opacity-60"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="text-sm opacity-70 mt-5 text-center">
          New here?{" "}
          <Link href="/signup" className="text-grass-dark font-semibold underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
