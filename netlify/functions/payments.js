// netlify/functions/payments.js
import { google } from "googleapis";

export const handler = async (event) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",                 // relax now; you can restrict later
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  try {
    const { query = "" } = JSON.parse(event.body || "{}");  // student name filter (optional)

    const SHEET_ID = process.env.SHEET_ID;                   // e.g. 1AbCDEFG...
    const RANGE = process.env.SHEET_RANGE || "Payments!A:D"; // Name | Status | Amount | Date
    if (!SHEET_ID) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok:false, error:"SHEET_ID env var missing" }) };
    }

    // Auth with service account
    const jwt = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });
    const sheets = google.sheets({ version: "v4", auth: jwt });

    // Read values
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: RANGE
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, stats:{paid:0, unpaid:0, total:0}, matches:[] }) };
    }

    // Map rows to objects using header row
    const [header, ...data] = rows;
    const idx = {
      name: header.findIndex(x => String(x).toLowerCase() === "name"),
      status: header.findIndex(x => String(x).toLowerCase() === "status"),
      amount: header.findIndex(x => String(x).toLowerCase() === "amount"),
      date: header.findIndex(x => String(x).toLowerCase() === "date")
    };

    const records = data.map((r, i) => ({
      row: i + 2,  // real sheet row number
      name: r[idx.name] || "",
      status: r[idx.status] || "",
      amount: r[idx.amount] || "",
      date: r[idx.date] || ""
    }));

    // Stats
    const paid = records.filter(r => String(r.status).trim().toLowerCase() === "paid").length;
    const unpaid = records.filter(r => String(r.status).trim().toLowerCase() !== "paid").length;
    const total = records.length;

    // Search filter (case-insensitive contains)
    const q = String(query).trim().toLowerCase();
    const matches = q
      ? records.filter(r => r.name.toLowerCase().includes(q))
      : [];

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type":"application/json" },
      body: JSON.stringify({ ok:true, stats: { paid, unpaid, total }, matches })
    };

  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
