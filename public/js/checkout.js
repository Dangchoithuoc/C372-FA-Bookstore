(function () {
  const btnShip = document.getElementById("btnShip");
  const btnPickup = document.getElementById("btnPickup");

  const shipFields = document.getElementById("shipFields");
  const pickupFields = document.getElementById("pickupFields");

  const deliveryType = document.getElementById("deliveryType");
  const form = document.getElementById("checkoutForm");
  const errorBox = document.getElementById("deliveryError");

  // Ship inputs
  const shipAddress1 = form.querySelector('[name="ship_address1"]');
  const shipPostal = form.querySelector('[name="ship_postal"]');
  const shipCity = form.querySelector('[name="ship_city"]');

  // Pickup inputs
  const pickupLocation = document.getElementById("pickupLocation");
  const pickupTimeslot = document.getElementById("pickupTimeslot");

  function setSelected(btn, isSelected) {
    // minimal styling without touching css: uses inline style
    btn.style.opacity = isSelected ? "1" : "0.6";
    btn.style.fontWeight = isSelected ? "700" : "500";
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = "block";
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.style.display = "none";
  }

  function setShipRequired(on) {
    shipAddress1.required = on;
    shipPostal.required = on;
    shipCity.required = on;
  }

  function setPickupRequired(on) {
    pickupLocation.required = on;
    pickupTimeslot.required = on;
  }

  function selectMode(mode) {
    clearError();

    if (mode === "SHIP") {
      deliveryType.value = "SHIP";
      shipFields.style.display = "block";
      pickupFields.style.display = "none";
      setShipRequired(true);
      setPickupRequired(false);
      pickupLocation.value = "";
      pickupTimeslot.value = "";
      setSelected(btnShip, true);
      setSelected(btnPickup, false);
    } else if (mode === "PICKUP") {
      deliveryType.value = "PICKUP";
      shipFields.style.display = "none";
      pickupFields.style.display = "block";
      setShipRequired(false);
      setPickupRequired(true);
      shipAddress1.value = "";
      shipPostal.value = "";
      shipCity.value = "";
      setSelected(btnShip, false);
      setSelected(btnPickup, true);
    }
  }

  btnShip.addEventListener("click", () => selectMode("SHIP"));
  btnPickup.addEventListener("click", () => selectMode("PICKUP"));

  form.addEventListener("submit", (e) => {
    clearError();

    const mode = deliveryType.value;

    if (!mode) {
      e.preventDefault();
      showError("Please choose Ship or Pick up before proceeding.");
      return;
    }

    if (mode === "SHIP") {
      // basic extra validation
      if (!shipAddress1.value.trim() || !shipPostal.value.trim() || !shipCity.value.trim()) {
        e.preventDefault();
        showError("Please fill in shipping address, postal code, and city.");
        return;
      }
    }

    if (mode === "PICKUP") {
      if (!pickupLocation.value || !pickupTimeslot.value) {
        e.preventDefault();
        showError("Please select a pickup location and time slot.");
        return;
      }
    }
  });

  // Default state: none selected
  setSelected(btnShip, false);
  setSelected(btnPickup, false);
  setShipRequired(false);
  setPickupRequired(false);
})();
