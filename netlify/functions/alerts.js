export default async (request, context) => {
  // Chỉ chấp nhận POST request
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const body = await request.json();
    const { email, fromCurrency, toCurrency, targetRate } = body;

    // Kiểm tra dữ liệu đầu vào
    if (!email || !fromCurrency || !toCurrency || !targetRate || isNaN(targetRate)) {
      return new Response(JSON.stringify({ error: "Missing required fields or invalid targetRate." }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    // Giả lập lưu trữ nếu chưa có biến cấu hình Supabase
    if (!supabaseUrl || !supabaseKey) {
      console.warn("Supabase credentials missing. Running in Simulation mode.");
      return new Response(JSON.stringify({
        message: "✓ Đăng ký thành công (Chế độ Giả Lập - Chưa kết nối Database)!",
        simulated: true,
        data: {
          email,
          from_currency: fromCurrency.toUpperCase(),
          to_currency: toCurrency.toUpperCase(),
          target_rate: parseFloat(targetRate),
          is_active: true,
          created_at: new Date().toISOString()
        }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // Chuẩn hóa và làm sạch Supabase URL để chống lỗi gõ thừa /rest/v1 hoặc dấu gạch chéo ngược
    let cleanUrl = supabaseUrl.trim();
    if (cleanUrl.endsWith("/")) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    if (cleanUrl.endsWith("/rest/v1")) {
      cleanUrl = cleanUrl.slice(0, -8);
    }
    if (cleanUrl.endsWith("/rest/v1/")) {
      cleanUrl = cleanUrl.slice(0, -9);
    }

    const targetEndpoint = `${cleanUrl}/rest/v1/alerts`;

    // Thực hiện lưu trữ thật vào Supabase REST API
    const response = await fetch(targetEndpoint, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({
        email: email,
        from_currency: fromCurrency.toUpperCase(),
        to_currency: toCurrency.toUpperCase(),
        target_rate: parseFloat(targetRate),
        is_active: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Supabase API responded with: ${errText} (Endpoint: ${targetEndpoint})`);
    }

    const insertedData = await response.json();

    return new Response(JSON.stringify({
      message: "✓ Đã kích hoạt cảnh báo tỷ giá thành công trên Cloud Database!",
      data: insertedData[0]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (error) {
    console.error("Alert registration error:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      debug_supabase_url: process.env.SUPABASE_URL 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
