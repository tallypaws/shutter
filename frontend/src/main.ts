import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });

document.addEventListener(
  "touchmove",
  function (event) {
    event.preventDefault();
  },
  { passive: false }
);

document.addEventListener(
  "gesturestart",
  function (event) {
    event.preventDefault();
  },
  { passive: false }
);

document.addEventListener(
  "wheel",
  function (event) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
    }
  },
  { passive: false }
);
