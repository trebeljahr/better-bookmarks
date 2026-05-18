import { ThemeProvider } from "@mui/material";
import React from "react";
import { createRoot } from "react-dom/client";
import { theme } from "@/components/MaterialTheme";
import { SidePanel } from "./SidePanel";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in sidepanel");

createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <SidePanel />
    </ThemeProvider>
  </React.StrictMode>,
);
