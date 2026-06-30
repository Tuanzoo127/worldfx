export default async (request, context) => {
  // Lấy response gốc của trang web
  const response = await context.next();
  
  // Đọc thông tin quốc gia từ IP của người dùng qua Netlify Geo IP
  const countryCode = context.geo?.country?.code || "US";
  
  // Bản đồ ánh xạ mã quốc gia sang mã tiền tệ mặc định
  const countryToCurrency = {
    "VN": "VND",
    "US": "USD",
    "JP": "JPY",
    "GB": "GBP",
    "CN": "CNY",
    "KR": "KRW",
    "DE": "EUR",
    "FR": "EUR",
    "IT": "EUR",
    "SG": "SGD",
    "TH": "THB",
    "MY": "MYR",
    "AU": "AUD",
    "CA": "CAD",
    "HK": "HKD",
    "IN": "INR"
  };
  
  const defaultCurrency = countryToCurrency[countryCode] || "USD";
  
  // Ghi mã tiền tệ mặc định vào Cookie để Client-side JS có thể đọc được
  response.headers.append("Set-Cookie", `country_currency=${defaultCurrency}; Path=/; Max-Age=31536000; SameSite=Lax`);
  
  // Thêm header để phục vụ cho việc kiểm thử/debug dễ dàng
  response.headers.set("X-Country-Detected", countryCode);
  response.headers.set("X-Currency-Suggested", defaultCurrency);
  
  return response;
};
