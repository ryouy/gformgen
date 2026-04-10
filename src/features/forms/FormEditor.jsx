import { useEffect, useMemo, useRef, useState } from "react";
import { Stack, TextField, Button, Box, MenuItem, InputAdornment } from "@mui/material";
import dayjs from "dayjs";
import { QRCodeCanvas } from "qrcode.react";

import DateTimeInput from "./DateTimeInput";
import EndDateTimeInput from "./EndDateTimeInput";
import DeadDateTimeInput from "./DeadDateTimeInput";
import { apiUrl } from "../../lib/apiBase";
import {
  buildQrCanvasStyle,
  buildQrDownloadFileName,
  downloadQrCanvasAsPng,
  getQrErrorCorrectionOption,
  QR_DARK_COLOR,
  QR_ERROR_CORRECTION_LEVEL,
  QR_ERROR_CORRECTION_OPTIONS,
  QR_LIGHT_COLOR,
  QR_MARGIN_SIZE,
  QR_PNG_SIZE,
  normalizeQrErrorCorrectionLevel,
} from "../../lib/qrCode";
import { copyTextToClipboard } from "../../lib/clipboard";

export default function FormEditor({
  onFormCreated,
}) {
  const dirtyRef = useRef(false);
  const participantDirtyRef = useRef(false);
  const qrCanvasRef = useRef(null);
  const [hasEditedPrice, setHasEditedPrice] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [qrLevel, setQrLevel] = useState(() => {
    try {
      return normalizeQrErrorCorrectionLevel(window.localStorage.getItem("gformgen.qrLevel"));
    } catch {
      return QR_ERROR_CORRECTION_LEVEL;
    }
  });
  const activeQrOption = getQrErrorCorrectionOption(qrLevel);

  const buildEndDateTime = (start, endHour, endMinute) => {
    const h = Number(endHour);
    const m = Number(endMinute);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return start.add(1, "hour");
    return start.hour(h).minute(m).second(0);
  };

  const buildDefaultSchedule = ({
    weeksOffset = 6,
    hour = 15,
    minute = 0,
    endHour = 16,
    endMinute = 0,
    deadlineDaysBefore = 2,
  } = {}) => {
    const dt = dayjs()
      .add(Number(weeksOffset) || 6, "week")
      .hour(Number(hour) || 15)
      .minute(Number(minute) || 0)
      .second(0);
    const end = buildEndDateTime(dt, endHour, endMinute);
    const dl = dt
      .subtract(deadlineDaysBefore, "day")
      .hour(17)
      .minute(0)
      .second(0);
    return { datetime: dt, endDatetime: end, deadline: dl };
  };

  const buildDefaultMeetingTitle = () => {
    const nextMonth = dayjs().add(1, "month").format("M");
    return `会津産学懇話会 ${nextMonth}月定例会`;
  };

  const initialSchedule = buildDefaultSchedule();
  const [formData, setFormData] = useState({
    title: buildDefaultMeetingTitle(),
    datetime: initialSchedule.datetime,
    endDatetime: initialSchedule.endDatetime,
    deadline: initialSchedule.deadline,
    place: "会津若松ワシントンホテル",
    price: 0,
    host: "会津産学懇話会",
    participantNameCount: 1,
  });
  const [defaultEndHour, setDefaultEndHour] = useState(initialSchedule.endDatetime.hour());
  const [defaultEndMinute, setDefaultEndMinute] = useState(initialSchedule.endDatetime.minute());
  const [defaultDeadlineDaysBefore, setDefaultDeadlineDaysBefore] = useState(2);

  const [formUrl, setFormUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const dateTimeValidationError = useMemo(() => {
    if (!formData.datetime) return "開始日時を選択してください。";
    if (!formData.endDatetime) return "終了日時を選択してください。";
    if (!formData.deadline) return "〆切日を選択してください。";
    if (!formData.deadline.isBefore(formData.datetime, "day")) {
      return "〆切日は開催日より前にしてください。";
    }
    if (!formData.endDatetime.isAfter(formData.datetime)) {
      return "終了日時は開始日時より後にしてください（時刻・日付ともに）。";
    }
    return "";
  }, [formData.datetime, formData.endDatetime, formData.deadline]);

  const normalizeToHalfWidthDigits = (s) =>
    String(s ?? "").replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    );

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (["participantNameCount", "price", "title", "place", "host"].includes(name)) {
      participantDirtyRef.current = true;
    }
    if (name === "price") setHasEditedPrice(true);
    const finalValue = name === "price" ? normalizeToHalfWidthDigits(value) : value;
    setFormData({ ...formData, [name]: finalValue });
  };

  const handleDateTimeChange = (val) => {
    if (!val) return;
    dirtyRef.current = true;

    const autoDeadline = val
      .subtract(defaultDeadlineDaysBefore, "day")
      .hour(17)
      .minute(0)
      .second(0);
    const autoEndDatetime = buildEndDateTime(val, defaultEndHour, defaultEndMinute);

    setFormData({
      ...formData,
      datetime: val,
      endDatetime: autoEndDatetime,
      deadline: autoDeadline,
    });
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [r1, r2] = await Promise.allSettled([
          fetch(apiUrl("/user-settings/default-schedule"), { credentials: "include" }),
          fetch(apiUrl("/user-settings/form-defaults"), { credentials: "include" }),
        ]);

        if (r1.status === "fulfilled" && r1.value.ok) {
          const data = await r1.value.json().catch(() => ({}));
          const s = data?.settings || {};
          if (!cancelled && !dirtyRef.current) {
            const next = buildDefaultSchedule({
              weeksOffset: s.weeksOffset,
              hour: s.hour,
              minute: s.minute,
              endHour: s.endHour,
              endMinute: s.endMinute,
              deadlineDaysBefore: s.deadlineDaysBefore,
            });
            setDefaultEndHour(Number(s?.endHour) || next.endDatetime.hour());
            setDefaultEndMinute(Number(s?.endMinute) || next.endDatetime.minute());
            setDefaultDeadlineDaysBefore(Number(s?.deadlineDaysBefore) || 2);
            setFormData((prev) => ({
              ...prev,
              datetime: next.datetime,
              endDatetime: next.endDatetime,
              deadline: next.deadline,
            }));
          }
        }

        if (r2.status === "fulfilled" && r2.value.ok) {
          const data = await r2.value.json().catch(() => ({}));
          const s = data?.settings || {};
          if (!cancelled && !participantDirtyRef.current) {
            const n = Number(s?.participantNameCount) || 1;
            const p = Number(s?.defaultPrice);
            const t = String(s?.defaultMeetingTitle || "").trim();
            const place = String(s?.defaultPlace || "").trim();
            const host = String(s?.defaultHost || "").trim();
            setFormData((prev) => ({
              ...prev,
              title: t || prev.title,
              place: place || prev.place,
              host: host || prev.host,
              participantNameCount: n,
              price: Number.isFinite(p) ? p : 0,
            }));
          }
        }
      } catch {
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("gformgen.qrLevel", qrLevel);
    } catch {
      // ignore
    }
  }, [qrLevel]);

  useEffect(() => {
    setCopyNotice("");
  }, [formUrl]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    setFormUrl(null);
    setCopyNotice("");
    onFormCreated?.({ formId: null });

    try {
      const res = await fetch(apiUrl("/forms/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: formData.title,
          datetime: formData.datetime ? formData.datetime.toISOString() : null,
          endDatetime: formData.endDatetime ? formData.endDatetime.toISOString() : null,
          deadline: formData.deadline ? formData.deadline.toISOString() : null,
          place: formData.place,
          price: Number(formData.price) || 0,
          host: formData.host,
          participantNameCount: Number(formData.participantNameCount) || 1,
        }),
      });

      if (res.status === 401) {
        window.dispatchEvent(
          new CustomEvent("gformgen:unauthorized", {
            detail: {
              message:
                "バックエンドが更新/再起動されたため、ログイン状態が切れました。ホーム画面から再ログインしてください。",
            },
          })
        );
        throw new Error("Not logged in");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(String(data?.error || "API error"));
      }

      const data = await res.json();
      setFormUrl(data.formUrl);
      onFormCreated?.({ formId: data.formId, formUrl: data.formUrl });
    } catch (e) {
      console.error(e);
      setError(e?.message ? `フォーム作成に失敗しました: ${e.message}` : "フォーム作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadQr = () => {
    try {
      downloadQrCanvasAsPng(
        qrCanvasRef.current,
        buildQrDownloadFileName(`${formData.title || "form"}-qr`)
      );
    } catch (e) {
      console.error(e);
      setError("QRコードのPNGダウンロードに失敗しました");
    }
  };

  const handleCopyFormUrl = async () => {
    if (!formUrl) return;
    try {
      await copyTextToClipboard(formUrl);
      setCopyNotice("短縮リンクをコピーしました");
    } catch (e) {
      console.error(e);
      setError("短縮リンクのコピーに失敗しました");
    }
  };

  return (
    <div className="form-grid-wrapper">
      <h2>情報を入力してください</h2>

      <div className="form-grid mui-form">
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 2,
            alignItems: "start",
            maxWidth: 1080,
            marginInline: "auto",
          }}
        >
          <Stack
            spacing={2}
            sx={{
              minWidth: 0,
              p: { xs: 0, sm: 1.5 },
              borderRadius: { sm: 3 },
              background: { sm: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)" },
              border: { sm: "1px solid rgba(148,163,184,0.18)" },
            }}
          >
            <TextField
              label="会合名"
              name="title"
              value={formData.title}
              onChange={handleChange}
              fullWidth
            />

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
                gap: 2,
              }}
            >
              <DateTimeInput
                value={formData.datetime}
                onChange={handleDateTimeChange}
              />
              <EndDateTimeInput
                value={formData.endDatetime}
                onChange={(val) => {
                  if (!val) {
                    setFormData({ ...formData, endDatetime: null });
                    return;
                  }
                  const base = formData.datetime || formData.endDatetime || dayjs();
                  const nextEnd = base.hour(val.hour()).minute(val.minute()).second(0);
                  setFormData({ ...formData, endDatetime: nextEnd });
                }}
              />
              <DeadDateTimeInput
                value={formData.deadline}
                onChange={(val) => setFormData({ ...formData, deadline: val })}
              />
            </Box>

            {dateTimeValidationError && (
              <p style={{ color: "red", margin: 0 }}>{dateTimeValidationError}</p>
            )}

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 2,
              }}
            >
              <TextField
                label="場所"
                name="place"
                value={formData.place}
                onChange={handleChange}
                fullWidth
              />
              <TextField
                label="主催者名"
                name="host"
                value={formData.host}
                onChange={handleChange}
                fullWidth
              />
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 2,
              }}
            >
              <TextField
                label="参加費（1人あたり）"
                name="price"
                type="number"
                value={!hasEditedPrice && Number(formData.price) <= 0 ? "" : formData.price}
                onChange={handleChange}
                fullWidth
                inputProps={{ min: 0, step: 100, className: "no-spin" }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      {Number(formData.price) > 0 ? "￥" : "無料"}
                    </InputAdornment>
                  ),
                }}
                helperText={
                  Number(formData.price) <= 0
                    ? "無料の場合、フォーム本文には「参加費」は表示されません。"
                    : ""
                }
              />
              <TextField
                select
                label="参加者の上限入力人数"
                name="participantNameCount"
                value={formData.participantNameCount}
                onChange={handleChange}
                fullWidth
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n} 人
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {error && (
              <p style={{ color: "red", textAlign: "center", margin: 0 }}>{error}</p>
            )}
          </Stack>

          <Box
            sx={{
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                p: { xs: 2, sm: 2.25 },
                borderRadius: 3,
                border: "1px solid rgba(148,163,184,0.22)",
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                  mb: 1.5,
                }}
              >
                <strong>回答用QR</strong>
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "136px minmax(240px, 1fr)" },
                  gap: 2,
                  alignItems: "center",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    minHeight: 136,
                    borderRadius: 2,
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "#fff",
                  }}
                >
                  <div className={`qr-inline ${formUrl ? "" : "is-placeholder"}`}>
                    {formUrl ? (
                      <QRCodeCanvas
                        ref={qrCanvasRef}
                        value={formUrl}
                        size={QR_PNG_SIZE}
                        bgColor={QR_LIGHT_COLOR}
                        fgColor={QR_DARK_COLOR}
                        level={qrLevel}
                        marginSize={QR_MARGIN_SIZE}
                        title="フォーム回答用QRコード"
                        style={buildQrCanvasStyle(120)}
                      />
                    ) : (
                      <div className="qr-placeholder" aria-hidden="true">
                        <div className="qr-placeholder-text">バーコードが<br />表示されます</div>
                      </div>
                    )}
                  </div>
                </Box>

                <Stack spacing={1.1}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 1,
                    }}
                  >
                    <Button
                      variant="contained"
                      size="large"
                      onClick={handleCreate}
                      disabled={loading || Boolean(dateTimeValidationError)}
                      disableElevation
                      className="action-btn action-primary"
                      fullWidth
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      {loading ? "作成中..." : "フォームを作成"}
                    </Button>

                    <TextField
                      select
                      size="small"
                      label="QRの仕上がり"
                      value={qrLevel}
                      onChange={(e) => setQrLevel(normalizeQrErrorCorrectionLevel(e.target.value))}
                      fullWidth
                      sx={{ "& .MuiInputBase-input": { whiteSpace: "nowrap" } }}
                    >
                      {QR_ERROR_CORRECTION_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 1,
                    }}
                  >
                    <Button
                      variant="outlined"
                      size="large"
                      onClick={handleDownloadQr}
                      className="action-btn action-secondary"
                      disabled={!formUrl}
                      fullWidth
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      PNGダウンロード
                    </Button>

                    <Button
                      variant="outlined"
                      size="large"
                      component="a"
                      href={formUrl || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="action-btn action-secondary"
                      disabled={!formUrl}
                      fullWidth
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      フォームを確認
                    </Button>
                  </Box>
                </Stack>
              </Box>

              <Box
                sx={{
                  mt: 2,
                  pt: 1.5,
                  borderTop: "1px solid rgba(148,163,184,0.18)",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 1,
                    flexWrap: "wrap",
                    mb: 1,
                  }}
                >
                  <strong>短縮リンク</strong>
                </Box>
                <Box sx={{ display: "flex", gap: 1, flexDirection: { xs: "column", sm: "row" } }}>
                  <TextField
                    value={formUrl || ""}
                    fullWidth
                    size="small"
                    placeholder="フォーム作成後に短縮リンクが表示されます"
                    InputProps={{ readOnly: true }}
                  />
                  <Button
                    variant="outlined"
                    onClick={handleCopyFormUrl}
                    sx={{ minWidth: 110 }}
                    disabled={!formUrl}
                  >
                    コピー
                  </Button>
                </Box>
                {copyNotice ? (
                  <p style={{ margin: "0.65rem 0 0", color: "#475569", fontWeight: 700 }}>
                    {copyNotice}
                  </p>
                ) : null}
              </Box>
            </Box>
          </Box>
        </Box>
      </div>
    </div>
  );
}
