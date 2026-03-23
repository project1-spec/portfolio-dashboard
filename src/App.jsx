import { useState, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const COLORS = {
  Cash: "#94a3b8",
  Bonds: "#60a5fa",
  Equities: "#34d399",
  "Private Investments": "#a78bfa",
  Gold: "#fbbf24",
  Silver: "#e2e8f0",
  Crypto: "#f97316",
  "Investment Property": "#fb7185",
  Alternatives: "#2dd4bf",
};

const TARGET_PCTS = {
  Cash: 20,
  Bonds: 15,
  Equities: 30,
  "Private Investments": 8,
  Gold: 8,
  Silver: 2,
  Crypto: 2,
  "Investment Property": 10,
  Alternatives: 5,
};

const SCREEN = {
  SETUP: "setup",
  AUTH: "auth",
  SHEET: "sheet",
  LOADED: "loaded",
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

const fmt = (v) => "\u00A3" + Math.round(v).toLocaleString("en-GB");
const fmtPct = (v) => v.toFixed(1) + "%";

const categorise = (label) => {
  const l = label.toLowerCase();
  if (l.includes("cash") || l.includes("current account") || l.includes("savings"))
    return "Cash";
  if (l.includes("bond") || l.includes("gilt") || l.includes("fixed income"))
    return "Bonds";
  if (l.includes("gold")) return "Gold";
  if (l.includes("silver")) return "Silver";
  if (l.includes("crypto") || l.includes("bitcoin") || l.includes("ethereum"))
    return "Crypto";
  if (l.includes("private")) return "Private Investments";
  if (
    l.includes("property") ||
    l.includes("real estate") ||
    l.includes("reit")
  )
    return "Investment Property";
  if (
    l.includes("alternative") ||
    l.includes("hedge") ||
    l.includes("commodity")
  )
    return "Alternatives";
  if (
    l.includes("coutts") ||
    l.includes("hsbc") ||
    l.includes("trading 212") ||
    l.includes("equit") ||
    l.includes("mixed assets") ||
    l.includes("public") ||
    l.includes("stock") ||
    l.includes("fund") ||
    l.includes("isa") ||
    l.includes("sipp")
  )
    return "Equities";
  return null;
};

const processRows = (rows) => {
  const buckets = {};
  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const label = (row[0] || "").toString().trim();
    const ll = label.toLowerCase();
    if (!label) continue;
    if (
      ll.includes("total") ||
      ll.includes("house") ||
      ll.includes("giveaway") ||
      ll.includes("managed portfolio")
    )
      continue;

    let value = null;
    for (let i = 1; i < row.length; i++) {
      const cleaned = (row[i] || "").toString().replace(/[\u00A3,\s]/g, "");
      const n = parseFloat(cleaned);
      if (!isNaN(n) && n > 0) {
        value = n;
        break;
      }
    }
    if (value === null) continue;

    const cat = categorise(label);
    if (!cat) continue;
    buckets[cat] = (buckets[cat] || 0) + value;
  }

  if (Object.keys(buckets).length === 0) {
    throw new Error("No asset data found. Check the sheet layout.");
  }

  const total = Object.values(buckets).reduce((a, b) => a + b, 0);

  const current = Object.entries(buckets)
    .map(([name, value]) => ({
      name,
      value,
      pct: (value / total) * 100,
      color: COLORS[name] || "#64748b",
    }))
    .sort((a, b) => b.value - a.value);

  const target = Object.entries(TARGET_PCTS).map(([name, pct]) => ({
    name,
    value: (pct / 100) * total,
    pct,
    color: COLORS[name] || "#64748b",
  }));

  const allCats = [
    ...new Set([...Object.keys(buckets), ...Object.keys(TARGET_PCTS)]),
  ];

  const changes = allCats
    .map((name) => {
      const fromVal = buckets[name] || 0;
      const fromPct = (fromVal / total) * 100;
      const toPct = TARGET_PCTS[name] || 0;
      const toVal = (toPct / 100) * total;
      return { name, from: fromPct, to: toPct, fromVal, toVal };
    })
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));

  return { current, target, changes, total };
};

const extractSheetId = (url) => {
  const m = url.match(/\/spreadsheets\/d\/([-\w]+)/);
  return m ? m[1] : url.trim();
};

const GEMINI_SYSTEM = `You are a portfolio analysis assistant for a UK-based investor. You analyze their current portfolio allocation versus their target allocation and provide clear, actionable insights.

Important guidelines:
- Use GBP (\u00A3) for all monetary values
- Be specific with numbers and percentages
- Focus on practical, actionable recommendations
- Note that you are not a financial adviser and this is for informational purposes only
- Keep responses concise but thorough
- Use plain text formatting (no markdown headers or bold). Use line breaks and dashes for structure.`;

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
  return (
    json.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No response generated."
  );
};

