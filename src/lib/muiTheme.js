import { createTheme } from "@mui/material/styles";

export function buildMuiTheme({ accent = "#6b7280", scope = "sidebar" } = {}) {
  const mode = "light"; // dark mode removed
  return createTheme({
    palette: {
      mode,
      primary: { main: String(accent || "#6b7280") },
    },
    shape: { borderRadius: 14 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 800,
          },
        },
      },
    },
  });
}


