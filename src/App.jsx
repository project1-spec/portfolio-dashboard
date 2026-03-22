import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = {
  Cash: "#94a3b8", Bonds: "#60a5fa", Equities: "#34d399",
  "Private Investments": "#a78bfa", Gold: "#fbbf24", Silver: "#e2e8f0",
  Crypto: "#f97316", "Investment Property": "#fb7185", Alternatives: "#2dd4bf",
};

const TARGET_PCTS = {
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

const fmt = (v) => "Â£" + Math.round(v).toLocaleString("en-GB");
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
      const cleaned = (row[i] || "").toString().replace(/[Â£,\s]/g, "");
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

// ââ Styles ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const S = {
  page: { fontFamily: "'Georgia','Times New Roman',serif", background: "#080e1a", minHeight: "100vh", color: "#f1f5f9", padding: "40px 32px", boxSizing: "border-box" },
  centre: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32, boxSizing: "border-box" },
  card: { background: "#0d1526", borderRadius: 12, padding: "28px 24px", border: "1px solid #1e293b" },
  label: { fontSize: 10, letterSpacing: "0.15em", color: "#475569", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 8 },
  input: { width: "100%", boxSizing: "border-box", background: "#080e1a", border: "1px solid #1e293b", borderRadius: 8, padding: "12px 14px", color: "#f1f5f9", fontSize: 13, fontFamily: "monospace", outline: "none", marginBottom: 12 },
  btn: (col = "#f1f5f9") => ({ background: col, color: col === "#f1f5f9" ? "#080e1a" : "#f1f5f9", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 12, fontFamily: "monospace", letterSpacing: "0.1em", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }),
  ghost: { background: "transparent", border: "1px solid #1e293b", color: "#475569", borderRadius: 6, padding: "8px 14px", fontSize: 11, fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" },
  err: { background: "#1a0d0d", border: "1px solid #7f1d1d", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#fca5a5", marginBottom: 16 },
  step: { display: "flex", gap: 14, marginBottom: 16, alignItems: "flex-start" },
  stepNum: { width: 24, height: 24, borderRadius: "50%", background: "#1e293b", color: "#94a3b8", fontSize: 11, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
};

// ââ Screens âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const SCREEN = { SETUP: "setup", AUTH: "auth", SHEET: "sheet", LOADED: "loaded" };

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

  // Load saved settings from sessionStorage
  useEffect(() => {
    const savedClientId = sessionStorage.getItem("portfolio_clientId");
    const savedSheetUrl = sessionStorage.getItem("portfolio_sheetUrl");
    if (savedClientId) setClientId(savedClientId);
    if (savedSheetUrl) setSheetUrl(savedSheetUrl);
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
      if (res.status === 401) { setError("Session expired â please sign in again."); setScreen(SCREEN.AUTH); setLoading(false); return; }
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
            You'll need a Google Cloud OAuth Client ID. This takes about 5 minutes and means your sheet stays completely private â only you can access it.
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
            <button onClick={() => setScreen(SCREEN.SETUP)} style={S.ghost}>â Back</button>
            <button onClick={signIn} style={S.btn()}>Sign in with Google {"\u2192"}</button>
          </div>
        </div>
      </div>
    );
  }

  // ââ Sheet selection screen ââââââââââââââââââââââââââââââââââââââââââââââââ
  if (screen === SCREEN.SHEET) {
    return (
      <div style={{ ...S.page, ...S.centre, background: "#080e1a" }}>
        <div style={{ maxWidth: 500, width: "100%" }}>
          {userEmail && (
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#334155", marginBottom: 20 }}>
              â Signed in as {userEmail}
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
            <button onClick={() => setScreen(SCREEN.AUTH)} style={S.ghost}>â Back</button>
            <button onClick={() => { if (sheetUrl) sessionStorage.setItem("portfolio_sheetUrl", sheetUrl); loadSheet(); }} disabled={!sheetUrl || loading} style={{ ...S.btn(), opacity: !sheetUrl ? 0.4 : 1 }}>
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
          <div style={{ ...S.label, marginBottom: 8 }}>Live Portfolio â {fmt(total)} Investable</div>
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            Current <span style={{ color: "#334155" }}>{"\u2192"}</span> Target Allocation
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {userEmail && <span style={{ fontSize: 11, fontFamily: "monospace", color: "#334155" }}>â {userEmail}</span>}
          <button onClick={() => { setScreen(SCREEN.SHEET); setData(null); }} style={S.ghost}>âº Refresh</button>
          <button onClick={() => { setScreen(SCREEN.SETUP); setToken(null); setData(null); }} style={S.ghost}>Sign out</button>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 40 }}>
        {[{ label: "Current", data: current, subtitle: "Your portfolio today" },
          { label: "Target", data: target, subtitle: "Suggested rebalance" }].map(({ label, data: d, subtitle }) => (
          <div key={label} style={S.card}>
            <div style={S.label}>{label}</div>
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
              <div style={{ textAlign: "right", fontSize: 13, color: "#64748b", fontFamily: "monospace" }}>{fmtPct(row.from)}</div>
              <div style={{ textAlign: "right", fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>{fmtPct(row.to)}</div>
              <div style={{ textAlign: "right", fontSize: 13, fontFamily: "monospace", color: col, fontWeight: 600 }}>
                {!up && !down ? "â" : (up ? "+" : "") + fmtPct(diff)}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: col, fontFamily: "monospace", marginBottom: 4 }}>
                  {!up && !down ? "â" : (valDiff > 0 ? "+" : "") + fmt(valDiff)}
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
          { label: "Largest Reduction", get: () => { const c = changes.filter(r => r.to - r.from < -0.05).sort((a,b) => (a.to-a.from)-(b.to-b.from))[0]; return c ? [`â${fmt(Math.abs(c.toVal-c.fromVal))}`, `${c.name}: ${fmtPct(c.from)} \u2192 ${fmtPct(c.to)}`, "#f87171"] : ["â","","#f87171"]; }},
          { label: "Largest Increase", get: () => { const c = changes.filter(r => r.to - r.from > 0.05).sort((a,b) => (b.to-b.from)-(a.to-a.from))[0]; return c ? [`+${fmt(c.toVal-c.fromVal)}`, `${c.name}: ${fmtPct(c.from)} \u2192 ${fmtPct(c.to)}`, "#34d399"] : ["â","","#34d399"]; }},
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
        FOR PERSONAL PLANNING USE ONLY â NOT FINANCIAL ADVICE
      </div>
    </div>
  );
}
