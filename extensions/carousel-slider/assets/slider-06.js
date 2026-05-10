(function () {
  const MIN_TEXT_CONTRAST = 4.5;
  const BLACK = [0, 0, 0];
  const WHITE = [255, 255, 255];

  function parseRgb(value) {
    const raw = (value || "").trim();
    if (!raw || raw.includes("var(")) return null;

    const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const normalized =
        hex[1].length === 3
          ? hex[1]
              .split("")
              .map((char) => char + char)
              .join("")
          : hex[1];
      return [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16),
      ];
    }

    const rgbFunction = raw.match(/rgba?\(([^)]+)\)/i);
    const channels = rgbFunction
      ? rgbFunction[1]
          .replace("/", " ")
          .split(rgbFunction[1].includes(",") ? "," : /\s+/)
      : raw.includes(",")
        ? raw.split(",")
        : /^[-.\d]/.test(raw)
          ? raw.replace("/", " ").split(/\s+/)
          : [];

    if (channels.length < 3) return null;
    const rgb = channels.slice(0, 3).map((channel) => {
      const trimmed = channel.trim();
      if (trimmed.endsWith("%"))
        return Math.round((parseFloat(trimmed) / 100) * 255);
      return Math.round(parseFloat(trimmed));
    });

    return rgb.every((channel) => Number.isFinite(channel)) ? rgb : null;
  }

  function readRgb(styles, tokens, fallback) {
    for (const token of tokens) {
      const parsed = parseRgb(styles.getPropertyValue(token));
      if (parsed) return parsed;
    }
    return parseRgb(fallback);
  }

  function luminance(rgb) {
    const [r, g, b] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastRatio(first, second) {
    const lighter = Math.max(luminance(first), luminance(second));
    const darker = Math.min(luminance(first), luminance(second));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function readableRgb(background) {
    return contrastRatio(background, BLACK) > contrastRatio(background, WHITE)
      ? BLACK
      : WHITE;
  }

  function readableRgbForSurfaces(surfaces) {
    const validSurfaces = surfaces.filter(Boolean);
    if (!validSurfaces.length) return WHITE;
    const blackContrast = Math.min(
      ...validSurfaces.map((surface) => contrastRatio(surface, BLACK)),
    );
    const whiteContrast = Math.min(
      ...validSurfaces.map((surface) => contrastRatio(surface, WHITE)),
    );
    return blackContrast > whiteContrast ? BLACK : WHITE;
  }

  function hasMinimumContrast(color, surfaces) {
    return surfaces
      .filter(Boolean)
      .every((surface) => contrastRatio(surface, color) >= MIN_TEXT_CONTRAST);
  }

  function rgbToCss(rgb) {
    return `rgb(${rgb.join(", ")})`;
  }

  function setColorTokens(root, rgbToken, colorToken, rgb) {
    root.style.setProperty(rgbToken, rgb.join(", "));
    root.style.setProperty(colorToken, rgbToCss(rgb));
  }

  function ensureReadableColors(root) {
    const styles = window.getComputedStyle(root);
    const background = readRgb(
      styles,
      [
        "--slider-background-rgb",
        "--color-background",
        "--color-base-background-1",
      ],
      styles.backgroundColor,
    );
    if (!background) return;

    const readableText = readableRgb(background);
    const foreground = readRgb(
      styles,
      ["--slider-foreground-rgb", "--color-foreground", "--color-base-text"],
      styles.color,
    );
    if (
      !foreground ||
      contrastRatio(background, foreground) < MIN_TEXT_CONTRAST
    ) {
      setColorTokens(
        root,
        "--slider-foreground-rgb",
        "--slider-foreground",
        readableText,
      );
    }

    let buttonSurface = readRgb(
      styles,
      ["--slider-button-rgb", "--color-button", "--color-base-accent-1"],
      "",
    );
    if (
      buttonSurface &&
      contrastRatio(background, buttonSurface) < MIN_TEXT_CONTRAST
    ) {
      buttonSurface = readableText;
      setColorTokens(
        root,
        "--slider-button-rgb",
        "--slider-accent",
        readableText,
      );
    }

    let outline = readRgb(
      styles,
      [
        "--slider-secondary-rgb",
        "--color-secondary-button-text",
        "--color-base-outline-button-labels",
      ],
      "",
    );
    if (outline && contrastRatio(background, outline) < MIN_TEXT_CONTRAST) {
      outline = readableText;
      setColorTokens(
        root,
        "--slider-secondary-rgb",
        "--slider-accent-secondary",
        readableText,
      );
    }

    if (buttonSurface) {
      const buttonText = readRgb(
        styles,
        [
          "--slider-button-text-rgb",
          "--color-button-text",
          "--color-base-solid-button-labels",
        ],
        "",
      );
      if (
        !buttonText ||
        !hasMinimumContrast(buttonText, [buttonSurface, outline])
      ) {
        setColorTokens(
          root,
          "--slider-button-text-rgb",
          "--slider-on-accent",
          readableRgbForSurfaces([buttonSurface, outline]),
        );
      }
    }

    const error = readRgb(styles, ["--slider-error-rgb", "--color-error"], "");
    if (error && contrastRatio(background, error) < MIN_TEXT_CONTRAST) {
      setColorTokens(
        root,
        "--slider-error-rgb",
        "--slider-error",
        readableText,
      );
    }
  }

  function initSlider06(root) {
    if (root.dataset.slider06Ready === "true") return;
    ensureReadableColors(root);
    const prevBtn = root.querySelector("[data-slider-06-prev]");
    const nextBtn = root.querySelector("[data-slider-06-next]");
    const items = root.querySelectorAll(".list .item");
    const indicator = root.querySelector(".indicators");
    const dots = indicator ? indicator.querySelectorAll("ul li") : [];
    const rootPath = window.Shopify?.routes?.root || "/";
    if (!prevBtn || !nextBtn || !items.length || !indicator) return;

    let active = 0;
    const lastPosition = items.length - 1;
    let autoPlay;

    const startAutoPlay = () => {
      clearInterval(autoPlay);
      autoPlay = setInterval(() => nextBtn.click(), 5000);
    };

    const setCartFeedback = (feedback, message, state) => {
      if (!feedback) return;
      feedback.textContent = message || "";
      feedback.dataset.state = state || "";
    };

    const submitCartButton = async (button) => {
      if (!button || button.disabled) return;
      const feedback = button.parentElement
        ? button.parentElement.querySelector(".cart-feedback")
        : null;
      const defaultLabel =
        button.dataset.defaultLabel || button.textContent.trim();
      button.dataset.defaultLabel = defaultLabel;
      button.disabled = true;
      button.textContent = "Adding...";
      setCartFeedback(feedback, "", "");
      try {
        const response = await fetch(`${rootPath}cart/add.js`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            id: button.dataset.cartId,
            quantity: "1",
          }),
        });
        if (!response.ok) {
          let errorMessage = "Unable to add this product to cart.";
          try {
            const d = await response.json();
            errorMessage = d.description || d.message || errorMessage;
          } catch {
            // Keep the fallback message when the cart error body is not JSON.
          }
          throw new Error(errorMessage);
        }
        button.textContent = "Added";
        setCartFeedback(feedback, "Added to cart.", "success");
      } catch (error) {
        button.textContent = "Try Again";
        setCartFeedback(
          feedback,
          error.message || "Unable to add this product to cart.",
          "error",
        );
      }
      window.setTimeout(() => {
        if (!root.isConnected) return;
        button.disabled = false;
        button.textContent = button.dataset.defaultLabel || defaultLabel;
        setCartFeedback(feedback, "", "");
      }, 1800);
    };

    const setSlider = () => {
      const oldActive = root.querySelector(".list .item.active");
      if (oldActive) oldActive.classList.remove("active");
      items[active].classList.add("active");
      const oldDot = indicator.querySelector("ul li.active");
      if (oldDot) oldDot.classList.remove("active");
      if (dots[active]) dots[active].classList.add("active");
      const number = indicator.querySelector(".number");
      if (number) number.innerText = String(active + 1).padStart(2, "0");
      startAutoPlay();
    };

    nextBtn.addEventListener("click", () => {
      active = active + 1 > lastPosition ? 0 : active + 1;
      root.style.setProperty("--calculation", 1);
      setSlider();
    });
    prevBtn.addEventListener("click", () => {
      active = active - 1 < 0 ? lastPosition : active - 1;
      root.style.setProperty("--calculation", -1);
      setSlider();
    });
    dots.forEach((dot, position) => {
      dot.addEventListener("click", () => {
        active = position;
        setSlider();
      });
    });
    root.querySelectorAll("[data-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.href = btn.dataset.url;
      });
    });
    root.querySelectorAll("[data-cart-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        submitCartButton(btn);
      });
    });

    root.dataset.slider06Ready = "true";
    setSlider();
  }

  function initAll() {
    document.querySelectorAll(".slider-06-root").forEach(initSlider06);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
