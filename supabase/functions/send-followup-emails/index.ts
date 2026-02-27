import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: emails, error } = await supabase
      .from("followup_emails")
      .select("*")
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .order("send_at", { ascending: true })
      .limit(10);

    if (error) throw error;

    let sentCount = 0;
    let failedCount = 0;

    const smtpUser = Deno.env.get("SMTP_USER")!;
    const smtpPass = Deno.env.get("SMTP_PASS")!;
    const fromEmail = Deno.env.get("FROM_EMAIL")!;

    for (const email of emails ?? []) {
      try {
        const client = new SmtpClient();
        await client.connectTLS({
          hostname: "smtp.gmail.com",
          port: 465,
          username: smtpUser,
          password: smtpPass,
        });

        await client.send({
          from: fromEmail,
          to: email.to_email,
          subject: email.subject,
          content: email.body,
        });

        await client.close();

        await supabase
          .from("followup_emails")
          .update({ status: "sent" })
          .eq("id", email.id);

        sentCount++;
      } catch {
        await supabase
          .from("followup_emails")
          .update({ status: "failed" })
          .eq("id", email.id);

        failedCount++;
      }
    }

    if (sentCount > 0 || failedCount > 0) {
      const followupIds = [
        ...new Set(
          (emails ?? []).map((e) => e.followup_id)
        ),
      ];

      for (const fid of followupIds) {
        const { count } = await supabase
          .from("followup_emails")
          .select("id", { count: "exact", head: true })
          .eq("followup_id", fid)
          .eq("status", "pending");

        if (count === 0) {
          await supabase
            .from("campaign_followups")
            .update({ scheduled_status: "completed" })
            .eq("id", fid)
            .eq("scheduled_status", "scheduled");
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: emails?.length ?? 0,
        sent: sentCount,
        failed: failedCount,
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
