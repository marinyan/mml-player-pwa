import { mountApp } from "./app";
import "./style.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("App root not found");
}

mountApp(root);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    void navigator.serviceWorker.register(swUrl);
  });
}
