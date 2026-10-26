const axios = require("axios");
require("dotenv").config();

const BASE_URL = "https://nibssbyphoenix.onrender.com";

let cachedToken = null;
let tokenExpiry = 0;

async function getNibssToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const response = await axios.post(
    `${BASE_URL}/api/auth/token`,
    {
      apiKey: process.env.NIBSS_API_KEY,
      apiSecret: process.env.NIBSS_API_SECRET,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 20000,
    }
  );

  const data = response.data;

  const token =
    data.token ||
    data.accessToken ||
    data.access_token ||
    data.data?.token ||
    data.data?.accessToken;

  if (!token) {
    throw new Error("NIBSS response did not contain an access token");
  }

  cachedToken = token;
tokenExpiry = Date.now() + 45 * 60 * 1000;

console.log("NIBSS access token:", cachedToken);

  return cachedToken;
}

async function nibssRequest(method, path, body) {
  const token = await getNibssToken();

  const response = await axios({
    method,
    url: `${BASE_URL}${path}`,
    data: body,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });

  return response.data;
}

module.exports = {
  getNibssToken,
  nibssRequest,
};