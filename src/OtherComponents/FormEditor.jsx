import { useState } from "react";
import { Stack, TextField, Button, Box } from "@mui/material";
import DateTimeInput from "./DateTimeInput";
import DeadDateTimeInput from "./DeadDateTimeInput";
import dayjs from "dayjs";
import qrImage from "../assets/qr.png";

const DEMO_FORM_URL = "https://forms.gle/HPK3QR4DMDcm6AQg6";

export default function FormEditor() {
  const [formData, setFormData] = useState({
    title: "会津産学懇話会12月定例会",
    datetime: dayjs("2025-12-25 15:00"),
    deadline: null,
    place: "会津若松ワシントンホテル",
    host: "会津産学懇話会",
    content: "",
  });

  const [qrVisible, setQrVisible] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleCreate = () => setQrVisible(true);

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

          {/* ✅ 日時入力を横並びに配置 */}
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

          {/* ✅ 画面下部：作成ボタン + QR + 確認ボタン（横並び） */}
          <div className="form-bottom-bar">
            <div className="form-bottom-actions">
              <Button
                variant="contained"
                size="large"
                onClick={handleCreate}
                className="action-btn action-primary"
                disableElevation
              >
                フォームを作成
              </Button>

              {qrVisible ? (
                <Button
                  variant="outlined"
                  size="large"
                  component="a"
                  href={DEMO_FORM_URL}
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

            <div className={`qr-inline ${qrVisible ? "" : "is-placeholder"}`}>
              {qrVisible ? (
                <img
                  src={qrImage}
                  alt="QRコード"
                  style={{ width: 95, height: 95, borderRadius: 12 }}
                />
              ) : (
                <div className="qr-placeholder" aria-hidden="true" />
              )}
            </div>
          </div>
        </Stack>
      </div>
    </div>
  );
}
