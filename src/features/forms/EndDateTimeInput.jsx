import { TimePicker } from "antd";
import locale from "antd/es/date-picker/locale/ja_JP";
import "antd/dist/reset.css";

export default function EndDateTimeInput({ value, onChange }) {
  return (
    <TimePicker
      locale={locale}
      value={value}
      format="終了時刻：HH:mm"
      minuteStep={15}
      hideDisabledOptions
      showNow={false}
      showSecond={false}
      disabledTime={() => ({
        disabledHours: () =>
          Array.from({ length: 24 }, (_, i) => i).filter((h) => h < 7 || h > 22),
        disabledMinutes: () =>
          Array.from({ length: 60 }, (_, i) => i).filter((m) => m % 15 !== 0),
      })}
      onChange={onChange}
      style={{ width: "100%", height: 50 }}
    />
  );
}
