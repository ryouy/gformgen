import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  InputAdornment,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { TimePicker } from "antd";
import dayjs from "dayjs";
import locale from "antd/es/date-picker/locale/ja_JP";
import "antd/dist/reset.css";
import { apiUrl, authUrl } from "../../lib/apiBase";
import { applyAppThemeToDom } from "../../lib/appTheme";
import { buildMuiTheme } from "../../lib/muiTheme";

function normalizeToHalfWidthDigits(s) {
  return String(s ?? "").replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
}

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

  const [weeksOffset, setWeeksOffset] = useState(6);
  const [hour, setHour] = useState(15);
  const [minute, setMinute] = useState(0);
  const [endHour, setEndHour] = useState(16);
  const [endMinute, setEndMinute] = useState(0);
  const [deadlineDaysBefore, setDeadlineDaysBefore] = useState(2);

  const THEME_PRESETS = [
    { label: "グレー", value: "#6b7280" },
    { label: "ブルー", value: "#3b82f6" },
    { label: "エメラルド", value: "#10b981" },
    { label: "アンバー", value: "#f59e0b" },
    { label: "ローズ", value: "#f43f5e" },
  ];
  const [accent, setAccent] = useState("#6b7280");
  const [navPosition, setNavPosition] = useState("sidebar");
  const [navLabelMode, setNavLabelMode] = useState("icon");
  const previewMuiTheme = useMemo(
    () => buildMuiTheme({ accent, scope: "sidebar" }),
    [accent]
  );

  const [participantNameCount, setParticipantNameCount] = useState(1);
  const [defaultPrice, setDefaultPrice] = useState(0);
  const [defaultMeetingTitle, setDefaultMeetingTitle] = useState("会津産学懇話会 月定例会");
  const [defaultPlace, setDefaultPlace] = useState("会津若松ワシントンホテル");
  const [defaultHost, setDefaultHost] = useState("会津産学懇話会");

  const timeValue = useMemo(() => {
    return dayjs().hour(hour).minute(minute).second(0);
  }, [hour, minute]);
  const endTimeValue = useMemo(() => {
    return dayjs().hour(endHour).minute(endMinute).second(0);
  }, [endHour, endMinute]);
  const scheduleValidationError = useMemo(() => {
    const startTotal = Number(hour) * 60 + Number(minute);
    const endTotal = Number(endHour) * 60 + Number(endMinute);
    if (!Number.isFinite(startTotal) || !Number.isFinite(endTotal)) return "";
    if (endTotal <= startTotal) {
      return "終了時刻は開始時刻より後にしてください。";
    }
    return "";
  }, [hour, minute, endHour, endMinute]);

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
          setWeeksOffset(Number(s?.weeksOffset) || 6);
          setHour(Number(s?.hour) || 15);
          setMinute(Number(s?.minute) || 0);
          setEndHour(Number(s?.endHour) || 16);
          setEndMinute(Number(s?.endMinute) || 0);
          setDeadlineDaysBefore(Number(s?.deadlineDaysBefore) || 2);
        }
        if (r2.status === "fulfilled" && r2.value.ok) {
          const data = await r2.value.json().catch(() => ({}));
          const s = data?.settings || {};
          setAccent(normalizeHex(s?.accent) || "#6b7280");
          setNavPosition(
            ["sidebar", "bottom-left", "top-left"].includes(s?.navPosition)
              ? s.navPosition
              : "sidebar"
          );
          setNavLabelMode(
            ["icon", "text", "both"].includes(s?.navLabelMode) ? s.navLabelMode : "icon"
          );
        }
        if (r3.status === "fulfilled" && r3.value.ok) {
          const data = await r3.value.json().catch(() => ({}));
          const s = data?.settings || {};
          setParticipantNameCount(Number(s?.participantNameCount) || 1);
          setDefaultPrice(Number(s?.defaultPrice) || 0);
          setDefaultMeetingTitle(String(s?.defaultMeetingTitle || "会津産学懇話会 月定例会"));
          setDefaultPlace(String(s?.defaultPlace || "会津若松ワシントンホテル"));
          setDefaultHost(String(s?.defaultHost || "会津産学懇話会"));
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
      const res = await fetch(apiUrl("/user-settings/all"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          defaultSchedule: {
            weeksOffset,
            hour,
            minute,
            endHour,
            endMinute,
            deadlineDaysBefore,
          },
          formDefaults: {
            participantNameCount,
            defaultPrice: Number(defaultPrice) || 0,
            defaultMeetingTitle,
            defaultPlace,
            defaultHost,
          },
          theme: {
            accent,
            scope: "sidebar",
            navPosition,
            navLabelMode,
          },
        }),
      });

      if (res.status === 401) {
        setLoggedIn(false);
        setError("ログインが必要です。");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "保存に失敗しました。");
        return;
      }

      const s = data?.settings?.theme || {
        accent,
        scope: "sidebar",
        navPosition,
        navLabelMode,
      };

      // Apply theme and layout immediately (confirm it's reflected).
      try {
        applyAppThemeToDom(s);
        window.localStorage.setItem("gformgen.theme", JSON.stringify(s));
        window.dispatchEvent(
          new CustomEvent("gformgen:theme", {
            detail: {
              accent: s.accent,
              scope: s.scope,
              navPosition: s.navPosition,
              navLabelMode: s.navLabelMode,
            },
          })
        );
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
    <div className="settings-page" style={{ maxWidth: 980, margin: "0 auto", width: "100%" }}>
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
                border: "1px solid rgba(148,163,184,0.3)",
                borderRadius: 2.5,
                padding: 2.25,
                background: "#fff",
              }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 2.25,
                  alignItems: "start",
                }}
              >
                <Box>
                  
                  <Stack spacing={2.25}>
                    <div style={{ fontWeight: 800, color: "var(--app-text)" }}>会合名</div>
                    <TextField
                      value={defaultMeetingTitle}
                      onChange={(e) => setDefaultMeetingTitle(String(e.target.value || ""))}
                      disabled={loading || savingAll}
                    />
                    <div style={{ fontWeight: 800, color: "var(--app-text)" }}>場所</div>
                    <TextField
                      value={defaultPlace}
                      onChange={(e) => setDefaultPlace(String(e.target.value || ""))}
                      disabled={loading || savingAll}
                    />
                    <div style={{ fontWeight: 800, color: "var(--app-text)" }}>主催者名</div>
                    <TextField
                      value={defaultHost}
                      onChange={(e) => setDefaultHost(String(e.target.value || ""))}
                      disabled={loading || savingAll}
                    />
                    <div style={{ fontWeight: 800, color: "var(--app-text)" }}>参加費（1人あたり）</div>
                    <TextField
                      type="number"
                      value={defaultPrice === 0 ? "" : defaultPrice}
                      onChange={(e) =>
                        setDefaultPrice(
                          Number(normalizeToHalfWidthDigits(e.target.value)) || 0
                        )
                      }
                      disabled={loading || savingAll}
                      fullWidth
                      placeholder="0で無料"
                      inputProps={{ min: 0, step: 100, className: "no-spin" }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            {Number(defaultPrice) > 0 ? "￥" : "無料"}
                          </InputAdornment>
                        ),
                      }}
                      helperText={
                        Number(defaultPrice) <= 0
                          ? "無料の場合、フォーム本文には「参加費」は表示されません。"
                          : ""
                      }
                    />
                    <div style={{ fontWeight: 800, color: "var(--app-text)" }}>参加者の上限人数</div>
                    <TextField
                      select
                      value={participantNameCount}
                      onChange={(e) => setParticipantNameCount(Number(e.target.value) || 1)}
                      disabled={loading || savingAll}
                    >
                      {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
                        <MenuItem key={n} value={n}>
                          {n} 人
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                </Box>

                <Box>
                  
                  <Stack spacing={2.25}>
                    <div style={{ fontWeight: 800, color: "var(--app-text)" }}>開催日</div>
                    <TextField
                      select
                      value={weeksOffset}
                      onChange={(e) => setWeeksOffset(Number(e.target.value))}
                      disabled={loading || savingAll}
                    >
                      <MenuItem value={1}>本日 + 1週間</MenuItem>
                      <MenuItem value={2}>本日 + 2週間</MenuItem>
                      <MenuItem value={3}>本日 + 3週間</MenuItem>
                      <MenuItem value={4}>本日 + 4週間</MenuItem>
                      <MenuItem value={5}>本日 + 5週間</MenuItem>
                      <MenuItem value={6}>本日 + 6週間</MenuItem>
                    </TextField>
                    <div style={{ fontWeight: 800, color: "var(--app-text)" }}>開始時刻</div>
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
                          Array.from({ length: 24 }, (_, i) => i).filter((h) => h < 7 || h > 19),
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
                    <div style={{ fontWeight: 800, color: "var(--app-text)" }}>終了時刻</div>
                    <TimePicker
                      locale={locale}
                      value={endTimeValue}
                      format="HH:mm"
                      minuteStep={15}
                      hideDisabledOptions
                      showNow={false}
                      showSecond={false}
                      disabled={loading || savingAll}
                      disabledTime={() => ({
                        disabledHours: () =>
                          Array.from({ length: 24 }, (_, i) => i).filter((h) => h < 7 || h > 22),
                        disabledMinutes: () =>
                          Array.from({ length: 60 }, (_, i) => i).filter((m) => m % 15 !== 0),
                      })}
                      onChange={(t) => {
                        if (!t) return;
                        setEndHour(t.hour());
                        setEndMinute(t.minute());
                      }}
                      style={{ width: "100%", height: 44 }}
                    />
                    <div style={{ fontWeight: 800, color: "var(--app-text)" }}>申込締切</div>
                    <TextField
                      select
                      value={deadlineDaysBefore}
                      onChange={(e) => setDeadlineDaysBefore(Number(e.target.value) || 2)}
                      disabled={loading || savingAll}
                    >
                      {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => (
                        <MenuItem key={d} value={d}>
                          開催日 - {d}日前
                        </MenuItem>
                      ))}
                    </TextField>
                    {scheduleValidationError && (
                      <div style={{ color: "#b91c1c", fontWeight: 700 }}>
                        {scheduleValidationError}
                      </div>
                    )}
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
                  border: "1px solid rgba(148,163,184,0.24)",
                  borderRadius: 2,
                  padding: "10px 12px",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "var(--app-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 42,
                    flexWrap: "nowrap",
                    overflowX: "auto",
                  }}
                >
                  <span style={{ flex: "0 0 auto" }}>プレビュー</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto" }}>
                    <ThemeProvider theme={previewMuiTheme}>
                      <Button variant="contained" size="small" disableElevation>
                        ボタン
                      </Button>
                      <Button variant="outlined" size="small">
                        タブ
                      </Button>
                    </ThemeProvider>
                  </div>
                </div>
              </Box>
            </Box>
          </Box>
      </section>

          <section style={{ marginBottom: 24 }}>
            <h3 style={{ margin: "8px 0 12px", color: "var(--app-text)" }}>
              タブ・ナビゲーション
            </h3>
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
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 2,
                  alignItems: "start",
                }}
              >
                <Box>
                  <div style={{ fontWeight: 800, color: "var(--app-text)", marginBottom: 8 }}>
                    タブの配置
                  </div>
                  <TextField
                    select
                    fullWidth
                    value={navPosition}
                    onChange={(e) => setNavPosition(String(e.target.value))}
                    disabled={loading || savingAll}
                  >
                    <MenuItem value="sidebar">左サイドバー（標準）</MenuItem>
                    <MenuItem value="bottom-left">左下にまとめて表示</MenuItem>
                    <MenuItem value="top-left">左上にまとめて表示</MenuItem>
                  </TextField>
                </Box>
                <Box>
                  <div style={{ fontWeight: 800, color: "var(--app-text)", marginBottom: 8 }}>
                    タブの表示
                  </div>
                  <TextField
                    select
                    fullWidth
                    value={navLabelMode}
                    onChange={(e) => setNavLabelMode(String(e.target.value))}
                    disabled={loading || savingAll}
                  >
                    <MenuItem value="icon">アイコンのみ</MenuItem>
                    <MenuItem value="text">文字のみ</MenuItem>
                    <MenuItem value="both">アイコン＋文字</MenuItem>
                  </TextField>
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
              disabled={loading || savingAll || Boolean(scheduleValidationError)}
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


