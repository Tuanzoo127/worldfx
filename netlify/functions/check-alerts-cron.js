// Netlify Scheduled Functions (Cron Jobs) v2 configuration
export const config = {
  schedule: "@hourly" // Tự động chạy mỗi giờ một lần trên hạ tầng Cloud
};

export default async (request, context) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  const now = new Date().toISOString();
  console.log(`[Cloud Cron] Scheduled check started at: ${now}`);

  // 1. Chế độ Giả lập (Simulation Mode) nếu thiếu cấu hình đám mây
  if (!supabaseUrl || !supabaseKey || !resendKey) {
    console.warn("Missing cloud credentials (SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY). Running in SIMULATION mode.");
    
    const simulatedAlert = {
      email: "sinhvien-demo@gmail.com",
      from_currency: "USD",
      to_currency: "VND",
      target_rate: 25400,
      current_rate: 25485
    };

    console.log(`[SIMULATION CRON] Đã quét thấy cảnh báo: ${simulatedAlert.email} đặt ngưỡng ${simulatedAlert.target_rate} cho cặp ${simulatedAlert.from_currency}/${simulatedAlert.to_currency}`);
    console.log(`[SIMULATION CRON] Tỷ giá hiện tại: ${simulatedAlert.current_rate} (Đã vượt ngưỡng)`);
    console.log(`[SIMULATION CRON] Đã gửi email thông báo thành công đến ${simulatedAlert.email} qua Resend API!`);
    console.log("[SIMULATION CRON] Đã tắt cảnh báo (Set is_active = false) trong cơ sở dữ liệu.");

    return new Response(JSON.stringify({
      status: "simulation_success",
      message: "Tác vụ chạy ngầm được chạy thử nghiệm thành công ở chế độ giả lập.",
      triggered: [simulatedAlert]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // 2. Lấy danh sách các cảnh báo đang hoạt động từ Supabase
    const dbResponse = await fetch(`${supabaseUrl}/rest/v1/alerts?is_active=eq.true`, {
      method: "GET",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!dbResponse.ok) {
      const errText = await dbResponse.text();
      throw new Error(`Failed to query database: ${errText}`);
    }

    const alerts = await dbResponse.json();
    console.log(`[Cloud Cron] Found ${alerts.length} active alerts to process.`);

    if (alerts.length === 0) {
      return new Response(JSON.stringify({ status: "success", message: "Không có cảnh báo hoạt động." }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Gom nhóm theo đồng tiền gốc (base) để tối ưu việc gọi API tỷ giá
    const baseCurrencies = [...new Set(alerts.map(a => a.from_currency))];
    const ratesByBase = {};

    for (const base of baseCurrencies) {
      try {
        const ratesResponse = await fetch(`https://open.er-api.com/v6/latest/${base}`);
        if (ratesResponse.ok) {
          const ratesData = await ratesResponse.json();
          ratesByBase[base] = ratesData.rates;
        }
      } catch (err) {
        console.error(`Error fetching rates for base ${base}:`, err);
      }
    }

    const triggeredAlerts = [];

    // 4. So khớp tỷ giá của từng alert
    for (const alert of alerts) {
      const rates = ratesByBase[alert.from_currency];
      if (!rates) continue;

      const currentRate = rates[alert.to_currency];
      if (!currentRate) continue;

      // Logic trigger: Nếu tỷ giá hiện tại lớn hơn hoặc bằng tỷ giá mục tiêu
      // (Đối với các cặp tiền thông thường quy đổi sang nội tệ, vượt ngưỡng là có lợi và cần thông báo)
      if (currentRate >= alert.target_rate) {
        console.log(`[Cloud Cron] Alert triggered for ${alert.email}! Current ${alert.from_currency}/${alert.to_currency} = ${currentRate} (Target: ${alert.target_rate})`);

        // Gửi email thật qua Resend API
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "WorldFx Alerts <onboarding@resend.dev>",
            to: alert.email,
            subject: `🔔 Cảnh báo tỷ giá WorldFx: Tỷ giá ${alert.from_currency}/${alert.to_currency} đã đạt mục tiêu!`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #111;">
                <h2>Hệ Thống Fintech Đám Mây WorldFx</h2>
                <p>Chào bạn,</p>
                <p>Chúng tôi thông báo tỷ giá bạn theo dõi đã đạt hoặc vượt ngưỡng thiết lập:</p>
                <table style="border-collapse: collapse; width: 100%; max-width: 500px; margin: 15px 0;">
                  <tr style="background-color: #f3f4f6;">
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Thông tin</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Tỷ giá</th>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">Cặp tiền tệ</td>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>${alert.from_currency} / ${alert.to_currency}</strong></td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">Tỷ giá mục tiêu bạn chọn</td>
                    <td style="padding: 10px; border: 1px solid #ddd; color: #a855f7;"><strong>${alert.target_rate.toLocaleString()}</strong></td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">Tỷ giá thị trường hiện tại</td>
                    <td style="padding: 10px; border: 1px solid #ddd; color: #06b6d4;"><strong>${currentRate.toLocaleString()}</strong></td>
                  </tr>
                </table>
                <p>Cảnh báo này sẽ tạm thời được tắt để tránh làm phiền bạn. Bạn có thể truy cập lại trang web để đặt cảnh báo mới.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin-top: 25px;" />
                <p style="font-size: 11px; color: #666;">Đây là email tự động gửi từ Serverless Functions của dự án Điện toán đám mây WorldFx.</p>
              </div>
            `
          })
        });

        if (emailResponse.ok) {
          console.log(`[Cloud Cron] Email sent successfully to ${alert.email}`);

          // Cập nhật trạng thái alert thành tắt (is_active = false) trong cơ sở dữ liệu
          await fetch(`${supabaseUrl}/rest/v1/alerts?id=eq.${alert.id}`, {
            method: "PATCH",
            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              is_active: false
            })
          });

          triggeredAlerts.push({
            id: alert.id,
            email: alert.email,
            pair: `${alert.from_currency}/${alert.to_currency}`,
            target_rate: alert.target_rate,
            current_rate: currentRate
          });
        } else {
          const mailErr = await emailResponse.text();
          console.error(`[Cloud Cron] Failed to send email to ${alert.email}:`, mailErr);
        }
      }
    }

    return new Response(JSON.stringify({
      status: "success",
      message: `Quá trình quét hoàn tất. Đã kích hoạt ${triggeredAlerts.length} cảnh báo.`,
      triggered: triggeredAlerts
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Scheduled check-alerts execution error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
