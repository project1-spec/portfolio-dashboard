import { useState, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = {
  Cash: "#94a3b8", Bonds: "#60a5fa", Equities: "#34d399",
  "Private Investments": "#a78bfa", Gold: "#fbbf24", Silver: "#e2e8f0",
  Crypto: "#f97316", "Investment Property": "#fb7185", Alternatives: "#2dd4bf",
};

const TASGET_PCTS = {
  Cash: 20, Bonds: 15, Equities: 30, "Private Investments": 8,
  Gold: 8, Silver: 2, Crypto: 2, "Investment Property": 10, Alternatives: 5,
};

const categorise = (label) => {
  const l = label.toLowerCase();
  if (l.includes("cash") || l.includes("current account") || l.includes("savings")) return "Cash";
  if (l.includes("bond") || l.includes("gilt") || l.includes("fixed income")) return "Bonds";
  if (l.includes("gold")) return "Gold";
  if (l.includes("silver")) return "Silver";
  if (l.includes("crypto") || l.includes("bitcoin") || l.includes("ethereum")) return "Crypto";
  if (l.includes("private")) return "Private Investments";
  if (l.includes("property") || l.includes("real estate") || l.includes("reit")) return "Investment Property";
  if (l.includes("alternative") || l.includes("hedge") || l.includes("commodity")) return "Alternatives";
  if (l.includes("coutts") || l.includes("hsbc") || l.includes("trading 212") ||
      l.includes("equit") || l.includes("mixed assets") || l.includes("public") ||
      l.includes("stock") || l.includes("fund") || l.includes("isa") || l.includes("sipp"))
    return "Equities";
  return null;
};

const fmt = (v) => "\u00A3" + Math.round(v).toLocaleString("en-GB");
const fmtPct = (v) => v.toFixed(1) + "%";

const processRows = (rows) => {
  const buckets = {};
  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const label = (row[0] || "").toString().trim();
    const ll = label.toLowerCase();
    if (!label) continue;
    if (ll.includes("total") || ll.includes("house") ||
        ll.includes("giveaway") || ll.includes("managed portfolio")) continue;

    let value = null;
    for (let i = 1; i < row.length; i++) {
      const cleaned = (row[i] || "").toString().replace(/[\u00A3,\s]/g, "");
      const n = parseFloat(cleaned);
      if (!isNaN(n) && n > 0) { value = n; break; }
    }
    if (value === null) continue;

    const cat = categorise(label);
    if (!cat) continue;
    buckets[cat] = (buckets[cat] || 0) + value;
  }

  if (Object.keys(buckets).length === 0)
    throw new Error("No asset data found. Check the sheet layout.");

  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  const current = Object.entries(buckets)
    .map(([name, value]) => ({ name, value, pct: (value / total) * 100, color: COLORS[name] || "#64748b" }))
    .sort((a, b) => b.value - a.value);
  const target = Object.entries(TARGET_PCTS)
    .map(([name, pct]) => ({ name, value: (pct / 100) * total, pct, color: COLORS[name] || "#64748b" }));
  const allCats = [...new Set([...Object.keys(buckets), ...Object.keys(TARGET_PCTS)])];
  const changes = allCats.map(name => {
    const fromVal = buckets[name] || 0;
    const fromPct = (fromVal / total) * 100;
    const toPct = TARGET_PCTS[name] || 0;
    const toVal = (toPct / 100) * total;
    return { name, from: fromPct, to: toPct, fromVal, toVal };
  }).sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));

  return { current, target, changes, total };
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f8fafc", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
      <div style={{ color: "#94a3b8" }}>{fmt(d.value)}</div>
      <div style={{ color: "#94a3b8" }}>{fmtPct(d.pct)}</div>
    </div>
  );
};

// ââ Gemini AI Helper âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const callGemini = async (apiKey, prompt, systemInstruction) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
};

