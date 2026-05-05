(function () {
  function initSlider06(root) {
    if (root.dataset.slider06Ready === 'true') return;
    const prevBtn = root.querySelector('[data-slider-06-prev]');
    const nextBtn = root.querySelector('[data-slider-06-next]');
    const items = root.querySelectorAll('.list .item');
    const indicator = root.querySelector('.indicators');
    const dots = indicator ? indicator.querySelectorAll('ul li') : [];
    const rootPath = window.Shopify?.routes?.root || '/';
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
        button.textContent = 'Try Again';
        setCartFeedback(feedback, error.message || 'Unable to add this product to cart.', 'error');
      }
      window.setTimeout(() => {
        if (!root.isConnected) return;
        button.disabled = false;
        button.textContent = button.dataset.defaultLabel || defaultLabel;
        setCartFeedback(feedback, '', '');
      }, 1800);
    };

    const setSlider = () => {
      const oldActive = root.querySelector('.list .item.active');
      if (oldActive) oldActive.classList.remove('active');
      items[active].classList.add('active');
      const oldDot = indicator.querySelector('ul li.active');
      if (oldDot) oldDot.classList.remove('active');
      if (dots[active]) dots[active].classList.add('active');
      indicator.querySelector('.number').innerText = String(active + 1).padStart(2, '0');
      startAutoPlay();
    };

    nextBtn.addEventListener('click', () => {
      active = active + 1 > lastPosition ? 0 : active + 1;
      root.style.setProperty('--calculation', 1);
      setSlider();
    });
    prevBtn.addEventListener('click', () => {
      active = active - 1 < 0 ? lastPosition : active - 1;
      root.style.setProperty('--calculation', -1);
      setSlider();
    });
    dots.forEach((dot, position) => {
      dot.addEventListener('click', () => { active = position; setSlider(); });
    });
    root.querySelectorAll('[data-url]').forEach((btn) => {
      btn.addEventListener('click', () => { window.location.href = btn.dataset.url; });
    });
    root.querySelectorAll('[data-cart-id]').forEach((btn) => {
      btn.addEventListener('click', () => { submitCartButton(btn); });
    });

    root.dataset.slider06Ready = 'true';
    setSlider();
  }

  function initAll() {
    document.querySelectorAll('.slider-06-root').forEach(initSlider06);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
