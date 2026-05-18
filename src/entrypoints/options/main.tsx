import { ThemeProvider } from "@mui/material";
import React from "react";
import { createRoot } from "react-dom/client";
import { theme } from "@/components/MaterialTheme";
import { Options } from "./Options";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in options");

createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <Options />
    </ThemeProvider>
  </React.StrictMode>,
);
