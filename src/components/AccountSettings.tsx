"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AccountBilling, PaymentOptions, Profile } from "@/lib/types";
import { passwordError, siteOrigin } from "@/lib/utils";
import PasswordRules from "@/components/PasswordRules";
import PlanOptions from "@/components/PlanOptions";
import UpgradeDialog from "@/components/UpgradeDialog";
import ChangePlanDialog from "@/components/ChangePlanDialog";
import { LOCKED_IN_TRIAL, PRICES, accessFor, hasLiveSubscription } from "@/lib/billing";

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
  billingNotice,
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
  /** ?billing=… after Checkout or a billing action. */
  billingNotice?: string;
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
      <PlanSection billing={billing} saleCount={saleCount} notice={billingNotice} detail={stripeDetail} />
      <GettingPaidSection
        initialProfile={initialProfile}
        billing={billing}
        stripeNotice={stripeNotice}
        stripeDetail={stripeDetail}
      />
      <DangerZone email={email} billing={billing} />
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

const BILLING_NOTICES: Record<string, { text: string; ok: boolean }> = {
  subscribed: { text: "You're all set — thanks for subscribing!", ok: true },
  pass: { text: "Your Sale Pass is active — everything is unlocked.", ok: true },
  upgraded: { text: "Trial ended early — everything is unlocked now.", ok: true },
  switched: { text: "Your plan has been changed.", ok: true },
  "same-plan": { text: "You're already on that plan.", ok: false },
  success: { text: "Thanks! Your plan will update in a moment — refresh if it doesn't.", ok: true },
  canceled: { text: "Checkout canceled — nothing was charged.", ok: false },
  already: { text: "You already have a subscription — use Manage billing to change it.", ok: false },
  unavailable: { text: "Plans aren't switched on for this site yet.", ok: false },
  error: { text: "Something went wrong talking to Stripe — please try again.", ok: false },
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

function PlanSection({
  billing,
  saleCount,
  notice,
  detail,
}: {
  billing: AccountBilling | null;
  saleCount: number;
  notice?: string;
  detail?: string;
}) {
  const access = accessFor(billing);
  const status = billing?.subscription_status;
  const subscribed = hasLiveSubscription(billing);
  const passEnds = billing?.pass_expires_at && new Date(billing.pass_expires_at) > new Date() ? fmtDate(billing.pass_expires_at) : null;
  const periodEnd = fmtDate(billing?.current_period_end);
  const trialEnds = fmtDate(billing?.trial_ends_at);
  const interval = billing?.billing_interval === "year" ? PRICES.year.label : PRICES.month.label;
  const shownNotice = notice ? BILLING_NOTICES[notice] : undefined;

  let title: string;
  let line: string | null = null;
  if (billing?.plan === "comp") {
    title = "Pro (complimentary)";
  } else if (status === "trialing" && passEnds) {
    // subscribed while a Sale Pass was running: billing starts when it ends
    title = "Sale Pass";
    line = billing?.cancel_at_period_end
      ? `Everything unlocked until ${passEnds}. Your Pro plan is canceled and won't start.`
      : `Everything unlocked until ${passEnds}. Then Pro (${billing?.billing_interval === "year" ? "yearly" : "monthly"}) starts at ${interval}.`;
  } else if (status === "trialing") {
    title = "Free trial";
    line = billing?.cancel_at_period_end
      ? `Canceled — ends ${trialEnds}. You won't be charged.`
      : `Ends ${trialEnds}, then ${interval}.`;
  } else if (subscribed) {
    title = billing?.billing_interval === "year" ? "Pro (yearly)" : "Pro (monthly)";
    line = billing?.cancel_at_period_end ? `Canceled — ends ${periodEnd}.` : `Renews ${periodEnd} · ${interval}.`;
  } else if (passEnds) {
    title = "Sale Pass";
    line = `Everything unlocked until ${passEnds}.`;
  } else {
    title = "No plan";
    line = billing?.trial_used
      ? "Your sales stay up, but you can't add sales or items, and Holds, Buy Now and Find yard sales are off."
      : "Start your free trial to create your first sale.";
  }

  return (
    <Card title="⭐ Plan & billing" id="plan">
      {shownNotice && (
        <div
          className={`text-xs font-semibold rounded-lg px-3 py-2 mb-3 ${
            shownNotice.ok ? "bg-grass/15 text-grass-dark" : "bg-sun/30"
          }`}
        >
          {shownNotice.text}
          {notice === "error" && detail && <span className="block font-normal mt-0.5">Details: {detail}</span>}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold opacity-70">Current plan</div>
          <div className="text-lg font-bold">{title}</div>
          {line && <div className="text-xs opacity-70">{line}</div>}
          {passEnds && subscribed && status !== "trialing" && <div className="text-xs opacity-70">Sale Pass also active until {passEnds}.</div>}
        </div>
        <div className="text-xs opacity-70">
          {saleCount} {saleCount === 1 ? "sale" : "sales"} created
        </div>
      </div>

      {status === "past_due" && (
        <div className="text-xs font-semibold bg-marker/10 text-marker rounded-lg px-3 py-2 mb-3">
          Your last payment didn&apos;t go through. Update your card in Manage billing to keep Pro.
        </div>
      )}

      {access === "trial" && (
        <div className="bg-chalk border-2 border-cardboard-dark/50 rounded-lg p-3 mb-3">
          <div className="text-xs font-bold opacity-70 mb-1">Locked during the trial</div>
          <ul className="text-sm space-y-0.5 mb-3">
            {LOCKED_IN_TRIAL.map((f) => (
              <li key={f}>🔒 {f}</li>
            ))}
          </ul>
          <UpgradeDialog currentInterval={billing?.billing_interval ?? null} />
        </div>
      )}

      {subscribed && access === "full" && billing?.plan !== "comp" && !billing?.cancel_at_period_end && (
        <div className="mb-3">
          <ChangePlanDialog
            currentInterval={billing?.billing_interval === "year" ? "year" : "month"}
            startsOn={status === "trialing" ? trialEnds : null}
          />
          <span className="block text-[11px] opacity-60 mt-1">Switch between monthly and yearly.</span>
        </div>
      )}

      {billing?.stripe_customer_id && (subscribed || billing.trial_used) && (
        <form action="/api/billing/portal" method="post" className="mb-3">
          <button type="submit" className="border-2 border-cardboard-dark bg-white font-bold px-4 py-2 rounded-lg text-sm">
            Manage billing
          </button>
          <span className="block text-[11px] opacity-60 mt-1">
            Update your card, see receipts, or cancel.
          </span>
        </form>
      )}

      {!subscribed && billing?.plan !== "comp" && (
        <PlanOptions billing={billing} returnTo="/dashboard/account#plan" />
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
          <form action="/api/stripe/dashboard" method="post" target="_blank" rel="noopener noreferrer">
            {/* Stripe's dashboard has no good way back here, so open it in a new tab */}
            <button type="submit" className="border-2 border-cardboard-dark bg-white font-bold px-4 py-2 rounded-lg text-sm">
              View payouts ↗
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

function DangerZone({ email, billing }: { email: string; billing: AccountBilling | null }) {
  const [open, setOpen] = useState(false);
  // Stripe would keep billing a deleted account (the database refuses too)
  const mustCancelFirst = hasLiveSubscription(billing) && !billing?.cancel_at_period_end;
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
      {mustCancelFirst ? (
        <p className="text-xs font-semibold bg-sun/30 rounded-lg px-3 py-2">
          Cancel your subscription first (Plan &amp; billing → Manage billing), then you can delete your account.
        </p>
      ) : !open ? (
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

function Card({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="bg-white border-2 border-cardboard-dark rounded-xl p-4 mb-4 scroll-mt-4">
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
