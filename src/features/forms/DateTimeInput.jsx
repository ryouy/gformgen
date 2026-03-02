import { DatePicker } from "antd";
import locale from "antd/es/date-picker/locale/ja_JP";
import "antd/dist/reset.css";
import "dayjs/locale/ja"; // ★ これが重要
import dayjs from "dayjs";

dayjs.locale("ja"); // ★ dayjs に日本語を設定
export default function DateTimeInput({ value, onChange }) {
  return (
    <DatePicker
      locale={locale}
      showTime={{
        minuteStep: 15,

        hideDisabledOptions: true,

        disabledTime: () => ({
          disabledHours: () =>
            Array.from({ length: 24 }, (_, i) => i).filter(
              (h) => h < 7 || h > 19
            ),
        }),
      }}
      format="開催日時：YYYY/MM/DD（ddd）HH:mm"
      value={value}
      onChange={onChange}
      style={{ width: "100%", height: 50 }}
      placeholder="開催日時を選択"
    />
  );
}
