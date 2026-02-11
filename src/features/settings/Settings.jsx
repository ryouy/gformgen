import { useEffect, useMemo, useState } from "react";
import { Box, Button, CircularProgress, MenuItem, Stack, TextField } from "@mui/material";
import { TimePicker } from "antd";
import dayjs from "dayjs";
import locale from "antd/es/date-picker/locale/ja_JP";
import "antd/dist/reset.css";
import { apiUrl, authUrl } from "../../lib/apiBase";
import { applyAppThemeToDom } from "../../lib/appTheme";

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

export default function SettingsPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [weeksOffset, setWeeksOffset] = useState(1);
  const [hour, setHour] = useState(15);
  const [minute, setMinute] = useState(0);

  const [accent, setAccent] = useState("#3b82f6");
  const [darkMode, setDarkMode] = useState(false);

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
          setAccent(normalizeHex(s?.accent) || "#3b82f6");
          setDarkMode(String(s?.scope || "") === "dark");
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
          body: JSON.stringify({ accent, scope: darkMode ? "dark" : "sidebar" }),
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
        const s = c?.data?.settings || { accent, scope: darkMode ? "dark" : "sidebar" };
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
      <h2 style={{ marginTop: 0, color: "#0f172a" }}>設定</h2>

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
            <h3 style={{ margin: "8px 0 12px", color: "#0f172a" }}>作成画面の既定値</h3>
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
                  <div style={{ fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
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
                      <div style={{ fontWeight: 800, marginBottom: 6, color: "#0f172a" }}>
                        時刻
                      </div>
                      <TimePicker
                        locale={locale}
                        value={timeValue}
                        format="HH:mm"
                        minuteStep={15}
                        showNow={false}
                        disabled={loading || savingAll}
                        disabledTime={() => ({
                          disabledHours: () =>
                            Array.from({ length: 24 }, (_, i) => i).filter((h) => h < 8 || h > 20),
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
                  <div style={{ fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
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
            <h3 style={{ margin: "8px 0 12px", color: "#0f172a" }}>テーマ</h3>
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
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6, color: "#0f172a" }}>
                  アクセントカラー
                </div>
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(normalizeHex(e.target.value) || "#3b82f6")}
                  disabled={loading || savingAll}
                  style={{
                    width: "100%",
                    height: 44,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                  }}
                />
              </div>

              <div>
                <div style={{ fontWeight: 800, marginBottom: 6, color: "#0f172a" }}>
                  ダークモード
                </div>
                <Button
                  type="button"
                  variant={darkMode ? "contained" : "outlined"}
                  onClick={() => {
                    const next = !darkMode;
                    setDarkMode(next);
                    // Apply instantly (no save needed) to confirm it's reflected.
                    try {
                      const s = { accent, scope: next ? "dark" : "sidebar" };
                      applyAppThemeToDom(s);
                      window.localStorage.setItem("gformgen.theme", JSON.stringify(s));
                    } catch {
                      // ignore
                    }
                  }}
                  disabled={loading || savingAll}
                  style={{ width: "100%", height: 44, fontWeight: 900 }}
                >
                  {darkMode ? "ON" : "OFF"}
                </Button>
              </div>
            </Box>
          </Box>
          </section>

          {/* (フォーム既定値は上の「作成画面の既定値」に統合) */}
          <Box sx={{ marginTop: 1 }}>
            {error && <div style={{ color: "#b91c1c", fontWeight: 800 }}>{error}</div>}
            {notice && <div style={{ color: "#059669", fontWeight: 900 }}>{notice}</div>}
          </Box>

          <Box sx={{ marginTop: 2 }}>
            <Button
              variant="contained"
              onClick={onSaveAll}
              disabled={loading || savingAll}
              style={{ width: "100%" }}
            >
              {savingAll ? "保存中…" : "保存"}
            </Button>
          </Box>
        </>
      )}
    </div>
  );
}


