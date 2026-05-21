import { Resend } from "resend";
import { NextResponse } from "next/server";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

function escapeHtml(text: unknown): string {
  if (text == null || text === "") return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: Request) {
  const body = await request.json();

  const {
    name,
    email,
    company,
    phone,
    companySize,
    industry,
    productInterest,
    goal,
    date,
    timeSlot,
    message,
  } = body;

  // Server-side validation for phone number
  if (phone && typeof phone === "string" && phone.trim()) {
    const trimmedPhone = phone.trim();
    
    // Check format: optional +, then digits/spaces/hyphens only
    const phoneRegex = /^[+]?[0-9\s\-]+$/;
    if (!phoneRegex.test(trimmedPhone)) {
      return NextResponse.json(
        { error: "Invalid phone number format. Only numbers, spaces, hyphens, and optional + are allowed." },
        { status: 400 }
      );
    }
    
    // Extract only digits (excluding + at start)
    const digitsOnly = trimmedPhone.replace(/^[+]/, "").replace(/[\s\-]/g, "");
    
    // Check length: 7-15 digits
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return NextResponse.json(
        { error: "Phone number must contain between 7 and 15 digits." },
        { status: 400 }
      );
    }
    
    // Ensure it's all numeric after removing formatting
    if (!/^\d+$/.test(digitsOnly)) {
      return NextResponse.json(
        { error: "Invalid phone number format." },
        { status: 400 }
      );
    }
  }

  const resend = getResend();
  const notificationEmail = process.env.NOTIFICATION_EMAIL?.trim();

  if (!resend || !notificationEmail) {
    console.error("book-meet: missing RESEND_API_KEY or NOTIFICATION_EMAIL");
    return NextResponse.json({ error: "Email service is not configured" }, { status: 503 });
  }

  try {
    await resend.emails.send({
      from: "Racko Website <onboarding@resend.dev>",
      to: [notificationEmail],
      subject: `New Racko Meet Request — ${company} (${industry})`,
      html: `
        <div style="font-family: monospace; 
          background: #0E0E0E; color: #FFFFFF; 
          padding: 32px; border-radius: 8px;">
          
          <h2 style="color: #B91C1C; margin: 0 0 24px;">
            New Racko Meet Request
          </h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="color: #6B6B6B; padding: 8px 0; 
                width: 160px; font-size: 12px;">NAME</td>
              <td style="color: #FFFFFF; padding: 8px 0; 
                font-size: 14px;">${name}</td>
            </tr>
            <tr>
              <td style="color: #6B6B6B; padding: 8px 0; 
                font-size: 12px;">EMAIL</td>
              <td style="padding: 8px 0;">
                <a href="mailto:${email}" 
                  style="color: #B91C1C; font-size: 14px;">
                  ${email}
                </a>
              </td>
            </tr>
            <tr>
              <td style="color: #6B6B6B; padding: 8px 0; 
                font-size: 12px;">PHONE</td>
              <td style="color: #FFFFFF; padding: 8px 0; 
                font-size: 14px;">${phone || "—"}</td>
            </tr>
            <tr>
              <td style="color: #6B6B6B; padding: 8px 0; 
                font-size: 12px;">COMPANY</td>
              <td style="color: #FFFFFF; padding: 8px 0; 
                font-size: 14px; font-weight: bold;">
                ${company}
              </td>
            </tr>
            <tr>
              <td style="color: #6B6B6B; padding: 8px 0; 
                font-size: 12px;">COMPANY SIZE</td>
              <td style="color: #FFFFFF; padding: 8px 0; 
                font-size: 14px;">${companySize}</td>
            </tr>
            <tr>
              <td style="color: #6B6B6B; padding: 8px 0; 
                font-size: 12px;">INDUSTRY</td>
              <td style="color: #FFFFFF; padding: 8px 0; 
                font-size: 14px;">${industry}</td>
            </tr>
            <tr>
              <td style="color: #6B6B6B; padding: 8px 0; 
                font-size: 12px;">INTERESTED IN</td>
              <td style="color: #FFFFFF; padding: 8px 0; 
                font-size: 14px;">
                ${
                  Array.isArray(productInterest)
                    ? productInterest.join(", ")
                    : productInterest || "—"
                }
              </td>
            </tr>
            <tr>
              <td style="color: #6B6B6B; padding: 8px 0; 
                font-size: 12px;">GOAL</td>
              <td style="color: #FFFFFF; padding: 8px 0; 
                font-size: 14px;">${goal || "—"}</td>
            </tr>
            ${
              message
                ? `<tr>
              <td style="color: #6B6B6B; padding: 8px 0; 
                font-size: 12px; vertical-align: top;">MESSAGE</td>
              <td style="color: #FFFFFF; padding: 8px 0; 
                font-size: 14px; white-space: pre-wrap;">${escapeHtml(message)}</td>
            </tr>`
                : ""
            }
            <tr style="border-top: 1px solid #333;">
              <td style="color: #B91C1C; padding: 12px 0 8px; 
                font-size: 12px; font-weight: bold;">
                REQUESTED DATE
              </td>
              <td style="color: #FFFFFF; padding: 12px 0 8px; 
                font-size: 14px; font-weight: bold;">
                ${date}
              </td>
            </tr>
            <tr>
              <td style="color: #B91C1C; padding: 8px 0; 
                font-size: 12px; font-weight: bold;">
                TIME SLOT
              </td>
              <td style="color: #FFFFFF; padding: 8px 0; 
                font-size: 14px; font-weight: bold;">
                ${timeSlot} IST
              </td>
            </tr>
          </table>
          
          <div style="margin-top: 24px; padding: 16px; 
            background: rgba(185,28,28,0.1); 
            border: 1px solid rgba(185,28,28,0.3);
            border-radius: 6px;">
            <a href="mailto:${email}?subject=Re: Your Racko Meet Request"
              style="color: #B91C1C; font-size: 13px; 
                font-weight: bold; text-decoration: none;">
              → Reply to ${name}
            </a>
          </div>
          
          <p style="color: #3D3D3D; font-size: 11px; 
            margin-top: 24px;">
            Submitted via racko.in/book-a-meet
          </p>
        </div>
      `,
    });

    // Also send confirmation to the person who booked
    await resend.emails.send({
      from: "Racko Cloud <onboarding@resend.dev>",
      to: [email],
      subject: "Your Racko Meet is confirmed — we'll be in touch",
      html: `
        <div style="font-family: monospace; 
          background: #0E0E0E; color: #FFFFFF; 
          padding: 32px; border-radius: 8px;">
          
          <h2 style="color: #B91C1C; margin: 0 0 16px;">
            Meet request received.
          </h2>
          
          <p style="color: #A1A1A1; font-size: 14px; 
            line-height: 1.6; margin: 0 0 24px;">
            Hi ${String(name ?? "").split(" ")[0] || "there"}, thanks for reaching out. 
            A Racko Cloud specialist will review your request 
            and confirm your slot within one business day.
          </p>
          
          <div style="background: #161616; 
            border: 1px solid #333;
            border-radius: 6px; padding: 20px; 
            margin: 0 0 24px;">
            <p style="color: #6B6B6B; font-size: 11px; 
              margin: 0 0 12px;">YOUR REQUEST</p>
            <p style="color: #FFFFFF; margin: 4px 0; 
              font-size: 13px;">
              Company: <strong>${company}</strong>
            </p>
            <p style="color: #FFFFFF; margin: 4px 0; 
              font-size: 13px;">
              Requested: <strong>${date} · ${timeSlot} IST</strong>
            </p>
          </div>
          
          <p style="color: #3D3D3D; font-size: 11px;">
            No commitment. No sales deck. Just cloud.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email error:", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
