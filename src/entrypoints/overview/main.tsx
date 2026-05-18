import { ThemeProvider } from "@mui/material";
import React from "react";
import { createRoot } from "react-dom/client";
import { theme } from "@/components/MaterialTheme";
import { Overview } from "./Overview";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in overview");

createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <Overview />
    </ThemeProvider>
  </React.StrictMode>,
);
