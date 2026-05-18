import React from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Popup } from "./Popup";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in popup");

createRoot(container).render(
  <React.StrictMode>
    <Popup />
    <Toaster />
  </React.StrictMode>,
);
