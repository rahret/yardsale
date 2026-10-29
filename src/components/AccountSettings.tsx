"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AccountBilling, PaymentOptions, Profile } from "@/lib/types";
import { passwordError, siteOrigin } from "@/lib/utils";
import PasswordRules from "@/components/PasswordRules";

const PHOTO_BUCKET = "item-photos";

const PAYMENT_HANDLES: { key: Exclude<keyof PaymentOptions, "cash">; label: string; placeholder: string }[] = [
  { key: "venmo", label: "Venmo", placeholder: "@your-handle" },
  { key: "cashapp", label: "Cash App", placeholder: "$yourcashtag" },
  { key: "paypal", label: "PayPal", placeholder: "paypal.me/you or email" },
  { key: "zelle", label: "Zelle", placeholder: "Phone or email" },
];

export default function AccountSettings({
  email,
  pendingEmail,
  memberSince,
  initialProfile,
  fallbackDisplayName,
  billing,
  saleCount,
  stripeNotice,
  stripeDetail,
}: {
  email: string;
  pendingEmail: string;
  memberSince: string;
  initialProfile: Profile | null;
  fallbackDisplayName: string;
  billing: AccountBilling | null;
  saleCount: number;
  /** ?stripe=… after returning from Stripe onboarding. */
  stripeNotice?: string;
  /** Stripe's own explanation when setup failed. */
  stripeDetail?: string;
}) {
  return (
    <div className="p-5">
      <div className="mb-6">
        <a href="/dashboard" className="text-sm opacity-60 hover:opacity-90">
          ← Your sales
        </a>
        <div className="text-xl font-bold mt-1">Account</div>
      </div>

      <ProfileSection initialProfile={initialProfile} fallbackDisplayName={fallbackDisplayName} />
      <SecuritySection email={email} pendingEmail={pendingEmail} memberSince={memberSince} />
      <PlanSection billing={billing} saleCount={saleCount} />
      <GettingPaidSection
        initialProfile={initialProfile}
        billing={billing}
        stripeNotice={stripeNotice}
        stripeDetail={stripeDetail}
      />
      <DangerZone email={email} />
    </div>
  );
}

function ProfileSection({
  initialProfile,
  fallbackDisplayName,
}: {
  initialProfile: Profile | null;
  fallbackDisplayName: string;
}) {
  const [displayName, setDisplayName] = useState(initialProfile?.display_name || fallbackDisplayName);
  const [phone, setPhone] = useState(initialProfile?.phone || "");
  const [status, setStatus] = useState<Status>(null);

  async function save() {
    setStatus({ busy: true });
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setStatus({ error: "You're signed out — log in again." });

    const name = displayName.trim().slice(0, 50);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name, phone: phone.trim() })
      .eq("id", user.id);
    if (error) return setStatus({ error: error.message });
    // The dashboard greeting reads the name from auth metadata, so keep it in sync.
    const { error: metaError } = await supabase.auth.updateUser({ data: { display_name: name } });
    setStatus(metaError ? { error: metaError.message } : { ok: "Profile saved." });
  }

  return (
    <Card title="👤 Profile">
      <Field label="Your name">
        <input
          type="text"
          value={displayName}
          maxLength={50}
          onChange={(e) => setDisplayName(e.target.value)}
          className={INPUT}
          placeholder="Jamie"
        />
      </Field>
      <Field label="Phone (optional, private)">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={INPUT}
          placeholder="(555) 555-1234"
        />
      </Field>
      <SaveRow label="Save profile" status={status} onClick={save} />
    </Card>
  );
}

