import { useState } from "react";
import { Stack, TextField, Button, Box } from "@mui/material";
import QrSection from "./QrSection";
import DateTimeInput from "./DateTimeInput";
import DeadDateTimeInput from "./DeadDateTimeInput";

export default function FormEditor({ onFormCreated }) {
  const [formData, setFormData] = useState({
    title: "会津産学懇話会10月定例会",
    datetime: null,
    deadline: null,
    place: "会津若松ワシントンホテル",
    host: "会津産学懇話会",
    content: "",
  });

  const [qrVisible, setQrVisible] = useState(false);
  const [formUrl, setFormUrl] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // ✅ フォーム作成（API連携）
  const handleCreate = async () => {
    try {
      const res = await fetch("http://localhost:3000/api/forms/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          datetime: formData.datetime ? formData.datetime.toISOString() : null,
          deadline: formData.deadline ? formData.deadline.toISOString() : null,
          place: formData.place,
          host: formData.host,
        }),
      });

      const data = await res.json();
      console.log("フォーム作成結果:", data);

      // 親（AppMain）に通知
      if (onFormCreated) {
        onFormCreated(data.formUrl);
      }

      // 自分でも保持（QR表示用）
      setFormUrl(data.formUrl);
      setQrVisible(true);
    } catch (err) {
      console.error("フォーム作成失敗", err);
      alert("フォーム作成に失敗しました");
    }
  };

  return (
    <div className="form-grid-wrapper">
      <h2>フォームに必要な情報を入力してください</h2>

      <div className="form-grid mui-form">
        <Stack spacing={2}>
          <TextField
            label="会合"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="例）2025年10月定例会"
            fullWidth
          />

          {/* 日時入力 */}
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 2,
              alignItems: "flex-start",
              width: "100%",
            }}
          >
            <Box sx={{ flex: 1 }}>
              <DateTimeInput
                value={formData.datetime}
                onChange={(val) => setFormData({ ...formData, datetime: val })}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <DeadDateTimeInput
                value={formData.deadline}
                onChange={(val) => setFormData({ ...formData, deadline: val })}
              />
            </Box>
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
            placeholder="例）会津産学懇話会"
            fullWidth
          />

          <TextField
            label="本文"
            name="content"
            value={formData.content}
            onChange={handleChange}
            multiline
            minRows={4}
            placeholder="フォームに載せる本文を入力してください"
            fullWidth
          />

          {/* フォーム作成ボタン */}
          <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
            <Button
              variant="contained"
              size="large"
              sx={{
                background: "#3b82f6",
                borderRadius: "10px",
                fontSize: "1.05rem",
                padding: "0.8rem 2rem",
                width: "fit-content",
                minWidth: "220px",
                boxShadow: "0 4px 12px rgba(79,70,229,0.25)",
                transition: "all 0.3s ease",
                "&:hover": {
                  background: "#4338ca",
                  transform: "translateY(-2px)",
                },
              }}
              onClick={handleCreate}
            >
              フォームを作成
            </Button>
          </div>
        </Stack>
      </div>

      {/* QRコード表示 */}
      {qrVisible && formUrl && (
        <div className="form-side center-qr">
          <QrSection formUrl={formUrl} />
        </div>
      )}
    </div>
  );
}