const buildPortfolioContext = (data) => {
  const { current, target, changes, total } = data;
  let ctx = `PORTFOLIO SUMMARY\nTotal investable assets: ${fmt(total)}\n\n`;
  ctx += "CURRENT ALLOCATION:\n";
  current.forEach(c => { ctx += `  ${c.name}: ${fmt(c.value)} (${fmtPct(c.pct)})\n`; });
  ctx += "\nTARGET ALLOCATION:\n";
  target.forEach(t => { ctx += `  ${t.name}: ${fmtPct(t.pct)} (${fmt(t.value)})\n`; });
  ctx += "\nREBALANCING CHANGES NEEDED:\n";
  changes.forEach(ch => {
    const diff = ch.to - ch.from;
    if (Math.abs(diff) > 0.05) {
      ctx += `  ${ch.name}: ${fmtPct(ch.from)} \u2192 ${fmtPct(ch.to)} (${diff > 0 ? "+" : ""}${fmtPct(diff)}, ${diff > 0 ? "+" : ""}${fmt(ch.toVal - ch.fromVal)})\n`;
    }
  });
  return ctx;
};

const SYSTEM_INSTRUCTION = `You are a portfolio analysis assistant for a UK-based investor. You analyse their current portfolio allocation versus their target allocation and provide clear, actionable insights.

Important guidelines:
- Use GBP (\u00A3) for all monetary values
- Be specific with numbers and percentages
- Focus on practical, actionable recommendations
- Note that you are not a financial adviser and this is for informational purposes only
- Keep responses concise but thorough
- Use plain text formatting (no markdown headers or bold). Use line breaks and dashes for structure.`;

// ââ AI Review Component âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const AIReview = ({ data, geminiKey }) => {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runReview = async () => {
    if (!geminiKey) { setError("Please set your Gemini API key in AI Settings first."); return; }
    setLoading(true); setError(""); setReview(null);
    try {
      const ctx = buildPortfolioContext(data);
      const prompt = ctx + "\n\nPlease provide a comprehensive portfolio review covering:\n1. Overall assessment of the current allocation\n2. Key risks and overexposures\n3. Top 3-5 specific rebalancing recommendations with exact amounts\n4. Any general observations or concerns\n\nKeep the tone professional but accessible.";
      const result = await callGemini(geminiKey, prompt, SYSTEM_INSTRUCTION);
      setReview(result);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ ...S.card, marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: review ? 20 : 0 }}>
        <div>
          <div style={S.label}>AI Portfolio Review</div>
          <div style={{ fontSize: 14, color: "#cbd5e1" }}>On-demand analysis powered by Google Gemini</div>
        </div>
        <button onClick={runReview} disabled={loading} style={{ ...S.btn("#8b5cf6"), opacity: loading ? 0.6 : 1, minWidth: 140 }}>
          {loading ? "Analysing..." : review ? "\u21BA Run New Review" : "\u2728 Run Review"}
        </button>
      </div>
      {error && <div style={{ ...S.err, marginTop: 12, marginBottom: 0 }}>{error}</div>}
      {review && (
        <div style={{ marginTop: 8, padding: "18px 20px", background: "#080e1a", borderRadius: 8, border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "'Georgia','Times New Roman',serif" }}>
            {review}
          </div>
          <div style={{ marginTop: 12, fontSize: 10, color: "#334155", fontFamily: "monospace" }}>
            Generated by Gemini {"\u2014"} not financial advice
          </div>
        </div>
      )}
    </div>
  );
};

