(() => {
  const init = (root) => {
    if (!root || root.dataset.slider11Ready === 'true') return;

    const slide = root.querySelector('[data-slider-11-track]');
    const next = root.querySelector('[data-slider-11-next]');
    const prev = root.querySelector('[data-slider-11-prev]');
    if (!slide || !next || !prev) return;

    let autoPlay = null;
    let isAnimating = false;
    const animationDuration = 950;
    const rootPath = window.Shopify?.routes?.root || '/';

    const moveNext = () => {
      if (isAnimating) return;
      const lists = slide.querySelectorAll('.item');
      if (!lists.length) return;
      isAnimating = true;
      slide.appendChild(lists[0]);
      window.setTimeout(() => { isAnimating = false; }, animationDuration);
    };

    const movePrev = () => {
      if (isAnimating) return;
      const lists = slide.querySelectorAll('.item');
      if (!lists.length) return;
      isAnimating = true;
      slide.prepend(lists[lists.length - 1]);
      window.setTimeout(() => { isAnimating = false; }, animationDuration);
    };

    const stopAutoPlay = () => {
      if (autoPlay) {
        window.clearInterval(autoPlay);
        autoPlay = null;
      }
    };

    const startAutoPlay = () => {
      stopAutoPlay();
      autoPlay = window.setInterval(() => {
        if (!root.isConnected) {
          stopAutoPlay();
          return;
        }
        moveNext();
      }, 4000);
    };

    const setCartFeedback = (feedback, message, state) => {
      if (!feedback) return;
      feedback.textContent = message || '';
      feedback.dataset.state = state || '';
    };

    const submitCartButton = async (button) => {
      if (!button || button.disabled) return;

      const actions = button.closest('.actions');
      const feedback = actions ? actions.querySelector('.cart-feedback') : null;
      const defaultLabel = button.dataset.defaultLabel || button.textContent.trim();
      button.dataset.defaultLabel = defaultLabel;
      button.disabled = true;
      button.textContent = 'Adding...';
      setCartFeedback(feedback, '', '');

      try {
        const response = await fetch(`${rootPath}cart/add.js`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
          },
          body: new URLSearchParams({
            id: button.dataset.cartId,
            quantity: '1'
          })
        });

        if (!response.ok) {
          let errorMessage = 'Unable to add this product to cart.';

          try {
            const errorData = await response.json();
            errorMessage = errorData.description || errorData.message || errorMessage;
          } catch (error) {
            errorMessage = 'Unable to add this product to cart.';
          }

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

    next.addEventListener('click', () => {
      moveNext();
      startAutoPlay();
    });

    prev.addEventListener('click', () => {
      movePrev();
      startAutoPlay();
    });

    root.querySelectorAll('[data-url]').forEach((button) => {
      button.addEventListener('click', () => {
        window.location.href = button.dataset.url;
      });
    });

    root.querySelectorAll('[data-cart-id]').forEach((button) => {
      button.addEventListener('click', () => submitCartButton(button));
    });

    root.addEventListener('mouseenter', stopAutoPlay);
    root.addEventListener('mouseleave', startAutoPlay);
    root.addEventListener('focusin', stopAutoPlay);
    root.addEventListener('focusout', () => {
      if (!root.contains(document.activeElement)) {
        startAutoPlay();
      }
    });

    root.dataset.slider11Ready = 'true';
    startAutoPlay();
  };

  const initAll = () => {
    document.querySelectorAll('[data-slider-11]').forEach(init);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll, { once: true });
  } else {
    initAll();
  }
})();
