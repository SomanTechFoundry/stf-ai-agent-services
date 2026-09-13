/**
 * STF AI Agent embeddable chat widget.
 *
 * Usage:
 * <script src="https://YOUR_APP/widget.js" data-business="salon-slug" data-token="WIDGET_TOKEN"></script>
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute("data-business");
  var token = script.getAttribute("data-token") || "";
  if (!slug) return;

  var origin = new URL(script.src).origin;
  var opened = false;
  var frame = null;

  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Open chat");
  btn.textContent = "Chat";
  btn.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;background:#0f172a;color:#fff;font:600 14px/1 system-ui,sans-serif;padding:14px 18px;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,.25)";

  var panel = document.createElement("div");
  panel.style.cssText =
    "display:none;position:fixed;right:20px;bottom:76px;z-index:2147483000;width:380px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 100px);border-radius:16px;overflow:hidden;box-shadow:0 16px 48px rgba(15,23,42,.28);background:#f4f2ee";

  function openPanel() {
    if (!frame) {
      frame = document.createElement("iframe");
      frame.title = "Business chat";
      var src = origin + "/chat/" + encodeURIComponent(slug) + "?embed=1";
      if (token) src += "&token=" + encodeURIComponent(token);
      frame.src = src;
      frame.style.cssText = "width:100%;height:100%;border:0;background:#f4f2ee";
      panel.appendChild(frame);
    }
    panel.style.display = "block";
    opened = true;
    btn.textContent = "Close";
  }

  function closePanel() {
    panel.style.display = "none";
    opened = false;
    btn.textContent = "Chat";
  }

  btn.addEventListener("click", function () {
    if (opened) closePanel();
    else openPanel();
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (event.data && event.data.type === "stf-close") closePanel();
  });

  document.body.appendChild(panel);
  document.body.appendChild(btn);
})();
