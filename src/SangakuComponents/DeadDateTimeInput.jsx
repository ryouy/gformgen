// src/SangakuComponents/DeadDateTimeInput.jsx
import { DatePicker } from "antd";
import locale from "antd/es/date-picker/locale/ja_JP";
import "antd/dist/reset.css";

export default function DeadDateTimeInput({ value, onChange }) {
  return (
    <DatePicker
      locale={locale}
      showTime={{ minuteStep: 30 }}
      format="YYYY/MM/DD（ddd）HH:mm"
      value={value}
      onChange={onChange}
      style={{ width: "100%" }}
      placeholder="締切日時を選択"
    />
  );
}
