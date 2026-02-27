import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScheduleFollowupPayload {
  followup_id: string;
  campaign_id: string;
  variants: { id: string; subject: string; body: string }[];
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

  const windowCrossesMidnight =
    dailyEndHour < dailyStartHour ||
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
      result.setDate(result.getDate() + 1);
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
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: ScheduleFollowupPayload = await req.json();
    const {
      followup_id,
      campaign_id,
      variants,
      daily_start,
      daily_end,
      interval_minutes,
    } = payload;

    if (
      !followup_id ||
      !campaign_id ||
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

    const { data: cpRows, error: cpError } = await supabase
      .from("campaign_prospects")
      .select("prospect_id, excluded_from_followup, prospects(*)")
      .eq("campaign_id", campaign_id)
      .eq("excluded_from_followup", false);

    if (cpError) throw cpError;

    const eligibleProspects: Array<{
      email: string;
      first_name: string;
      business_name: string;
      company: string;
      city: string;
      state: string;
    }> = (cpRows ?? []).map((row: any) => ({
      email: row.prospects.email,
      first_name: row.prospects.first_name || "",
      business_name: row.prospects.business_name || "",
      company: row.prospects.company || "",
      city: row.prospects.city || "",
      state: row.prospects.state || "",
    }));

    if (eligibleProspects.length === 0) {
      return new Response(
        JSON.stringify({ error: "No eligible prospects (all excluded)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await supabase
      .from("followup_emails")
      .delete()
      .eq("followup_id", followup_id)
      .eq("status", "pending");

    const startParts = daily_start.split(":").map(Number);
    const endParts = daily_end.split(":").map(Number);
    const IST_OFFSET = 330;

    const sendTimes = computeSendTimes(
      eligibleProspects.length,
      startParts[0],
      startParts[1] || 0,
      endParts[0],
      endParts[1] || 0,
      interval_minutes || 5,
      IST_OFFSET
    );

    const emailsPerVariant = Math.ceil(
      eligibleProspects.length / variants.length
    );

    const rows = eligibleProspects.map((prospect, idx) => {
      const variantIndex = Math.min(
        Math.floor(idx / emailsPerVariant),
        variants.length - 1
      );
      const variant = variants[variantIndex];
      const data: Record<string, string> = {
        first_name: prospect.first_name,
        business_name: prospect.business_name,
        company: prospect.company,
        city: prospect.city,
        state: prospect.state,
        email: prospect.email,
      };

      return {
        followup_id,
        to_email: prospect.email,
        subject: replaceVariables(variant.subject, data),
        body: replaceVariables(variant.body, data),
        send_at: sendTimes[idx].toISOString(),
        status: "pending",
        variant: variant.id,
      };
    });

    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("followup_emails").insert(batch);
      if (error) throw error;
    }

    await supabase
      .from("campaign_followups")
      .update({
        scheduled_status: "scheduled",
        scheduled_count: rows.length,
        daily_start,
        daily_end,
        interval_minutes: interval_minutes || 5,
      })
      .eq("id", followup_id);

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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