const buildPortfolioContext = (data) => {
  const { current, target, changes, total } = data;
  let ctx = `PORTFOLIO SUMMARY\nTotal investable assets: £${Math.round(total).toLocaleString("en-GB")}\n\n`;
  ctx += "CURRENT ALLOCATION:\n";
  current.forEach((c) => {
    ctx += `  ${c.name}: £${Math.round(c.value).toLocaleString("en-GB")} (${c.pct.toFixed(1)}%)\n`;
  });
  ctx += "\nTARGET ALLOCATION:\n";
  target.forEach((t) => {
    ctx += `  ${t.name}: ${t.pct.toFixed(1)}% (£${Math.round(t.value).toLocaleString("en-GB")})\n`;
  });
  ctx += "\nREBALANCING CHANGES NEEDED:\n";
  changes.forEach((ch) => {
    const diff = ch.to - ch.from;
    if (Math.abs(diff) > 0.05) {
      ctx += `  ${ch.name}: ${ch.from.toFixed(1)}% → ${ch.to.toFixed(1)}% (${diff > 0 ? "+" : ""}${diff.toFixed(1)}%, ${diff > 0 ? "+" : ""}£${Math.round(ch.toVal - ch.fromVal).toLocaleString("en-GB")})\n`;
    }
  });
  return ctx;
};

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════════════ */

const S = {
  page: {
    fontFamily: "'Georgia','Times New Roman',serif",
    background: "#080e1a",
    minHeight: "100vh",
    color: "#f1f5f9",
    padding: "40px 32px",
    boxSizing: "border-box",
  },
  centre: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 32,
    boxSizing: "border-box",
  },
  card: {
    background: "#0d1526",
    borderRadius: 12,
    padding: "28px 24px",
    border: "1px solid #1e293b",
  },
  label: {
    fontSize: 10,
    letterSpacing: "0.15em",
    color: "#475569",
    textTransform: "uppercase",
    fontFamily: "monospace",
    marginBottom: 8,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#080e1a",
    border: "1px solid #1e293b",
    borderRadius: 8,
    padding: "12px 14px",
    color: "#f1f5f9",
    fontSize: 13,
    fontFamily: "monospace",
    outline: "none",
    marginBottom: 12,
  },
  btn: (col = "#f1f5f9") => ({
    background: col,
    color: col === "#f1f5f9" || col === "#fbbf24" ? "#080e1a" : "#f1f5f9",
    border: "none",
    borderRadius: 8,
    padding: "12px 24px",
    fontSize: 12,
    fontFamily: "monospace",
    letterSpacing: "0.1em",
    cursor: "pointer",
    textTransform: "uppercase",
    fontWeight: 700,
  }),
  ghost: {
    background: "transparent",
    border: "1px solid #1e293b",
    color: "#475569",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 11,
    fontFamily: "monospace",
    cursor: "pointer",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  err: {
    background: "#1a0d0d",
    border: "1px solid #7f1d1d",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 13,
    color: "#fca5a5",
    marginBottom: 16,
  },
  step: {
    display: "flex",
    gap: 14,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: "#1e293b",
    color: "#94a3b8",
    fontSize: 11,
    fontFamily: "monospace",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        color: "#f8fafc",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
      <div style={{ color: "#94a3b8" }}>£{Math.round(d.value).toLocaleString("en-GB")}</div>
      <div style={{ color: "#94a3b8" }}>{d.pct.toFixed(1)}%</div>
    </div>
  );
};

