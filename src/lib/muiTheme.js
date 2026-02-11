import { createTheme } from "@mui/material/styles";

export function buildMuiTheme({ accent = "#3b82f6", scope = "sidebar" } = {}) {
  const mode = scope === "dark" ? "dark" : "light";
  return createTheme({
    palette: {
      mode,
      primary: { main: String(accent || "#3b82f6") },
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


