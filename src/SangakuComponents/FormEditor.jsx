// src/SangakuComponents/FormEditor.jsx
import { useState } from "react";
import { Stack, TextField, Button, Box } from "@mui/material";
import dayjs from "dayjs";

import DateTimeInput from "./DateTimeInput";
import DeadDateTimeInput from "./DeadDateTimeInput";
import QrSection from "./QrSection";

const DEADLINE_DAYS_BEFORE = 2; // ← 締切は◯日前

export default function FormEditor() {
  const [formData, setFormData] = useState({
    title: "会津産学懇話会10月定例会",
    datetime: dayjs("2025-12-25 15:00"),
    deadline: dayjs("2025-12-23 17:00"),
    place: "会津若松ワシントンホテル",
    host: "会津産学懇話会",
    content: "",
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

    try {
      const res = await fetch("http://localhost:3000/api/forms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          datetime: formData.datetime ? formData.datetime.toISOString() : null,
          deadline: formData.deadline ? formData.deadline.toISOString() : null,
          place: formData.place,
          host: formData.host,
        }),
      });

      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      setFormUrl(data.formUrl);
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

          <Box sx={{ display: "flex", gap: 2 }}>
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
            label="本文"
            name="content"
            value={formData.content}
            onChange={handleChange}
            multiline
            minRows={4}
            fullWidth
          />

          <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
            <Button
              variant="contained"
              size="large"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? "作成中..." : "フォームを作成"}
            </Button>
          </div>

          {error && (
            <p style={{ color: "red", textAlign: "center" }}>{error}</p>
          )}
        </Stack>
      </div>

      {formUrl && (
        <div className="form-side center-qr">
          <QrSection formUrl={formUrl} />
        </div>
      )}
    </div>
  );
}
