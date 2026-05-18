import { ThemeProvider } from "@mui/material";
import React from "react";
import { createRoot } from "react-dom/client";
import { theme } from "@/components/MaterialTheme";
import { Popup } from "./Popup";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in popup");

createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <Popup />
    </ThemeProvider>
  </React.StrictMode>,
);
