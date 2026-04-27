import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Subscription = {
  id: string;
  full_name: string;
  email: string;
  whatsapp: string | null;
  country: string | null;
  city: string | null;
  plan_name: string;
  amount: number | null;
  currency: string;
  next_payment_date: string | null;
  reminder_days: number[] | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("PAYMENT_REMINDERS_CRON_SECRET") ?? "";
const FROM_EMAIL = Deno.env.get("PAYMENT_REMINDERS_FROM") ?? "Olon Society Academy <no-reply@olonsocietyacademy.com>";
const REPLY_TO = Deno.env.get("PAYMENT_REMINDERS_REPLY_TO") ?? "infolonsocietyacademy@gmail.com";
const BUSINESS_TIME_ZONE = Deno.env.get("PAYMENT_REMINDERS_TIME_ZONE") ?? "America/Puerto_Rico";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function authorizeRequest(req: Request) {
  const authorizationToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const cronSecretHeader = req.headers.get("x-cron-secret") || "";
  const providedSecret = cronSecretHeader || authorizationToken;

  if (CRON_SECRET && providedSecret === CRON_SECRET) {
    return { ok: true, type: "cron" };
  }

  if (authorizationToken) {
    const { data, error } = await supabase.auth.getUser(authorizationToken);
    if (!error && data.user) return { ok: true, type: "admin", userId: data.user.id };
  }

  return { ok: false, type: "none" };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((to - from) / 86400000);
}

function money(subscription: Subscription) {
  if (subscription.amount === null || Number.isNaN(Number(subscription.amount))) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: subscription.currency || "USD",
  }).format(Number(subscription.amount));
}

function subjectFor(daysUntil: number, planName: string) {
  if (daysUntil === 0) return `Tu pago de ${planName} vence hoy`;
  if (daysUntil === 1) return `Tu pago de ${planName} vence mañana`;
  return `Recordatorio: tu pago de ${planName} vence en ${daysUntil} dias`;
}

function emailText(subscription: Subscription, daysUntil: number) {
  const amount = money(subscription);
  const dueLine = `Fecha de pago: ${subscription.next_payment_date}`;
  const amountLine = amount ? `Monto: ${amount}` : "";
  const when =
    daysUntil === 0
      ? "vence hoy"
      : daysUntil === 1
        ? "vence mañana"
        : `vence en ${daysUntil} dias`;

  return [
    `Hola ${subscription.full_name},`,
    "",
    `Te recordamos que tu suscripcion de ${subscription.plan_name} ${when}.`,
    dueLine,
    amountLine,
    "",
    "Si ya realizaste el pago, puedes ignorar este mensaje.",
    "",
    "Olon Society Academy",
  ].filter(Boolean).join("\n");
}

function emailHtml(subscription: Subscription, daysUntil: number) {
  const amount = money(subscription);
  const when =
    daysUntil === 0
      ? "vence hoy"
      : daysUntil === 1
        ? "vence mañana"
        : `vence en ${daysUntil} dias`;

  return `
    <div style="margin:0;background:#fbfaf4;padding:28px;font-family:Arial,sans-serif;color:#07111d">
      <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #d9e0e4;border-radius:16px;overflow:hidden">
        <div style="background:#05101d;color:#fff;padding:28px">
          <h1 style="margin:0;font-size:24px">Olon Society Academy</h1>
          <p style="margin:8px 0 0;color:#f7d66b;font-weight:700">Recordatorio de suscripcion</p>
        </div>
        <div style="padding:28px;line-height:1.6">
          <p>Hola <strong>${subscription.full_name}</strong>,</p>
          <p>Te recordamos que tu suscripcion de <strong>${subscription.plan_name}</strong> ${when}.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr>
              <td style="padding:12px;border:1px solid #d9e0e4;background:#f5f7f8">Fecha de pago</td>
              <td style="padding:12px;border:1px solid #d9e0e4"><strong>${subscription.next_payment_date}</strong></td>
            </tr>
            ${amount ? `<tr><td style="padding:12px;border:1px solid #d9e0e4;background:#f5f7f8">Monto</td><td style="padding:12px;border:1px solid #d9e0e4"><strong>${amount}</strong></td></tr>` : ""}
          </table>
          <p>Si ya realizaste el pago, puedes ignorar este mensaje.</p>
          <p style="color:#5d697a;font-size:13px">Este correo fue enviado automaticamente desde no-reply@olonsocietyacademy.com.</p>
        </div>
      </div>
    </div>
  `;
}