function SecuritySection({
  email,
  pendingEmail,
  memberSince,
}: {
  email: string;
  pendingEmail: string;
  memberSince: string;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<Status>(
    pendingEmail ? { ok: `Waiting for you to confirm ${pendingEmail} — check that inbox.` } : null
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwStatus, setPwStatus] = useState<Status>(null);

  async function changeEmail() {
    const next = newEmail.trim();
    if (!next || next === email) return setEmailStatus({ error: "Enter a different email address." });
    setEmailStatus({ busy: true });
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: `${siteOrigin(window.location.origin)}/auth/callback?redirectTo=/dashboard/account` }
    );
    if (error) return setEmailStatus({ error: error.message });
    setNewEmail("");
    setEmailStatus({ ok: `Check ${next} (and possibly ${email}) for a confirmation link to finish the change.` });
  }

  async function changePassword() {
    const pwError = passwordError(password);
    if (pwError) return setPwStatus({ error: pwError });
    if (password !== confirm) return setPwStatus({ error: "Passwords don't match." });
    setPwStatus({ busy: true });
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setPwStatus({ error: error.message });
    setPassword("");
    setConfirm("");
    setPwStatus({ ok: "Password updated." });
  }

  return (
    <Card title="🔐 Sign-in & security">
      <div className="text-sm mb-3">
        Signed in as <strong>{email}</strong>
        <div className="text-xs opacity-60">
          Member since {new Date(memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
      </div>

      <Field label="Change email">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className={INPUT}
          placeholder="new@example.com"
        />
      </Field>
      <SaveRow label="Update email" status={emailStatus} onClick={changeEmail} />

      <div className="border-t-2 border-dashed border-cardboard/60 my-4" />

      <Field label="New password">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
          maxLength={20}
          autoComplete="new-password"
        />
        <PasswordRules password={password} />
      </Field>
      <Field label="Confirm new password">
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={INPUT}
          autoComplete="new-password"
        />
      </Field>
      <SaveRow label="Change password" status={pwStatus} onClick={changePassword} />
    </Card>
  );
}

function PlanSection({ billing, saleCount }: { billing: AccountBilling | null; saleCount: number }) {
  const plan = billing?.plan || "free";
  const renews = billing?.current_period_end
    ? new Date(billing.current_period_end).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Card title="⭐ Plan & billing">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold opacity-70">Current plan</div>
          <div className="text-lg font-bold">{plan === "pro" ? "Pro" : "Free"}</div>
          {billing?.subscription_status && (
            <div className="text-xs opacity-70">
              Status: {billing.subscription_status.replace(/_/g, " ")}
              {renews && (billing.cancel_at_period_end ? ` · ends ${renews}` : ` · renews ${renews}`)}
            </div>
          )}
        </div>
        <div className="text-xs opacity-70">
          {saleCount} {saleCount === 1 ? "sale" : "sales"} created
        </div>
      </div>

      {plan === "pro" ? (
        <ComingSoonButton label="Manage subscription & invoices" />
      ) : (
        <div className="bg-chalk border-2 border-cardboard-dark/50 rounded-lg p-3">
          <div className="font-bold text-sm mb-1">Upgrade to Pro</div>
          <p className="text-xs opacity-70 mb-3">
            Paid plans are coming soon. Subscriptions will be billed securely through Stripe, and you&apos;ll
            be able to change or cancel anytime from here.
          </p>
          <ComingSoonButton label="Upgrade to Pro" primary />
        </div>
      )}
    </Card>
  );
}

const STRIPE_NOTICES: Record<string, string> = {
  returned: "Stripe setup complete — you can turn on Buy Now in each sale's settings.",
  unavailable: "Online payments aren't switched on for this site yet.",
  error: "Something went wrong talking to Stripe — please try again.",
};

function GettingPaidSection({
  initialProfile,
  billing,
  stripeNotice,
  stripeDetail,
}: {
  initialProfile: Profile | null;
  billing: AccountBilling | null;
  stripeNotice?: string;
  stripeDetail?: string;
}) {
  const [options, setOptions] = useState<PaymentOptions>(initialProfile?.payment_options || { cash: true });
  const [status, setStatus] = useState<Status>(null);

  async function save() {
    setStatus({ busy: true });
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setStatus({ error: "You're signed out — log in again." });

    const cleaned: PaymentOptions = { cash: !!options.cash };
    for (const { key } of PAYMENT_HANDLES) {
      const v = options[key]?.trim();
      if (v) cleaned[key] = v.slice(0, 100);
    }
    const { error } = await supabase.from("profiles").update({ payment_options: cleaned }).eq("id", user.id);
    setStatus(error ? { error: error.message } : { ok: "Payment options saved." });
  }

  const connected = !!billing?.stripe_connect_account_id;
  const cardsReady = connected && billing!.connect_charges_enabled && billing!.connect_payouts_enabled;

  return (
    <Card title="💵 Getting paid">
      <div className="text-xs font-bold opacity-70 mb-2">How buyers can pay you</div>
      <label className="flex items-center gap-2 text-sm mb-3">
        <input
          type="checkbox"
          checked={!!options.cash}
          onChange={(e) => setOptions({ ...options, cash: e.target.checked })}
        />
        Cash at pickup
      </label>
      <div className="grid sm:grid-cols-2 gap-x-3">
        {PAYMENT_HANDLES.map(({ key, label, placeholder }) => (
          <Field key={key} label={label}>
            <input
              type="text"
              value={options[key] || ""}
              onChange={(e) => setOptions({ ...options, [key]: e.target.value })}
              className={INPUT}
              placeholder={placeholder}
            />
          </Field>
        ))}
      </div>
      <SaveRow label="Save payment options" status={status} onClick={save} />

      <div className="border-t-2 border-dashed border-cardboard/60 my-4" />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="font-bold text-sm">Buy Now: card, Apple Pay, Google Pay &amp; Cash App Pay</div>
          <p className="text-xs opacity-70 mt-1">
            Let buyers pay online through Stripe, with payouts straight to your bank account. Turn on Buy Now
            for each sale in its settings.
          </p>
          <div className="text-xs font-semibold mt-1.5">
            {cardsReady ? (
              <span className="text-grass-dark">● Ready to accept payments</span>
            ) : connected ? (
              <span className="text-amber">● Setup incomplete</span>
            ) : (
              <span className="opacity-60">● Not set up</span>
            )}
          </div>
        </div>
        {cardsReady ? (
          <form action="/api/stripe/dashboard" method="post">
            <button type="submit" className="border-2 border-cardboard-dark bg-white font-bold px-4 py-2 rounded-lg text-sm">
              View payouts
            </button>
          </form>
        ) : (
          <form action="/api/stripe/connect" method="post">
            <button type="submit" className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm">
              {connected ? "Finish Stripe setup" : "Set up with Stripe"}
            </button>
          </form>
        )}
      </div>
      {stripeNotice && STRIPE_NOTICES[stripeNotice] && (
        <div
          className={`text-xs font-semibold mt-2 ${
            stripeNotice === "returned" ? "text-grass-dark" : "text-marker"
          }`}
        >
          {stripeNotice === "returned" && !cardsReady
            ? "Thanks! Stripe may need a few minutes — or a bit more info — before you can take payments."
            : STRIPE_NOTICES[stripeNotice]}
          {stripeNotice === "error" && stripeDetail && (
            <span className="block font-normal mt-0.5">Details: {stripeDetail}</span>
          )}
        </div>
      )}
    </Card>
  );
}

