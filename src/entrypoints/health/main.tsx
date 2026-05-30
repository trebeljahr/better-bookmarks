import React from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Health } from "./Health";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in health");

createRoot(container).render(
  <React.StrictMode>
    <Health />
    <Toaster />
  </React.StrictMode>,
);
