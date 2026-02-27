import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: emails, error } = await supabase
      .from("emails")
      .select("*")
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .limit(10);

    if (error) throw error;

    if (!emails || emails.length === 0) {
      return res.status(200).json({ processed: 0, sent: 0, failed: 0 });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    let sent = 0;
    let failed = 0;

    for (const email of emails) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email.to_email,
          subject: email.subject,
          text: email.body,
        });

        await supabase
          .from("emails")
          .update({ status: "sent" })
          .eq("id", email.id);

        sent++;
      } catch (err) {
        await supabase
          .from("emails")
          .update({ status: "failed" })
          .eq("id", email.id);

        failed++;
      }
    }

    return res.status(200).json({ processed: emails.length, sent, failed });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: String(err) });
  }
}