// Kept out of the "use client" preferences module so the root layout (a server
// component) receives the actual string.
export const PREFS_KEY = "sociopals:prefs";

// Runs inline in <head> before React, so there is no flash of the wrong layout.
export const PREFS_BOOT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${PREFS_KEY}")||"{}");var d=document.documentElement;d.dataset.density=p.density||"cozy";d.dataset.avatar=p.avatar||"round"}catch(e){}`;
