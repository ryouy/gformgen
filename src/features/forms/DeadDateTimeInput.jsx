import { DatePicker } from "antd";
import locale from "antd/es/date-picker/locale/ja_JP";
import dayjs from "dayjs";
import "dayjs/locale/ja"; // ★ これが重要
import "antd/dist/reset.css";

dayjs.locale("ja"); // ★ dayjs に日本語を設定

export default function DeadDateTimeInput({ value, onChange }) {
  return (
    <DatePicker
      locale={locale}
      format="〆切日：YYYY/MM/DD（ddd）"
      value={value}
      onChange={onChange}
      style={{ width: "100%" }}
      placeholder="〆切日時を選択"
    />
  );
}
