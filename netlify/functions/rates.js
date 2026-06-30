// In-memory cache duy trì trong các container Serverless ấm (Warm container)
const cache = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 giờ

export default async (request, context) => {
  const url = new URL(request.url);
  const base = (url.searchParams.get("base") || "USD").toUpperCase();

  const now = Date.now();

  // Kiểm tra cache trong container
  if (cache[base] && (now - cache[base].timestamp) < CACHE_TTL) {
    return new Response(JSON.stringify(cache[base].data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "HIT-Container",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  try {
    // Gọi API tỷ giá thật từ máy chủ đám mây trung gian
    const apiResponse = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!apiResponse.ok) {
      throw new Error(`ExchangeRate API responded with status: ${apiResponse.status}`);
    }

    const data = await apiResponse.json();

    if (data.result !== "success") {
      throw new Error("Invalid API response data");
    }

    // Ghi nhận vào cache
    cache[base] = {
      data: data,
      timestamp: now
    };

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error("Rates fetch error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};
