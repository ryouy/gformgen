// src/SangakuComponents/FormEditor.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Stack, TextField, Button, Box, MenuItem, InputAdornment } from "@mui/material";
import dayjs from "dayjs";
import { QRCodeCanvas } from "qrcode.react";

import DateTimeInput from "./DateTimeInput";
import EndDateTimeInput from "./EndDateTimeInput";
import DeadDateTimeInput from "./DeadDateTimeInput";
import { apiUrl } from "../../lib/apiBase";

export default function FormEditor({
  onFormCreated,
}) {
  const dirtyRef = useRef(false);
  const participantDirtyRef = useRef(false);
  const [hasEditedPrice, setHasEditedPrice] = useState(false);

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

  /** 開催日時変更 → 〆切自動更新 */
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

  // Load per-user default schedule from backend (Drive-backed settings).
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
        // ignore (not logged in / cold start etc.)
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** フォーム作成 */
  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    setFormUrl(null);
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
      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      setFormUrl(data.formUrl);
      onFormCreated?.({ formId: data.formId, formUrl: data.formUrl });
    } catch (e) {
      console.error(e);
      setError("フォーム作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-grid-wrapper">
      <h2>情報を入力してください</h2>

      <div className="form-grid mui-form">
        <Stack spacing={2}>
          <TextField
            label="会合名"
            name="title"
            value={formData.title}
            onChange={handleChange}
            fullWidth
          />

          <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", md: "row" } }}>
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

          <TextField
            label="場所"
            name="place"
            value={formData.place}
            onChange={handleChange}
            fullWidth
          />
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
            label="主催者名"
            name="host"
            value={formData.host}
            onChange={handleChange}
            fullWidth
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

          {error && (
            <p style={{ color: "red", textAlign: "center" }}>{error}</p>
          )}

          {/* ✅ 画面下部：作成ボタン + QR + 確認ボタン（横並び） */}
          <div className="form-bottom-bar">
            <div className="form-bottom-actions">
              <Button
                variant="contained"
                size="large"
                onClick={handleCreate}
                disabled={loading || Boolean(dateTimeValidationError)}
                disableElevation
                className="action-btn action-primary"
              >
                {loading ? "作成中..." : "フォームを作成"}
              </Button>

              {formUrl ? (
                <Button
                  variant="outlined"
                  size="large"
                  component="a"
                  href={formUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-btn action-secondary"
                >
                  フォームを確認
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  size="large"
                  disabled
                  className="action-btn action-secondary"
                >
                  フォームを確認
                </Button>
              )}
            </div>

            <div className={`qr-inline ${formUrl ? "" : "is-placeholder"}`}>
              {formUrl ? (
                <QRCodeCanvas
                  value={formUrl}
                  size={95}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="Q"
                />
              ) : (
                <div className="qr-placeholder" aria-hidden="true">
                  <div className="qr-placeholder-text">バーコードが<br />表示されます</div>
                </div>
              )}
            </div>
          </div>
        </Stack>
      </div>
    </div>
  );
}
