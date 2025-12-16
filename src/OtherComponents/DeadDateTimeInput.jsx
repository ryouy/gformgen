import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import jaLocale from "date-fns/locale/ja";

export default function DeadDateInput({ value, onChange }) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={jaLocale}>
      <DatePicker
        label="〆切日を選択"
        value={value}
        onChange={onChange}
        format="yyyy/MM/dd（EEE）"
        slotProps={{
          textField: {
            fullWidth: true,
            inputProps: { readOnly: true },
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
        }}
      />
    </LocalizationProvider>
  );
}