const AIReview = ({ data, geminiKey }) => {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runReview = async () => {
    if (!geminiKey) {
      setError("Please set your Gemini API key in AI Settings first.");
      return;
    }
    setLoading(true);
    setError("");
    setReview(null);
    try {
      const ctx = buildPortfolioContext(data);
      const prompt =
        ctx +
        "\n\nPlease provide a comprehensive portfolio review covering:\n" +
        "1. Overall assessment of the current allocation\n" +
        "2. Key risks and overexposures\n" +
        "3. Top 3-5 specific rebalancing recommendations with exact amounts\n" +
        "4. Any general observations or concerns\n\n" +
        "Keep the tone professional but accessible.";
      const result = await callGemini(geminiKey, prompt, GEMINI_SYSTEM);
      setReview(result);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ ...S.card, marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: review ? 20 : 0,
        }}
      >
        <div>
          <div style={S.label}>AI Portfolio Review</div>
          <div style={{ fontSize: 14, color: "#cbd5e1" }}>
            On-demand analysis powered by Google Gemini
          </div>
        </div>
        <button
          onClick={runReview}
          disabled={loading}
          style={{
            ...S.btn("#8b5cf6"),
            opacity: loading ? 0.6 : 1,
            minWidth: 140,
          }}
        >
          {loading
            ? "Analysing..."
            : review
            ? "\u21BA Run New Review"
            : "\u27A8 Run Review"}
        </button>
      </div>
      {error && (
        <div style={{ ...S.err, marginTop: 12, marginBottom: 0 }}>{error}</div>
      )}
      {review && (
        <div
          style={{
            marginTop: 8,
            padding: "18px 20px",
            background: "#080e1a",
            borderRadius: 8,
            border: "1px solid #1e293b",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#cbd5e1",
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
              fontFamily: "'Georgia','Times New Roman',serif",
            }}
          >
            {review}
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 10,
              color: "#334155",
              fontFamily: "monospace",
            }}
          >
            Generated by Gemini → not financial advice
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   AI CHAT
   ═══════════════════════════════════════════════════════════════════════════ */

const AIChat = ({ data, geminiKey }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current)
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || loading) return;
    if (!geminiKey) {
      setError("Please set your Gemini API key in AI Settings first.");
      return;
    }

    setInput("");
    setError("");
    const newMsgs = [...messages, { role: "user", text: q }];
    setMessages(newMsgs);
    setLoading(true);

    try {
      const ctx = buildPortfolioContext(data);
      const history = newMsgs
        .map(
          (m) =>
            `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`
        )
        .join("\n\n");
      const prompt = `${ctx}\n\nCONVERSATION:\n${history}\n\nRespond to the user's latest message. Be helpful, specific, and reference their actual portfolio numbers where relevant.`;
      const result = await callGemini(geminiKey, prompt, GEMINI_SYSTEM);
      setMessages((prev) => [...prev, { role: "ai", text: result }]);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const suggestedQuestions = [
    "Am I too heavily weighted in any area?",
    "What should I rebalance first?",
    "How risky is my current allocation?",
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 24px rgba(139,92,246,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          color: "#fff",
          zIndex: 1000,
          transition: "transform 0.15s",
        }}
        onMouseEnter={(e) => (e.target.style.transform = "scale(1.1)")}
        onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
      >
        {"\uD83D\uDCAC"}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 400,
        height: 520,
        background: "#0d1526",
        borderRadius: 16,
        border: "1px solid #1e293b",
        boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 14, color: "#f8fafc", fontWeight: 600 }}>
            Portfolio AI Chat
          </div>
          <div
            style={{
              fontSize: 10,
              color: "#475569",
              fontFamily: "monospace",
              marginTop: 2,
            }}
          >
            Powered by Gemini
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: "transparent",
            border: "none",
            color: "#475569",
            cursor: "pointer",
            fontSize: 18,
            padding: 4,
          }}
        >
          {"\u2717"}
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 16px" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              {"\uD83E\uDDE0"}
            </div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
              Ask me anything about your portfolio.
            </div>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  style={{
                    background: "#080e1a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    padding: "10px 12px",
                    color: "#94a3b8",
                    fontSize: 12,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "'Georgia','Times New Roman',serif",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: 12,
                background: m.role === "user" ? "#6366f1" : "#1e293b",
                color: m.role === "user" ? "#f8fafc" : "#cbd5e1",
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                fontFamily: "'Georgia','Times New Roman',serif",
                borderBottomRightRadius: m.role === "user" ? 4 : 12,
                borderBottomLeftRadius: m.role === "ai" ? 4 : 12,
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                background: "#1e293b",
                borderRadius: 12,
                padding: "10px 14px",
                color: "#475569",
                fontSize: 13,
              }}
            >
              Thinking...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "0 18px 8px", fontSize: 12, color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Input */}
      <div
        style={{
          padding: "12px 18px",
          borderTop: "1px solid #1e293b",
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && !e.shiftKey && sendMessage()
          }
          placeholder="Ask about your portfolio"
          style={{
            flex: 1,
            background: "#0d1526",
            border: "1px solid #1e293b",
            borderRadius: 8,
            padding: "8px 12px",
            color: "#f1f5f9",
            fontSize: 13,
            outline: "none",
            fontFamily: "'Georgia','Times New Roman',serif",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            ...S.btn("#6366f1"),
            opacity: loading || !input.trim() ? 0.4 : 1,
            padding: "8px 12px",
            minWidth: 0,
          }}
        >
          {"⤴"}
        </button>
      </div>
    </div>
  );
};

const App = ({ data, geminiKey, onBack }) => {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div style={S.page}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 40,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 32,
                color: "#f1f5f9",
                marginBottom: 8,
                fontWeight: "bold",
              }}
            >
              Portfolio Dashboard
            </h1>
            <p style={{ color: "#94a3b8", fontSize: 14 }}>
              £{Math.round(data.total).toLocaleString("en-GB")} under management
            </p>
          </div>
          <button
            onClick={onBack}
            style={{
              ...S.ghost,
            }}
          >
            ↩ Back
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            marginBottom: 32,
          }}
        >
          <div style={S.card}>
            <div style={S.label}>Current Allocation</div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.current}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.current.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={S.card}>
            <div style={S.label}>Target Allocation</div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.target}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.target.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <AIReview data={data} geminiKey={geminiKey} />
      </div>
      <AIChat data={data} geminiKey={geminiKey} />
    </div>
  );
};

export default App;
