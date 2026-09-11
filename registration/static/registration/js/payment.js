(function () {
  "use strict";

  var form = document.getElementById("payment-form");
  if (!form) return;

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  var receiptInput = document.getElementById("receiptFile");
  var receiptPreview = document.getElementById("receipt-preview");
  var receiptWrap = document.getElementById("field-receipt");
  var receiptError = document.getElementById("receipt-error");
  var submitBtn = document.getElementById("pay-submit-btn");
  var copyBtn = document.getElementById("copy-payid");
  var copyStatus = document.getElementById("copy-status");
  var payidValue = document.getElementById("payid-value");
  var resultOverlay = document.getElementById("resultOverlay");
  var resultTitle = document.getElementById("resultTitle");
  var resultMessage = document.getElementById("resultMessage");
  var resultClose = document.getElementById("resultClose");
  var resultAction = document.getElementById("resultAction");

  function getCsrfToken() {
    var input = form.querySelector('input[name="csrfmiddlewaretoken"]');
    if (input) return input.value;
    var match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function showResultPopup(type, title, message) {
    resultOverlay.classList.remove("result-success", "result-error");
    resultOverlay.classList.add(type === "success" ? "result-success" : "result-error");
    resultTitle.textContent = title;
    resultMessage.innerHTML = message;
    resultOverlay.classList.add("is-open");
    resultOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeResultPopup() {
    resultOverlay.classList.remove("is-open");
    resultOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  resultClose.addEventListener("click", closeResultPopup);
  resultAction.addEventListener("click", closeResultPopup);
  resultOverlay.addEventListener("click", function (e) {
    if (e.target === resultOverlay) closeResultPopup();
  });

  if (copyBtn && payidValue) {
    copyBtn.addEventListener("click", function () {
      var value = payidValue.textContent.trim();
      function copied() {
        if (copyStatus) {
          copyStatus.hidden = false;
          setTimeout(function () {
            copyStatus.hidden = true;
          }, 2000);
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(copied).catch(copied);
      } else {
        copied();
      }
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error("Upload a screenshot of your bank payment."));
        return;
      }
      if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
        reject(new Error("Screenshot must be a JPG, PNG, WEBP, or GIF image."));
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error("Screenshot must be 2 MB or smaller."));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error("Could not read the screenshot file."));
      };
      reader.readAsDataURL(file);
    });
  }

  if (receiptInput) {
    receiptInput.addEventListener("change", function () {
      var file = receiptInput.files && receiptInput.files[0];
      if (!file) {
        receiptPreview.style.display = "none";
        return;
      }
      readFileAsDataUrl(file)
        .then(function (url) {
          receiptPreview.src = url;
          receiptPreview.style.display = "block";
          receiptWrap.classList.remove("err");
        })
        .catch(function (err) {
          receiptPreview.style.display = "none";
          receiptWrap.classList.add("err");
          if (receiptError) receiptError.textContent = err.message;
        });
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    receiptWrap.classList.remove("err");
    var file = receiptInput && receiptInput.files && receiptInput.files[0];
    var dataUrl;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch (err) {
      receiptWrap.classList.add("err");
      if (receiptError) receiptError.textContent = err.message;
      showResultPopup("error", "Screenshot required", err.message);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading…";
    try {
      var res = await fetch(form.dataset.payUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({ receipt: dataUrl }),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = { ok: false, message: "Could not save the screenshot." };
      }
      if (res.ok && data.ok !== false && data.status !== "error") {
        showResultPopup(
          "success",
          "Payment screenshot received",
          data.message || "The organisers can now match your PayID transfer."
        );
      } else {
        showResultPopup(
          "error",
          "Upload failed",
          data.message || "Could not save the screenshot. Try again."
        );
      }
    } catch (err) {
      showResultPopup(
        "error",
        "Upload failed",
        (err && err.message) || "Could not reach the server."
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit payment screenshot";
    }
  });
})();
