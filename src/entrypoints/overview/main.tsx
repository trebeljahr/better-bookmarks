import React from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Overview } from "./Overview";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in overview");

createRoot(container).render(
  <React.StrictMode>
    <Overview />
    <Toaster />
  </React.StrictMode>,
);