function DangerZone({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState<Status>(null);

  async function deleteAccount() {
    setStatus({ busy: true });
    const supabase = createClient();

    // Remove listing photos from Storage first — deleting the account cascades
    // the database rows, but not the files they point to.
    // Filter to this user's sales explicitly: RLS also lets anyone read photos
    // on other sellers' public sales.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setStatus({ error: "You're signed out — log in again." });
    const { data: sales, error: salesError } = await supabase.from("sales").select("id").eq("owner_id", user.id);
    if (salesError) return setStatus({ error: salesError.message });
    const saleIds = (sales || []).map((s) => s.id);
    let photos: { storage_path: string }[] = [];
    if (saleIds.length > 0) {
      const { data, error: photosError } = await supabase
        .from("item_photos")
        .select("storage_path, items!inner(sale_id)")
        .in("items.sale_id", saleIds);
      if (photosError) return setStatus({ error: photosError.message });
      photos = data || [];
    }
    const paths = photos.map((p) => p.storage_path);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100));
      if (error) return setStatus({ error: error.message });
    }

    const { error } = await supabase.rpc("delete_my_account");
    if (error) return setStatus({ error: error.message });
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="bg-white border-2 border-marker/60 rounded-xl p-4 mb-4">
      <h3 className="text-sm font-bold mb-1 text-marker">Delete account</h3>
      <p className="text-xs opacity-70 mb-3">
        Permanently deletes your account, all of your sales, items, and photos. This can&apos;t be undone.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-2 border-marker text-marker font-bold px-4 py-2 rounded-lg text-sm"
        >
          Delete my account…
        </button>
      ) : (
        <div>
          <Field label={`Type your email (${email}) to confirm`}>
            <input type="email" value={typed} onChange={(e) => setTyped(e.target.value)} className={INPUT} />
          </Field>
          <div className="flex gap-2 items-center flex-wrap">
            <button
              type="button"
              onClick={deleteAccount}
              disabled={typed.trim().toLowerCase() !== email.toLowerCase() || !!status?.busy}
              className="bg-marker text-white font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-40"
            >
              {status?.busy ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setStatus(null);
              }}
              className="text-sm font-semibold opacity-70 px-2"
            >
              Cancel
            </button>
          </div>
          {status?.error && <div className="text-marker text-xs font-semibold mt-2">{status.error}</div>}
        </div>
      )}
    </div>
  );
}

type Status = { busy?: boolean; ok?: string; error?: string } | null;

const INPUT = "w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg";

function SaveRow({ label, status, onClick }: { label: string; status: Status; onClick: () => void }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={onClick}
        disabled={!!status?.busy}
        className="bg-ink text-chalk font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {status?.busy ? "Saving…" : label}
      </button>
      {status?.ok && <span className="text-grass-dark text-xs font-semibold">{status.ok}</span>}
      {status?.error && <span className="text-marker text-xs font-semibold">{status.error}</span>}
    </div>
  );
}

function ComingSoonButton({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className={`font-bold px-4 py-2 rounded-lg text-sm opacity-50 cursor-not-allowed ${
        primary ? "bg-grass text-white" : "border-2 border-cardboard-dark bg-white"
      }`}
    >
      {label} <span className="text-[10px] uppercase tracking-wide">· soon</span>
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border-2 border-cardboard-dark rounded-xl p-4 mb-4">
      <h3 className="text-sm font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <label className="block text-xs font-bold opacity-70 mb-1">{label}</label>
      {children}
    </div>
  );
}
