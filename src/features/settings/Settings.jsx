import { useEffect, useMemo, useState } from "react";
import { Box, Button, CircularProgress, MenuItem, Stack, TextField } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { TimePicker } from "antd";
import dayjs from "dayjs";
import locale from "antd/es/date-picker/locale/ja_JP";
import "antd/dist/reset.css";
import { apiUrl, authUrl } from "../../lib/apiBase";
import { applyAppThemeToDom } from "../../lib/appTheme";
import { buildMuiTheme } from "../../lib/muiTheme";

function normalizeHex(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "";
}

function hexToRgbCsv(hex) {
  const s = String(hex || "").trim().toLowerCase();
  const m = s.match(/^#([0-9a-f]{6})$/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `${r}, ${g}, ${b}`;
}

export default function SettingsPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [weeksOffset, setWeeksOffset] = useState(1);
  const [hour, setHour] = useState(15);
  const [minute, setMinute] = useState(0);

  const THEME_PRESETS = [
    { label: "グレー", value: "#6b7280" },
    { label: "ブルー", value: "#3b82f6" },
    { label: "エメラルド", value: "#10b981" },
    { label: "アンバー", value: "#f59e0b" },
    { label: "ローズ", value: "#f43f5e" },
  ];
  const [accent, setAccent] = useState("#6b7280");
  const previewMuiTheme = useMemo(
    () => buildMuiTheme({ accent, scope: "sidebar" }),
    [accent]
  );
  const previewRgb = useMemo(() => hexToRgbCsv(normalizeHex(accent)), [accent]);

  const [participantNameCount, setParticipantNameCount] = useState(1);

  const timeValue = useMemo(() => {
    return dayjs().hour(hour).minute(minute).second(0);
  }, [hour, minute]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setError(null);
      setNotice(null);
      setLoading(true);
      try {
        const me = await fetch(authUrl("/auth/me"), { credentials: "include" });
        const meData = await me.json().catch(() => ({}));
        const isLoggedIn = Boolean(meData?.loggedIn);
        if (cancelled) return;
        setLoggedIn(isLoggedIn);
        if (!isLoggedIn) return;

        const [r1, r2, r3] = await Promise.allSettled([
          fetch(apiUrl("/user-settings/default-schedule"), { credentials: "include" }),
          fetch(apiUrl("/user-settings/theme"), { credentials: "include" }),
          fetch(apiUrl("/user-settings/form-defaults"), { credentials: "include" }),
        ]);

        if (r1.status === "fulfilled" && r1.value.ok) {
          const data = await r1.value.json().catch(() => ({}));
          const s = data?.settings || {};
          setWeeksOffset(Number(s?.weeksOffset) || 1);
          setHour(Number(s?.hour) || 15);
          setMinute(Number(s?.minute) || 0);
        }
        if (r2.status === "fulfilled" && r2.value.ok) {
          const data = await r2.value.json().catch(() => ({}));
          const s = data?.settings || {};
          setAccent(normalizeHex(s?.accent) || "#6b7280");
        }
        if (r3.status === "fulfilled" && r3.value.ok) {
          const data = await r3.value.json().catch(() => ({}));
          const s = data?.settings || {};
          setParticipantNameCount(Number(s?.participantNameCount) || 1);
        }
      } catch {
        if (cancelled) return;
        setError("設定の読み込みに失敗しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSaveAll = async () => {
    setError(null);
    setNotice(null);
    setSavingAll(true);
    try {
      const [rSchedule, rDefaults, rTheme] = await Promise.allSettled([
        fetch(apiUrl("/user-settings/default-schedule"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ weeksOffset, hour, minute }),
        }),
        fetch(apiUrl("/user-settings/form-defaults"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ participantNameCount }),
        }),
        fetch(apiUrl("/user-settings/theme"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ accent, scope: "sidebar" }),
        }),
      ]);

      const failures = [];

      const check = async (label, settled) => {
        if (settled.status !== "fulfilled") {
          failures.push(label);
          return null;
        }
        if (settled.value.status === 401) {
          setLoggedIn(false);
          failures.push(label);
          return null;
        }
        const data = await settled.value.json().catch(() => ({}));
        if (!settled.value.ok) {
          failures.push(label);
          return { ok: false, data };
        }
        return { ok: true, data };
      };

      const a = await check("開催日程", rSchedule);
      const b = await check("入力人数", rDefaults);
      const c = await check("テーマ", rTheme);

      if (failures.length > 0) {
        setError(`保存に失敗しました：${failures.join(" / ")}`);
        return;
      }

      // Apply theme immediately (confirm it's reflected).
      try {
        const s = c?.data?.settings || { accent, scope: "sidebar" };
        applyAppThemeToDom(s);
        window.localStorage.setItem("gformgen.theme", JSON.stringify(s));
      } catch {
        // ignore
      }

      setNotice("保存しました。");
    } catch {
      setError("保存に失敗しました。ログイン状態も確認してください。");
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0, color: "var(--app-text)" }}>設定</h2>

      {loading ? (
        <Box
          sx={{
            height: 240,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="設定を読み込み中"
        >
          <CircularProgress size={44} />
        </Box>
      ) : !loggedIn ? (
        <Box sx={{ color: "#334155", fontWeight: 800, lineHeight: 1.7 }}>
          ログインが必要です。
        </Box>
      ) : (
        <>
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ margin: "8px 0 12px", color: "var(--app-text)" }}>作成画面の既定値</h3>
            <Box
              sx={{
                border: "1px solid rgba(148,163,184,0.35)",
                borderRadius: 2,
                padding: 2,
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 2,
                  alignItems: "start",
                }}
              >
                {/* 開催日程 */}
                <Box>
                  <div style={{ fontWeight: 900, color: "var(--app-text)", marginBottom: 10 }}>
                    開催日程
                  </div>
                  <Stack spacing={2}>
                    <TextField
                      select
                      label="日付（何週間後）"
                      value={weeksOffset}
                      onChange={(e) => setWeeksOffset(Number(e.target.value))}
                      disabled={loading || savingAll}
                    >
                      <MenuItem value={1}>本日 + 1週間</MenuItem>
                      <MenuItem value={2}>本日 + 2週間</MenuItem>
                      <MenuItem value={3}>本日 + 3週間</MenuItem>
                    </TextField>
        
        <div>
                      <div style={{ fontWeight: 800, marginBottom: 6, color: "var(--app-text)" }}>
                        時刻
                      </div>
                      <TimePicker
                        locale={locale}
                        value={timeValue}
                        format="HH:mm"
                        minuteStep={15}
                        hideDisabledOptions
                        showNow={false}
                        showSecond={false}
                        disabled={loading || savingAll}
                        disabledTime={() => ({
                          disabledHours: () =>
                            Array.from({ length: 24 }, (_, i) => i).filter((h) => h < 8 || h > 20),
                          disabledMinutes: () =>
                            Array.from({ length: 60 }, (_, i) => i).filter((m) => m % 15 !== 0),
                        })}
                        onChange={(t) => {
                          if (!t) return;
                          setHour(t.hour());
                          setMinute(t.minute());
                        }}
                        style={{ width: "100%", height: 44 }}
                      />
                    </div>
                  </Stack>
                </Box>

                {/* 入力人数 */}
                <Box>
                  <div style={{ fontWeight: 900, color: "var(--app-text)", marginBottom: 10 }}>
                    入力人数
        </div>
                  <Stack spacing={2}>
                    <TextField
                      select
                      label="参加者名の入力人数（1回答あたり）"
                      value={participantNameCount}
                      onChange={(e) => setParticipantNameCount(Number(e.target.value) || 1)}
                      disabled={loading || savingAll}
                    >
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                        <MenuItem key={n} value={n}>
                          {n} 人分
                        </MenuItem>
                      ))}
                    </TextField>

                  </Stack>
                </Box>
              </Box>
            </Box>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h3 style={{ margin: "8px 0 12px", color: "var(--app-text)" }}>テーマ</h3>
          <Box
            sx={{
              border: "1px solid rgba(148,163,184,0.35)",
              borderRadius: 2,
              padding: 2,
              background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 2,
                alignItems: "start",
              }}
            >
              <TextField
                select
                label="テーマカラー"
                value={accent}
                onChange={(e) => setAccent(String(e.target.value))}
                disabled={loading || savingAll}
              >
                {THEME_PRESETS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 12,
                        height: 12,
                        borderRadius: 9999,
                        background: p.value,
                        marginRight: 10,
                        border: "1px solid rgba(15,23,42,0.12)",
                      }}
                    />
                    {p.label}
                  </MenuItem>
                ))}
              </TextField>

              <Box
                sx={{
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: 2,
                  padding: "10px 12px",
                  background: "var(--panel-bg)",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 10, color: "var(--app-text)" }}>
                  プレビュー
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 9999,
                      border: "1px solid rgba(148,163,184,0.45)",
                      background: "rgba(255,255,255,0.65)",
                      fontWeight: 900,
                      color: "var(--app-text)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 9999,
                        background: accent,
                        boxShadow: previewRgb
                          ? `0 0 0 3px rgba(${previewRgb}, 0.12)`
                          : "0 0 0 3px rgba(148,163,184, 0.18)",
                      }}
                    />
                    {THEME_PRESETS.find((p) => p.value === accent)?.label || "カラー"}
                  </span>

                  <ThemeProvider theme={previewMuiTheme}>
                    <Button variant="contained" size="small" disableElevation>
                      主ボタン
                    </Button>
                    <Button variant="outlined" size="small">
                      サブ
                    </Button>
                  </ThemeProvider>
                </div>
              </Box>
            </Box>
          </Box>
      </section>

          {/* (フォーム既定値は上の「作成画面の既定値」に統合) */}
          <Box sx={{ marginTop: 1 }}>
            {error && <div style={{ color: "#b91c1c", fontWeight: 800 }}>{error}</div>}
            {notice && <div style={{ color: "var(--accent2)", fontWeight: 900 }}>{notice}</div>}
          </Box>

          <Box sx={{ marginTop: 2 }}>
            <Button
              variant="contained"
              onClick={onSaveAll}
              disabled={loading || savingAll}
              style={{ minWidth: 160 }}
            >
              {savingAll ? "保存中…" : "保存"}
            </Button>
          </Box>
        </>
      )}
    </div>
  );
}


