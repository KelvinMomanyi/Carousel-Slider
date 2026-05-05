(function () {
  function initSlider10(root) {
    if (root.dataset.slider10Ready === 'true') return;
    const blockId = root.dataset.blockId;
    const slide = root.querySelector('#slide-' + blockId);
    const next = root.querySelector('#next-' + blockId);
    const prev = root.querySelector('#prev-' + blockId);
    if (!slide || !next || !prev) return;
    const rootPath = window.Shopify?.routes?.root || '/';
    let autoSlideTimer = null;
    const autoSlideDelay = 5000;

    const setCartFeedback = (feedback, message, state) => {
      if (!feedback) return;
      feedback.textContent = message || '';
      feedback.dataset.state = state || '';
    };

    const submitCartButton = async (button) => {
      if (!button || button.disabled) return;
      const feedback = button.parentElement ? button.parentElement.querySelector('.cart-feedback') : null;
      const defaultLabel = button.dataset.defaultLabel || button.textContent.trim();
      button.dataset.defaultLabel = defaultLabel;
      button.disabled = true;
      button.textContent = 'Adding...';
      setCartFeedback(feedback, '', '');
      try {
        const response = await fetch(`${rootPath}cart/add.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ id: button.dataset.cartId, quantity: '1' })
        });
        if (!response.ok) {
          let errorMessage = 'Unable to add this product to cart.';
          try { const d = await response.json(); errorMessage = d.description || d.message || errorMessage; } catch (e) {}
          throw new Error(errorMessage);
        }
        button.textContent = 'Added';
        setCartFeedback(feedback, 'Added to cart.', 'success');
      } catch (error) {
        button.textContent = 'Try again';
        setCartFeedback(feedback, error.message || 'Unable to add this product to cart.', 'error');
      }
      window.setTimeout(() => {
        if (!root.isConnected) return;
        button.disabled = false;
        button.textContent = button.dataset.defaultLabel || defaultLabel;
        setCartFeedback(feedback, '', '');
      }, 1800);
    };

    const restartAutoSlide = () => {
      window.clearTimeout(autoSlideTimer);
      if (slide.querySelectorAll('.item').length > 1) {
        autoSlideTimer = window.setTimeout(() => { if (!root.isConnected) return; next.click(); }, autoSlideDelay);
      }
    };

    next.addEventListener('click', () => { const lists = slide.querySelectorAll('.item'); slide.appendChild(lists[0]); restartAutoSlide(); });
    prev.addEventListener('click', () => { const lists = slide.querySelectorAll('.item'); slide.prepend(lists[lists.length - 1]); restartAutoSlide(); });
    root.querySelectorAll('[data-url]').forEach((button) => { button.addEventListener('click', () => window.location.href = button.dataset.url); });
    root.querySelectorAll('[data-cart-id]').forEach((button) => { button.addEventListener('click', () => { submitCartButton(button); }); });

    root.dataset.slider10Ready = 'true';
    restartAutoSlide();
  }

  function initAll() {
    document.querySelectorAll('.slider-10-root').forEach(initSlider10);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
