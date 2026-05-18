import React from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SidePanel } from "./SidePanel";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in sidepanel");

createRoot(container).render(
  <React.StrictMode>
    <SidePanel />
    <Toaster />
  </React.StrictMode>,
);
