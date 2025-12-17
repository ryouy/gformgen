import { DatePicker } from "antd";
import dayjs from "dayjs";
import "antd/dist/reset.css";
import locale from "antd/es/date-picker/locale/ja_JP";

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
      style={{
        width: "100%",
        padding: "10px",
        borderRadius: "10px",
      }}
    />
  );
}
