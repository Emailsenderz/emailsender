import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SchedulePayload {
  campaign_id: string;
  user_id?: string;
  recipients: string[];
  variants: { id: string; subject: string; body: string }[];
  prospect_data: Record<string, Record<string, string>>;
  daily_start: string;
  daily_end: string;
  interval_minutes: number;
}

function replaceVariables(
  text: string,
  data: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || "");
}

function computeSendTimes(
  count: number,
  dailyStartHour: number,
  dailyStartMin: number,
  dailyEndHour: number,
  dailyEndMin: number,
  intervalMinutes: number,
  tzOffsetMinutes: number
): Date[] {
  const times: Date[] = [];

  const nowUtc = new Date();
  const nowLocal = new Date(nowUtc.getTime() + tzOffsetMinutes * 60000);

  const localToUtc = (d: Date) =>
    new Date(d.getTime() - tzOffsetMinutes * 60000);

  const windowCrossesMidnight = dailyEndHour < dailyStartHour ||
    (dailyEndHour === dailyStartHour && dailyEndMin <= dailyStartMin);

  const isWithinWindow = (d: Date) => {
    const h = d.getHours();
    const m = d.getMinutes();
    const current = h * 60 + m;
    const start = dailyStartHour * 60 + dailyStartMin;
    const end = dailyEndHour * 60 + dailyEndMin;

    if (windowCrossesMidnight) {
      return current >= start || current < end;
    }
    return current >= start && current < end;
  };

  const getNextWindowStart = (d: Date): Date => {
    const result = new Date(d);
    result.setHours(dailyStartHour, dailyStartMin, 0, 0);

    if (result <= d) {
      if (windowCrossesMidnight) {
        result.setDate(result.getDate() + 1);
      } else {
        result.setDate(result.getDate() + 1);
      }
    }
    return result;
  };

  let cursor = new Date(nowLocal);

  if (!isWithinWindow(cursor)) {
    cursor = getNextWindowStart(cursor);
  }

  for (let i = 0; i < count; i++) {
    times.push(localToUtc(new Date(cursor)));

    cursor = new Date(cursor.getTime() + intervalMinutes * 60000);

    if (!isWithinWindow(cursor)) {
      cursor = getNextWindowStart(cursor);
    }
  }

  return times;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const payload: SchedulePayload = await req.json();

    const {
      campaign_id,
      user_id,
      recipients,
      variants,
      prospect_data,
      daily_start,
      daily_end,
      interval_minutes,
    } = payload;

    if (
      !campaign_id ||
      !Array.isArray(recipients) ||
      recipients.length === 0 ||
      !Array.isArray(variants) ||
      variants.length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid payload: missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: deleteError } = await supabase
      .from("emails")
      .delete()
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    if (deleteError) {
      console.error("Error clearing old pending emails:", deleteError);
    }

    const startParts = daily_start.split(":").map(Number);
    const endParts = daily_end.split(":").map(Number);

    const IST_OFFSET = 330;

    const sendTimes = computeSendTimes(
      recipients.length,
      startParts[0],
      startParts[1] || 0,
      endParts[0],
      endParts[1] || 0,
      interval_minutes || 5,
      IST_OFFSET
    );

    const emailsPerVariant = Math.ceil(recipients.length / variants.length);

    const rows = recipients.map((email: string, idx: number) => {
      const variantIndex = Math.min(
        Math.floor(idx / emailsPerVariant),
        variants.length - 1
      );
      const variant = variants[variantIndex];
      const data = prospect_data[email] || {};

      return {
        to_email: email,
        subject: replaceVariables(variant.subject, data),
        body: replaceVariables(variant.body, data),
        send_at: sendTimes[idx].toISOString(),
        status: "pending",
        campaign_id,
        user_id: user_id,
        variant: variant.id,
      };
    });

    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("emails").insert(batch);
      if (error) throw error;
    }

    await supabase
      .from("campaigns")
      .update({
        scheduled_status: "scheduled",
        scheduled_count: rows.length,
        is_active: true,
        daily_start: daily_start,
        daily_end: daily_end,
        interval_minutes: interval_minutes || 5,
      })
      .eq("id", campaign_id);

    const firstSend = sendTimes[0];
    const lastSend = sendTimes[sendTimes.length - 1];

    return new Response(
      JSON.stringify({
        success: true,
        scheduled: rows.length,
        first_send_at: firstSend.toISOString(),
        last_send_at: lastSend.toISOString(),
        variants_used: variants.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
