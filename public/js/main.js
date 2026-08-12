// ── public/js/main.js ────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {

  // ── Mobile sidebar toggle ───────────────────────────────────────
  const toggleBtn = document.getElementById("sidebarToggle");
  const sidebar = document.querySelector(".sidebar");
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => sidebar.classList.toggle("show"));
  }

  // ── Confirm before any destructive action ───────────────────────
  document.querySelectorAll("[data-confirm]").forEach((el) => {
    el.addEventListener("submit", function (e) {
      const msg = el.getAttribute("data-confirm") || "Are you sure?";
      if (!confirm(msg)) e.preventDefault();
    });
  });

  // ── Auto-dismiss alerts after 5s ─────────────────────────────────
  document.querySelectorAll(".alert").forEach((el) => {
    setTimeout(() => {
      const alert = bootstrap.Alert.getOrCreateInstance(el);
      if (alert) alert.close();
    }, 5000);
  });

  // ── DYNAMIC LINE ITEMS (invoices, prescriptions, lab orders) ────────
  const itemsBody = document.getElementById("itemsBody");
  if (itemsBody) {
    const addRowBtn = document.getElementById("addItemRow");
    const rowTemplate = document.getElementById("itemRowTemplate");

    function recalcRow(row) {
      const qtyEl = row.querySelector(".item-qty");
      const priceEl = row.querySelector(".item-price");
      const totalEl = row.querySelector(".item-total");
      if (!qtyEl || !priceEl || !totalEl) return 0;
      const qty = parseFloat(qtyEl.value) || 0;
      const price = parseFloat(priceEl.value) || 0;
      const total = qty * price;
      totalEl.textContent = total.toFixed(2);
      return total;
    }

    function recalcAll() {
      let subtotal = 0;
      itemsBody.querySelectorAll("tr").forEach((row) => { subtotal += recalcRow(row); });

      const discountEl = document.getElementById("discountInput");
      const taxEl = document.getElementById("taxInput");
      const discount = parseFloat(discountEl?.value) || 0;
      const tax = parseFloat(taxEl?.value) || 0;
      const grandTotal = subtotal - discount + tax;

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val.toFixed(2); };
      set("sumSubtotal", subtotal);
      set("sumTotal", grandTotal);
      const hiddenTotal = document.getElementById("totalInput");
      if (hiddenTotal) hiddenTotal.value = grandTotal.toFixed(2);
    }

    itemsBody.addEventListener("input", (e) => { if (e.target.closest("tr")) recalcAll(); });
    document.getElementById("discountInput")?.addEventListener("input", recalcAll);
    document.getElementById("taxInput")?.addEventListener("input", recalcAll);

    itemsBody.addEventListener("click", (e) => {
      if (e.target.closest(".remove-row")) {
        const row = e.target.closest("tr");
        if (itemsBody.querySelectorAll("tr").length > 1) row.remove();
        recalcAll();
      }
    });

    if (addRowBtn && rowTemplate) {
      addRowBtn.addEventListener("click", () => {
        const clone = rowTemplate.content.cloneNode(true);
        itemsBody.appendChild(clone);
        recalcAll();
      });
    }

    // Auto-fill price when a medicine/test/service is selected
    itemsBody.addEventListener("change", (e) => {
      if (e.target.classList.contains("item-select")) {
        const selected = e.target.selectedOptions[0];
        const row = e.target.closest("tr");
        if (selected && selected.dataset.price) {
          const priceEl = row.querySelector(".item-price");
          const descEl = row.querySelector(".item-desc");
          if (priceEl) priceEl.value = selected.dataset.price;
          if (descEl) descEl.value = selected.textContent.trim();
        }
        recalcAll();
      }
    });

    recalcAll();
  }

  // ── Print button ─────────────────────────────────────────────────
  document.querySelectorAll("[data-print]").forEach((btn) => {
    btn.addEventListener("click", () => window.print());
  });
});
