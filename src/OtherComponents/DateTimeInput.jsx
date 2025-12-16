// src/components/DateTimeInput.jsx
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import jaLocale from "date-fns/locale/ja";

export default function DateTimeInput({ value, onChange }) {
  // 安定する基準日（1970-01-01）
  const minT = new Date(1970, 0, 1, 9, 0);
  const maxT = new Date(1970, 0, 1, 17, 0);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={jaLocale}>
      <DateTimePicker
        label="開催日と時間を選択"
        value={value}
        onChange={onChange}
        ampm={false}
        views={["year", "month", "day", "hours", "minutes"]} // ← 明示
        openTo="day" // ← 最初は日付
        minutesStep={30}
        format="yyyy/MM/dd（EEE）HH:mm"
        minTime={minT} // ← 1970基準
        maxTime={maxT}
        shouldDisableTime={(timeValue, clockType) => {
          if (clockType === "hours") {
            return timeValue < 9 || timeValue > 17; // 9〜17時以外NG
          }
          // 17時台は 17:00 以外を無効にしたいならここで minutes を制御
          // if (clockType === "minutes" && value?.getHours?.() === 17) {
          //   return timeValue !== 0;
          // }
          return false;
        }}
        slotProps={{
          textField: {
            fullWidth: true,
            inputProps: { readOnly: true }, // 手入力だけ禁止。クリックはOK
            sx: {
              backgroundColor: "#f9fafb",
              borderRadius: "10px",
              "& .MuiOutlinedInput-input": {
                fontSize: "1.1rem",
                padding: "1rem",
              },
              "& .MuiInputLabel-root": {
                fontSize: "1rem",
                color: "#555",
              },
            },
          },
          popper: {
            sx: {
              zIndex: 1500, // 他要素に隠れないように
              "& .MuiPaper-root": {
                borderRadius: "12px",
                boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
                border: "1px solid #e5e7eb",
              },
              "& .MuiPickersDay-root": {
                fontSize: "1.05rem",
              },
              "& .MuiClock-root": {
                background: "#f9fafb",
              },
            },
          },
        }}
      />
    </LocalizationProvider>
  );
}