async function alreadySent(subscriptionId: string, dueDate: string, reminderDay: number) {
  const { data, error } = await supabase
    .from("payment_reminder_events")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("payment_due_date", dueDate)
    .eq("reminder_day", reminderDay)
    .eq("status", "sent")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function logReminder(
  subscription: Subscription,
  reminderDay: number,
  status: "sent" | "failed" | "skipped",
  resendId?: string,
  errorMessage?: string,
) {
  await supabase.from("payment_reminder_events").insert({
    subscription_id: subscription.id,
    payment_due_date: subscription.next_payment_date,
    reminder_day: reminderDay,
    email_to: subscription.email,
    status,
    resend_id: resendId ?? null,
    error_message: errorMessage ?? null,
  });
}

async function sendEmail(subscription: Subscription, daysUntil: number) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [subscription.email],
      reply_to: REPLY_TO,
      subject: subjectFor(daysUntil, subscription.plan_name),
      html: emailHtml(subscription, daysUntil),
      text: emailText(subscription, daysUntil),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `Resend error ${response.status}`);
  }
  return payload?.id as string | undefined;
}

async function dailyRemindersEnabled() {
  const { data, error } = await supabase
    .from("payment_reminder_settings")
    .select("daily_enabled")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    console.warn("No reminder settings found, defaulting to enabled:", error.message);
    return true;
  }
  return data?.daily_enabled !== false;
}

function testSubscription(body: Record<string, unknown>, today: string): Subscription {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    full_name: String(body.fullName || body.name || "Prueba Olon"),
    email: String(body.email || ""),
    whatsapp: null,
    country: null,
    city: null,
    plan_name: String(body.planName || "VIP Regular"),
    amount: body.amount === "" || body.amount === undefined ? null : Number(body.amount),
    currency: String(body.currency || "USD"),
    next_payment_date: String(body.nextPaymentDate || today),
    reminder_days: [0],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    return json({ error: "Missing required environment variables" }, 500);
  }

  const auth = await authorizeRequest(req);
  if (!auth.ok) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const dryRun = Boolean(body?.dryRun);
  const today = todayInTimeZone(BUSINESS_TIME_ZONE);
  const endDate = addDays(today, 7);

  if (action === "sendTestEmail") {
    const subscription = testSubscription(body, today);
    if (!subscription.email || !subscription.email.includes("@")) {
      return json({ error: "Missing valid test email" }, 400);
    }
    const daysUntil = daysBetween(today, subscription.next_payment_date || today);
    const resendId = await sendEmail(subscription, daysUntil);
    return json({ status: "sent", test: true, email: subscription.email, resendId });
  }

  const dailyEnabled = await dailyRemindersEnabled();
  const force = Boolean(body?.force);
  if (!dailyEnabled && !dryRun && !force) {
    return json({ today, checked: 0, status: "disabled", results: [] });
  }

  const { data: subscriptions, error } = await supabase
    .from("student_subscriptions")
    .select("*")
    .eq("status", "active")
    .not("email", "is", null)
    .not("next_payment_date", "is", null)
    .gte("next_payment_date", today)
    .lte("next_payment_date", endDate)
    .order("next_payment_date", { ascending: true });

  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const subscription of (subscriptions || []) as Subscription[]) {
    const dueDate = subscription.next_payment_date;
    if (!dueDate) continue;

    const daysUntil = daysBetween(today, dueDate);
    const reminderDays = subscription.reminder_days || [7, 3, 1, 0];
    if (!reminderDays.includes(daysUntil)) continue;

    if (await alreadySent(subscription.id, dueDate, daysUntil)) {
      results.push({ id: subscription.id, email: subscription.email, status: "skipped", reason: "already_sent" });
      continue;
    }

    if (dryRun) {
      results.push({ id: subscription.id, email: subscription.email, status: "dry_run", daysUntil });
      continue;
    }

    try {
      const resendId = await sendEmail(subscription, daysUntil);
      await logReminder(subscription, daysUntil, "sent", resendId);
      await supabase
        .from("student_subscriptions")
        .update({
          last_reminder_sent_for: dueDate,
          last_reminder_sent_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);
      results.push({ id: subscription.id, email: subscription.email, status: "sent", daysUntil, resendId });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      await logReminder(subscription, daysUntil, "failed", undefined, message);
      results.push({ id: subscription.id, email: subscription.email, status: "failed", daysUntil, error: message });
    }
  }

  return json({ today, dailyEnabled, checked: subscriptions?.length || 0, results });
});
