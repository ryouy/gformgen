// src/SangakuComponents/FormEditor.jsx
import { useState } from "react";
import { Stack, TextField, Button, Box, MenuItem } from "@mui/material";
import dayjs from "dayjs";
import { QRCodeCanvas } from "qrcode.react";

import DateTimeInput from "./DateTimeInput";
import DeadDateTimeInput from "./DeadDateTimeInput";
import { apiUrl } from "../../lib/apiBase";

const DEADLINE_DAYS_BEFORE = 2; // ← 締切は◯日前

export default function FormEditor({
  onFormCreated,
}) {
  const [formData, setFormData] = useState({
    title: "会津産学懇話会10月定例会",
    datetime: dayjs("2025-12-25 15:00"),
    deadline: dayjs("2025-12-23 17:00"),
    place: "会津若松ワシントンホテル",
    host: "会津産学懇話会",
    participantNameCount: 1,
  });

  const [formUrl, setFormUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  /** 開催日時変更 → 締切自動更新 */
  const handleDateTimeChange = (val) => {
    if (!val) return;

    const autoDeadline = val
      .subtract(DEADLINE_DAYS_BEFORE, "day")
      .hour(17)
      .minute(0)
      .second(0);

    setFormData({
      ...formData,
      datetime: val,
      deadline: autoDeadline,
    });
  };

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
          deadline: formData.deadline ? formData.deadline.toISOString() : null,
          place: formData.place,
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
      <h2>フォームに必要な情報を入力してください</h2>

      <div className="form-grid mui-form">
        <Stack spacing={2}>
          <TextField
            label="会合名"
            name="title"
            value={formData.title}
            onChange={handleChange}
            fullWidth
          />

          <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
            <DateTimeInput
              value={formData.datetime}
              onChange={handleDateTimeChange}
            />
            <DeadDateTimeInput
              value={formData.deadline}
              onChange={(val) => setFormData({ ...formData, deadline: val })}
            />
          </Box>

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

          <TextField
            select
            label="参加者名の入力人数（1回答あたり）"
            name="participantNameCount"
            value={formData.participantNameCount}
            onChange={handleChange}
            fullWidth
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <MenuItem key={n} value={n}>
                {n} 人分
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
                disabled={loading}
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
                <QRCodeCanvas value={formUrl} size={95} />
              ) : (
                <div className="qr-placeholder" aria-hidden="true">
                  <div className="qr-placeholder-text">QRが<br />表示されます</div>
                </div>
              )}
            </div>
          </div>
        </Stack>
      </div>
    </div>
  );
}
