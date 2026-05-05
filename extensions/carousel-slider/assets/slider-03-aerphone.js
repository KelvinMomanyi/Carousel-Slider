(() => {
  const init = (root) => {
    if (!root || root.dataset.slider03Ready === "true") return;

    const nextButton = root.querySelector("[data-slider-03-next]");
    const prevButton = root.querySelector("[data-slider-03-prev]");
    const carousel = root.querySelector(".carousel");
    const list = root.querySelector(".carousel .list");
    if (!nextButton || !prevButton || !carousel || !list) return;

    let unblockClick;
    let autoPlay;
    const rootPath = window.Shopify?.routes?.root || "/";

    const startAutoPlay = () => {
      clearInterval(autoPlay);
      autoPlay = setInterval(() => {
        if (!carousel.classList.contains("showDetail")) {
          showSlider("next");
        }
      }, 5000);
    };

    const showSlider = (type) => {
      nextButton.style.pointerEvents = "none";
      prevButton.style.pointerEvents = "none";
      carousel.classList.remove("next", "prev");

      const items = root.querySelectorAll(".carousel .list .item");
      if (!items.length) return;

      if (type === "next") {
        list.appendChild(items[0]);
        carousel.classList.add("next");
      } else {
        list.prepend(items[items.length - 1]);
        carousel.classList.add("prev");
      }

      clearTimeout(unblockClick);
      unblockClick = setTimeout(() => {
        nextButton.style.pointerEvents = "auto";
        prevButton.style.pointerEvents = "auto";
      }, 2000);

      startAutoPlay();
    };

    const updateCartFeedback = (feedback, message, state) => {
      if (!feedback) return;
      feedback.textContent = message || "";
      feedback.dataset.state = state || "";
    };

    const submitCartRequest = async ({ button, form, variantId, feedback }) => {
      if (!button || button.disabled) return;

      const defaultLabel = button.dataset.defaultLabel || button.textContent.trim();
      button.dataset.defaultLabel = defaultLabel;
      button.disabled = true;
      button.textContent = "ADDING...";
      updateCartFeedback(feedback, "", "");

      try {
        const requestBody = form
          ? new URLSearchParams(new FormData(form))
          : new URLSearchParams({ id: variantId, quantity: "1" });

        const response = await fetch(`${rootPath}cart/add.js`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json"
          },
          body: requestBody
        });

        if (!response.ok) {
          let errorMessage = "Unable to add this product to cart.";

          try {
            const errorData = await response.json();
            errorMessage = errorData.description || errorData.message || errorMessage;
          } catch (error) {
            errorMessage = "Unable to add this product to cart.";
          }

          throw new Error(errorMessage);
        }

        updateCartFeedback(feedback, "Added to cart.", "success");
        button.textContent = "ADDED";
      } catch (error) {
        updateCartFeedback(feedback, error.message || "Unable to add this product to cart.", "error");
        button.textContent = "TRY AGAIN";
      }

      window.setTimeout(() => {
        if (!root.isConnected) return;
        button.disabled = false;
        button.textContent = button.dataset.defaultLabel || defaultLabel;
        updateCartFeedback(feedback, "", "");
      }, 1800);
    };

    nextButton.addEventListener("click", () => showSlider("next"));
    prevButton.addEventListener("click", () => showSlider("prev"));

    root.querySelectorAll(".checkout button[data-url]").forEach((button) => {
      button.addEventListener("click", () => {
        window.location.href = button.dataset.url;
      });
    });

    root.querySelectorAll(".addToCartForm").forEach((form) => {
      const button = form.querySelector(".addToCart");
      const feedback = form.parentElement?.querySelector("[data-slider-03-cart-feedback]");
      if (!button) return;

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitCartRequest({ button, form, feedback });
      });
    });

    root.querySelectorAll(".checkout button[data-cart-id]").forEach((button) => {
      const feedback = button.closest(".checkout")?.querySelector("[data-slider-03-cart-feedback]");
      button.addEventListener("click", () => {
        submitCartRequest({ button, variantId: button.dataset.cartId, feedback });
      });
    });

    root.dataset.slider03Ready = "true";
    startAutoPlay();
  };

  const initAll = () => {
    document.querySelectorAll("[data-slider-03]").forEach(init);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll, { once: true });
  } else {
    initAll();
  }
})();
