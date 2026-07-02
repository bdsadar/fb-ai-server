// ============================================================
//  Google Apps Script — Full Bridge
//  script.google.com → New Project → Paste করো
//  Deploy → Web App → Anyone → Execute as Me
// ============================================================

const SS_ID = "YOUR_SPREADSHEET_ID_HERE"; // ← Sheet ID দাও

const SHEETS = {
  PRODUCTS:      "Products",
  ORDERS:        "Orders",
  CONVERSATIONS: "Conversations",
  SETTINGS:      "Settings"
};

// ──────────────────────────────────────────────
//  GET handler
// ──────────────────────────────────────────────
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || "";
  try {
    if (action === "getProduct" || action === "getProducts") return getProducts();
    if (action === "getOrders")        return getOrders();
    if (action === "getConversations") return getConversations();
    if (action === "getSettings")      return getSettings();
    return jsonResp({ success: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonResp({ success: false, error: err.message });
  }
}

// ──────────────────────────────────────────────
//  POST handler
// ──────────────────────────────────────────────
function doPost(e) {
  const data   = JSON.parse(e.postData.contents);
  const action = data.action || "";
  try {
    if (action === "saveOrder")       return saveOrder(data);
    if (action === "updateOrder")     return updateOrder(data);
    if (action === "saveProduct")     return saveProduct(data);
    if (action === "saveSettings")    return saveSettings(data);
    if (action === "saveConversation")return saveConversation(data);
    return jsonResp({ success: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonResp({ success: false, error: err.message });
  }
}

// ──────────────────────────────────────────────
//  PRODUCTS
// ──────────────────────────────────────────────
function getProducts() {
  const sheet = getSheet(SHEETS.PRODUCTS);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonResp({ success: true, products: [], content: "" });

  const headers  = rows[0];
  const products = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || "");
    return obj;
  });

  // Plain text for AI context
  const content = products.map(p =>
    `পণ্য: ${p["পণ্যের নাম"]} | দাম: ${p["দাম (৳)"]} | ডেলিভারি: ${p["ডেলিভারি চার্জ"]} | স্টক: ${p["স্টক"]} | বিবরণ: ${p["বিবরণ"]}`
  ).join("\n");

  return jsonResp({ success: true, products, content });
}

function saveProduct(data) {
  const sheet = getSheet(SHEETS.PRODUCTS);
  ensureProductHeader(sheet);
  sheet.appendRow([
    data.name     || "",
    data.price    || "",
    data.delivery || "",
    data.stock    || "আছে",
    data.description || ""
  ]);
  return jsonResp({ success: true });
}

function ensureProductHeader(sheet) {
  if (sheet.getLastRow() > 0) return;
  const h = ["পণ্যের নাম","দাম (৳)","ডেলিভারি চার্জ","স্টক","বিবরণ"];
  sheet.appendRow(h);
  styleHeader(sheet, h.length, "#0F9D58");
}

// ──────────────────────────────────────────────
//  ORDERS
// ──────────────────────────────────────────────
function getOrders() {
  const sheet = getSheet(SHEETS.ORDERS);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonResp({ success: true, orders: [] });

  const headers = rows[0];
  const orders  = rows.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, j) => obj[h] = row[j] || "");
    return obj;
  });
  return jsonResp({ success: true, orders });
}

function saveOrder(data) {
  const sheet = getSheet(SHEETS.ORDERS);
  ensureOrderHeader(sheet);

  const now = Utilities.formatDate(new Date(), "Asia/Dhaka", "dd/MM/yyyy HH:mm");
  sheet.appendRow([
    now,
    data.senderName  || "",
    data.fbSenderId  || "",
    data.phone       || "",
    data.address     || "",
    data.product     || "",
    data.quantity    || "",
    data.totalPrice  || "",
    data.status      || "Pending",
    data.notes       || ""
  ]);
  styleLastRow(sheet, 10);
  return jsonResp({ success: true });
}

