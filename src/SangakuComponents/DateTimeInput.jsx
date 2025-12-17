// src/SangakuComponents/DateTimeInput.jsx
import { DatePicker } from "antd";
import locale from "antd/es/date-picker/locale/ja_JP";
import "antd/dist/reset.css";

export default function DateTimeInput({ value, onChange }) {
  return (
    <DatePicker
      locale={locale}
      showTime={{
        minuteStep: 30,
        disabledTime: () => ({
          disabledHours: () =>
            Array.from({ length: 24 }, (_, i) => i).filter(
              (h) => h < 9 || h > 17
            ),
        }),
      }}
      format="YYYY/MM/DD（ddd）HH:mm"
      value={value}
      onChange={onChange}
      style={{ width: "100%", height: 50 }}
      placeholder="開催日時を選択"
    />
  );
}