// ââ AI Chat Component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const AIChat = ({ data, geminiKey }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || loading) return;
    if (!geminiKey) { setError("Please set your Gemini API key in AI Settings first."); return; }

    setInput(""); setError("");
    const newMsgs = [...messages, { role: "user", text: q }];
    setMessages(newMsgs);
    setLoading(true);

    try {
      const ctx = buildPortfolioContext(data);
      // Build conversation history for context
      const history = newMsgs.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n\n");
      const prompt = `${ctx}\n\nCONVERSATION:\n${history}\n\nRespond to the user's latest message. Be helpful, specific, and reference their actual portfolio numbers where relevant.`;
      const result = await callGemini(geminiKey, prompt, SYSTEM_INSTRUCTION);
      setMessages(prev => [...prev, { role: "ai", text: result }]);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // Floating chat button when closed
  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)}
        style={{ position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #8b5cf6, #6366f1)", border: "none", cursor: "pointer", boxShadow: "0 4px 24px rgba(139,92,246,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#fff", zIndex: 1000, transition: "transform 0.15s" }}
        onMouseEnter={e => e.target.style.transform = "scale(1.1)"}
        onMouseLeave={e => e.target.style.transform = "scale(1)"}>
        {"\uD83D\uDCAC"}
      </button>
    );
  }

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, width: 400, height: 520, background: "#0d1526", borderRadius: 16, border: "1px solid #1e293b", boxShadow: "0 8px 48px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", zIndex: 1000, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 14, color: "#f8fafc", fontWeight: 600 }}>Portfolio AI Chat</div>
          <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginTop: 2 }}>Powered by Gemini</div>
        </div>
        <button onClick={() => setIsOpen(false)} style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 18, padding: 4 }}>{"\u2715"}</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 16px" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{"\uD83E\uDDE0"}</div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
              Ask me anything about your portfolio.
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {["Am I too heavily weighted in any area?", "What should I rebalance first?", "How risky is my current allocation?"].map(q => (
                <button key={q} onClick={() => { setInput(q); }} style={{ background: "#080e1a", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer", textAlign: "left", fontFamily: "'Georgia','Times New Roman',serif" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px", borderRadius: 12,
              background: m.role === "user" ? "#6366f1" : "#1e293b",
              color: m.role === "user" ? "#f8fafc" : "#cbd5e1",
              fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
              fontFamily: "'Georgia','Times New Roman',serif",
              borderBottomRightRadius: m.role === "user" ? 4 : 12,
              borderBottomLeftRadius: m.role === "ai" ? 4 : 12,
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ background: "#1e293b", borderRadius: 12, padding: "10px 14px", color: "#475569", fontSize: 13 }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Error */}
      {error && <div style={{ padding: "0 18px 8px", fontSize: 12, color: "#f87171" }}>{error}</div>}

      {/* Input */}
      <div style={{ padding: "12px 18px", borderTop: "1px solid #1e293b", display: "flex", gap: 8, flexShrink: 0 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Ask about your portfolio..."
          style={{ flex: 1, background: "#080e1a", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontSize: 13, fontFamily: "'Georgia','Times New Roman',serif", outline: "none" }}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ ...S.btn("#6366f1"), padding: "10px 16px", opacity: !input.trim() || loading ? 0.4 : 1 }}>
          {"\u2191"}
        </button>
      </div>
    </div>
  );
};

// ââ Styles âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const S = {
  page: { fontFamily: "'Georgia','Times New Roman',serif", background: "#080e1a", minHeight: "100vh", color: "#f1f5f9", padding: "40px 32px", boxSizing: "border-box" },
  centre: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32, boxSizing: "border-box" },
  card: { background: "#0d1526", borderRadius: 12, padding: "28px 24px", border: "1px solid #1e293b" },
  label: { fontSize: 10, letterSpacing: "0.15em", color: "#475569", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 8 },
  input: { width: "100%", boxSizing: "border-box", background: "#080e1a", border: "1px solid #1e293b", borderRadius: 8, padding: "12px 14px", color: "#f1f5f9", fontSize: 13, fontFamily: "monospace", outline: "none", marginBottom: 12 },
  btn: (col = "#f1f5f9") => ({ background: col, color: (col === "#f1f5f9" || col === "#fbbf24") ? "#080e1a" : "#f1f5f9", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 12, fontFamily: "monospace", letterSpacing: "0.1em", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }),
  ghost: { background: "transparent", border: "1px solid #1e293b", color: "#475569", borderRadius: 6, padding: "8px 14px", fontSize: 11, fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" },
  err: { background: "#1a0d0d", border: "1px solid #7f1d1d", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#fca5a5", marginBottom: 16 },
  step: { display: "flex", gap: 14, marginBottom: 16, alignItems: "flex-start" },
  stepNum: { width: 24, height: 24, borderRadius: "50%", background: "#1e293b", color: "#94a3b8", fontSize: 11, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
};

// ââ Screens âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const RUL_SEENA4E = { SETUP: "setup", AUTH: "auth", SHEET: "sheet", LOADED83loaded" };

export default function Portfolio() {
  const [screen, setScreen] = useState(SCREEN.SETUP);
  const [clientId, setClientId] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [token, setToken] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [hover, setHover] = useState(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiKeyInput, setAiKeyInput] = useState("");

  // Load saved settings from sessionStorage
  useEffect(() => {
    const savedClientId = sessionStorage.getItem("portfolio_clientId");
    const savedSheetUrl = sessionStorage.getItem("portfolio_sheetUrl");
    const savedGeminiKey = sessionStorage.getItem("portfolio_geminiKey");
    if (savedClientId) setClientId(savedClientId);
    if (savedSheetUrl) setSheetUrl(savedSheetUrl);
    if (savedGeminiKey) { setGeminiKey(savedGeminiKey); setAiKeyInput(savedGeminiKey); }
  }, []);

  const extractSheetId = (url) => {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : url.trim(); // allow raw ID too
  };

  const signIn = useCallback(() => {
    if (!clientId.trim()) { setError("Please enter your Client ID first."); return; }
    setError("");
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/userinfo.email",
        callback: async (resp) => {
          if (resp.error) { setError("Sign-in failed: " + resp.error); return; }
          setToken(resp.access_token);
          // Get email
          try {
            const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: "Bearer " + resp.access_token }
            });
            const u = await r.json();
            setUserEmail(u.email || "");
          } catch {}
          setScreen(SCREEN.SHEET);
        },
      });
      client.requestAccessToken();
    } catch (e) {
      setError("Could not initialise Google sign-in. Check your Client ID and that the Google script has loaded.");
    }
  }, [clientId]);

  const loadSheet = useCallback(async () => {
    setError(""); setLoading(true);
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) { setError("Couldn't find a Sheet ID in that URL."); setLoading(false); return; }
    try {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:Z`,
        { headers: { Authorization: "Bearer " + token } }
      );
      if (res.status === 401) { setError("Session expired \u2014 please sign in again."); setScreen(SCREEN.AUTH); setLoading(false); return; }
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      const rows = json.values || [];
      const processed = processRows(rows);
      setData(processed);
      setScreen(SCREEN.LOADED);
    } catch (e) {
      setError(e.message || "Failed to load sheet.");
    }
    setLoading(false);
  }, [sheetUrl, token]);

  const saveGeminiKey = () => {
    const k = aiKeyInput.trim();
    setGeminiKey(k);
    if (k) sessionStorage.setItem("portfolio_geminiKey", k);
    else sessionStorage.removeItem("portfolio_geminiKey");
    setShowAiSettings(false);
  };

  // ââ Setup screen âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  if (screen === SCREEN.SETUP) {
    return (
      <div style={{ ...S.page, ...S.centre, background: "#080e1a" }}>
        <div style={{ maxWidth: 580, width: "100%" }}>
          <div style={S.label}>One-time setup</div>
          <h1 style={{ fontSize: 26, fontWeight: 400, color: "#f8fafc", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            Connect Google Sheets securely
          </h1>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, marginBottom: 28 }}>
            You'll need a Google Cloud OAuth Client ID. This takes about 5 minutes and means your sheet stays completely private {"\u2014"} only you can access it.
          </p>

          {[
            { n: 1, text: <>Go to <span style={{ color: "#60a5fa" }}>console.cloud.google.com</span> {"\u2192"} Create a new project (or select existing)</> },
            { n: 2, text: <>APIs &amp; Services {"\u2192"} Enable APIs {"\u2192"} search <span style={{ color: "#60a5fa" }}>Google Sheets API</span> {"\u2192"} Enable</> },
            { n: 3, text: <>APIs &amp; Services {"\u2192"} Credentials {"\u2192"} Create Credentials {"\u2192"} <span style={{ color: "#60a5fa" }}>OAuth Client ID</span></> },
            { n: 4, text: <>Application type: <span style={{ color: "#60a5fa" }}>Web application</span>. Under Authorised JavaScript origins add <span style={{ color: "#60a5fa" }}>{window.location.origin}</span></> },
            { n: 5, text: <>Copy the <span style={{ color: "#60a5fa" }}>Client ID</span> and paste it below</> },
          ].map(({ n, text }) => (
            <div key={n} style={S.step}>
              <div style={S.stepNum}>{n}</div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, paddingTop: 3 }}>{text}</div>
            </div>
          ))}

          <div style={{ marginTop: 24 }}>
            <div style={S.label}>Your OAuth Client ID</div>
            <input
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com"
              style={S.input}
            />
          </div>

          {error && <div style={S.err}>{error}</div>}

          <button onClick={() => { if (!clientId.trim()) { setError("Please enter your Client ID."); return; } setError(""); sessionStorage.setItem("portfolio_clientId", clientId.trim()); setScreen(SCREEN.AUTH); }}
            style={S.btn()}>
            Continue {"\u2192"}
          </button>
        </div>
      </div>
    );
  }

  // ââ Auth screen âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  if (screen === SCREEN.AUTH) {
    return (
      <div style={{ ...S.page, ...S.centre, background: "#080e1a" }}>
        <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={S.label}>Authentication</div>
          <h1 style={{ fontSize: 26, fontWeight: 400, color: "#f8fafc", letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            Sign in with Google
          </h1>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, marginBottom: 32 }}>
            A popup will appear asking you to grant read-only access to your Google Sheets. Nothing is stored or transmitted anywhere else.
          </p>

          {error && <div style={{ ...S.err, textAlign: "left" }}>{error}</div>}

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button onClick={() => setScreen(SCREEN.SETUP)} style={S.ghost}>{"\u2190"} Back</button>
            <button onClick={signIn} style={S.btn()}>Sign in with Google {"\u2192"}</button>
          </div>
        </div>
      </div>
    );
  }

  // ââ Sheet selection screen âââââââââââââââââââââââââââââââââââââââââââââââ
  if (screen === SCREEN.SHEET) {
    return (
      <div style={{ ...S.page, ...S.centre, background: "#080e1a" }}>
        <div style={{ maxWidth: 500, width: "100%" }}>
          {userEmail && (
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#334155", marginBottom: 20 }}>
              {"\u25CF"} Signed in as {userEmail}
            </div>
          )}
          <div style={S.label}>Load your sheet</div>
          <h1 style={{ fontSize: 26, fontWeight: 400, color: "#f8fafc", letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            Paste your Sheet URL
          </h1>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, marginBottom: 24 }}>
            The sheet does not need to be shared with anyone. Your sign-in grants direct access.
          </p>

          <div style={S.label}>Google Sheets URL</div>
          <input
            value={sheetUrl}
            onChange={e => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            style={S.input}
            onKeyDown={e => e.key === "Enter" && loadSheet()}
          />

          {error && <div style={S.err}>{error}</div>}

          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setScreen(SCREEN.AUTH)} style={S.ghost}>{"\u2190"} Back</button>
            <button onClick={() => { if (sheetUrl) sessionStorage.setItem("portfolio_sheetUrl", sheetUrl); loadSheet(); }} disabled={(sheetUrl || loading} style={{ ...S.btn(), opacity: !sheetUrl ? 0.4 : 1 }}>
              {loading ? "Loading..." : "Load Dashboard \u2192"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ââ Dashboard âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  if (!data) return null;
  const { current, target, changes, total } = data;
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ marginBottom: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ ...S.label, marginBottom: 8 }}>Live Portfolio {"\u2014"} {fmt(total)} Investable</div>
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            Current <span style={{ color: "#334155" }}>{"\u2192"}</span> Target Allocation
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {userEmail && <span style={{ fontSize: 11, fontFamily: "monospace", color: "#334155" }}>{"\u25CF"} {userEmail}</span>}
          <button onClick={() => { setShowAiSettings(!showAiSettings); }} style={{ ...S.ghost, borderColor: geminiKey ? "#8b5cf6" : "#1e293b", color: geminiKey ? "#8b5cf6" : "#475569" }}>
            {"\u2699"} AI {geminiKey ? "\u25CF" : ""}
          </button>
          <button onClick={() => { setScreen(SCREEN.SHEET); setData(null); }} style={S.ghost}>{"\u21BA"} Refresh</button>
          <button onClick={() => { setScreen(SCREEN.SETUP); setToken(null); setData(null); }} style={S.ghost}>Sign out</button>
        </div>
      </div>

      {/* AI Settings Panel */}
      {showAiSettings && (
        <div style={{ ...S.card, marginBottom: 24, borderColor: "#8b5cf6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, marginRight: 16 }}>
              <div style={S.label}>AI Settings {"\u2014"} Google Gemini</div>
              <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, marginTop: 4, marginBottom: 12 }}>
                Enter your Gemini API key to enable AI portfolio review and chat. Get a free key at{" "}
                <span style={{ color: "#8b5cf6" }}>aistudio.google.com/apikey</span>.
                Your key is stored only in this browser session.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={aiKeyInput}
                  onChange={e => setAiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  type="password"
                  style={{ ...S.input, marginBottom: 0, flex: 1 }}
                />
                <button onClick={saveGeminiKey} style={S.btn("#8b5cf6")}>Save</button>
              </div>
            </div>
            <button onClick={() => setShowAiSettings(false)} style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 16 }}>{"\u2715"}</button>
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 40 }}>
        {[{ label: "Current", data: current, subtitle: "Your portfolio today" },
          { label: "Target", data: target, subtitle: "Suggested rebalance" }].map(({ label, data: d, subtitle }) => (
          <div key={label} style={S.card}>
            <div style={S.label}>{[abel}</div>
            <div style={{ fontSize: 18, marginBottom: 20, color: "#cbd5e1" }}>{subtitle}</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={d} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                  {d.map((e, i) => <Cell key={i} fill={e.color} opacity={0.9} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 16 }}>
              {d.map(e => (
                <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                  {e.name} <span style={{ color: "#94a3b8" }}>{fmtPct(e.pct)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* AI Portfolio Review */}
      <AIReview data={data} geminiKey={geminiKey} />

      {/* Change Table */}
      <div style={{ ...S.card, padding: 0, overflow: "hidden", marginBottom: 28 }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #1e293b" }}>
          <div style={S.label}>Allocation Changes</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.8fr", padding: "10px 24px", fontSize: 10, letterSpacing: "0.12em", color: "#334155", textTransform: "uppercase", fontFamily: "monospace", borderBottom: "1px solid #0f1d33" }}>
          <span>Asset</span><span style={{ textAlign: "right" }}>Current</span>
          <span style={{ textAlign: "right" }}>Target</span><span style={{ textAlign: "right" }}>Shift</span>
          <span style={{ textAlign: "right" }}>Movement</span>
        </div>
        {changes.map((row, i) => {
          const diff = row.to - row.from;
          const valDiff = row.toVal - row.fromVal;
          const up = diff > 0.05, down = diff < -0.05;
          const col = !up && !down ? "#475569" : up ? "#34d399" : "#f87171";
          return (
            <div key={row.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.8fr", padding: "14px 24px", borderBottom: i < changes.length - 1 ? "1px solid #0f1d33" : "none", alignItems: "center", background: hover === i ? "#111e36" : "transparent", transition: "background 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[row.name] || "#64748b", flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "#cbd5e1" }}>{row.name}</span>
              </div>
              <div style={{ textAlign: "right", fontFamily: "monospace" }}>
                <div style={{ fontSize: 13, color: "#cbd5e1" }}>{fmt(row.fromVal)}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{fmtPct(row.from)}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>{fmtPct(row.to)}</div>
              <div style={{ textAlign: "right", fontSize: 13, fontFamily: "monospace", color: col, fontWeight: 600 }}>
                {!up && !down ? "\u2014" : (up ? "+" : "") + fmtPct(diff)}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: col, fontFamily: "monospace", marginBottom: 4 }}>
                  {!up && !down ? "\u2014" : (valDiff > 0 ? "+" : "") + fmt(valDiff)}
                </div>
                <div style={{ height: 3, borderRadius: 2, background: "#1e293b", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(row.to, 100)}%`, background: COLORS[row.name] || "#64748b", borderRadius: 2 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {[
          { label: "Largest Reduction", get: () => { const c = changes.filter(r => r.to - r.from < -0.05).sort((a,b) => (a.to-a.from)-(b.to-b.from))[0]; return c ? [`\u2212${fmt(Math.abs(c.toVal-c.fromVal))}`, `${c.name}: ${fmtPct(c.from)} \u2192 ${fmtPct(c.to)}`, "#f87171"] : ["\u2014","","#f87171"]; }},
          { label: "Largest Increase", get: () => { const c = changes.filter(r => r.to - r.from > 0.05).sort((a,b) => (b.to-b.from)-(a.to-a.from))[0]; return c ? [`+${fmt(c.toVal-c.fromVal)}`, `${c.name}: ${fmtPct(c.from)} \u2192 ${fmtPct(c.to)}`, "#34d399"] : ["\u2014","","#34d399"]; }},
          { label: "Total Investable", get: () => [fmt(total), "Excl. primary residence", "#60a5fa"] },
        ].map(({ label, get }) => {
          const [value, note, color] = get();
          return (
            <div key={label} style={{ ...S.card, padding: "18px 20px" }}>
              <div style={{ ...S.label, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 22, color, fontFamily: "monospace", marginBottom: 4 }}>{value}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>{note}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, fontSize: 10, color: "#1e293b", fontFamily: "monospace", textAlign: "center" }}>
        FOR PERSONAL PLANNING USE ONLY {"\u2014"} NOT FINANCIAL ADVICE
      </div>

      {/* AI Chat Floating Panel */}
      <AIChat data={data} geminiKey={geminiKey} />
    </div>
  );
}