function updateOrder(data) {
  const sheet = getSheet(SHEETS.ORDERS);
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];
  const statusCol = headers.indexOf("স্ট্যাটাস") + 1;
  const notesCol  = headers.indexOf("নোট") + 1;

  if (data._row && statusCol > 0) {
    sheet.getRange(data._row, statusCol).setValue(data.status || "");
    if (notesCol > 0) sheet.getRange(data._row, notesCol).setValue(data.notes || "");
  }
  return jsonResp({ success: true });
}

function ensureOrderHeader(sheet) {
  if (sheet.getLastRow() > 0) return;
  const h = ["তারিখ/সময়","কাস্টমার নাম","FB Sender ID","ফোন","ঠিকানা","পণ্য","পরিমাণ","মূল্য (৳)","স্ট্যাটাস","নোট"];
  sheet.appendRow(h);
  styleHeader(sheet, h.length, "#1877F2");
  sheet.setFrozenRows(1);
  [130,130,130,120,180,140,80,100,100,150].forEach((w,i) => sheet.setColumnWidth(i+1, w));
}

// ──────────────────────────────────────────────
//  CONVERSATIONS
// ──────────────────────────────────────────────
function getConversations() {
  const sheet = getSheet(SHEETS.CONVERSATIONS);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonResp({ success: true, conversations: [] });

  const headers = rows[0];
  const convos  = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || "");
    return obj;
  });
  return jsonResp({ success: true, conversations: convos.reverse() });
}

function saveConversation(data) {
  const sheet = getSheet(SHEETS.CONVERSATIONS);
  ensureConvoHeader(sheet);
  const now = Utilities.formatDate(new Date(), "Asia/Dhaka", "dd/MM/yyyy HH:mm:ss");
  sheet.appendRow([now, data.senderId||"", data.senderName||"", data.userMsg||"", data.botReply||"", data.mode||"auto"]);
  return jsonResp({ success: true });
}

function ensureConvoHeader(sheet) {
  if (sheet.getLastRow() > 0) return;
  const h = ["সময়","Sender ID","নাম","কাস্টমারের Message","AI Reply","Mode"];
  sheet.appendRow(h);
  styleHeader(sheet, h.length, "#7B2D8B");
  sheet.setFrozenRows(1);
}

// ──────────────────────────────────────────────
//  SETTINGS
// ──────────────────────────────────────────────
function getSettings() {
  const sheet = getSheet(SHEETS.SETTINGS);
  const rows  = sheet.getDataRange().getValues();
  const obj   = {};
  rows.forEach(r => { if (r[0]) obj[r[0]] = r[1]; });
  return jsonResp({
    success: true,
    settings: {
      autoMode:     obj["autoMode"] === "true" || obj["autoMode"] === true,
      systemPrompt: obj["systemPrompt"] || ""
    }
  });
}

function saveSettings(data) {
  const sheet = getSheet(SHEETS.SETTINGS);
  sheet.clearContents();
  sheet.appendRow(["autoMode",     String(data.autoMode)]);
  sheet.appendRow(["systemPrompt", data.systemPrompt || ""]);
  return jsonResp({ success: true });
}

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────
function getSheet(name) {
  const ss    = SpreadsheetApp.openById(SS_ID);
  let   sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function styleHeader(sheet, cols, color) {
  const r = sheet.getRange(1, 1, 1, cols);
  r.setBackground(color);
  r.setFontColor("#FFFFFF");
  r.setFontWeight("bold");
  r.setHorizontalAlignment("center");
  r.setFontSize(11);
  sheet.setRowHeight(1, 32);
}

function styleLastRow(sheet, cols) {
  const last  = sheet.getLastRow();
  const bg    = last % 2 === 0 ? "#F0F7FF" : "#FFFFFF";
  sheet.getRange(last, 1, 1, cols).setBackground(bg);
  sheet.setRowHeight(last, 26);
}

function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
