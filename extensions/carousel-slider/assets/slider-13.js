(() => {
  document.querySelectorAll('.slider-13-root').forEach((root) => {
  const slider = root?.querySelector('.slider');
  const items = Array.from(root?.querySelectorAll('.slider .item') || []);
  const next = root?.querySelector('.slider-13-next');
  const prev = root?.querySelector('.slider-13-prev');
  const cartForms = Array.from(root?.querySelectorAll('[data-slider-13-cart-form]') || []);
  if (!slider || !items.length || !next || !prev) return;
  if (items.length === 1) {
    next.hidden = true;
    prev.hidden = true;
  }

  const totalItems = items.length;
  const motionDuration = 580;
  let active = Math.min(3, items.length - 1);
  const autoplaySpeed = (parseFloat(root.dataset.autoplaySpeed) || 3) * 1000;
  let autoplayTimer = null;
  let isPaused = false;
  let isAnimating = false;
  let animationTimer = null;

  const updateControls = () => {
    const canLoop = totalItems > 1;
    prev.disabled = !canLoop;
    next.disabled = !canLoop;
  };

  const getSignedOffset = (index) => {
    const rawOffset = (index - active + totalItems) % totalItems;
    if (rawOffset === 0) return 0;
    return rawOffset <= totalItems / 2 ? rawOffset : rawOffset - totalItems;
  };

  const applyItemState = (item, offset, step, scaleStep) => {
    const depth = Math.abs(offset);
    const previousDepth = Number(item.dataset.depth || totalItems);
    const shouldSnap = previousDepth > 2 && depth > 2;

    item.style.transition = shouldSnap ? 'none' : '';
    item.style.pointerEvents = depth <= 2 ? 'auto' : 'none';

    if (depth === 0) {
      item.style.transform = 'translate3d(0, 0, 0) scale(1)';
      item.style.zIndex = String(totalItems + 2);
      item.style.filter = 'none';
      item.style.opacity = '1';
      item.dataset.depth = '0';
      return;
    }

    const slot = Math.min(depth, 3);
    const direction = offset > 0 ? 1 : -1;
    const distance = step * (slot === 3 ? 3.2 : slot);
    const scale = slot === 1 ? Math.max(0.8, 1 - scaleStep) : slot === 2 ? Math.max(0.72, 1 - scaleStep * 2) : 0.72;
    const rotation = slot === 1 ? 8 : slot === 2 ? 11 : 14;

    item.style.transform = `translate3d(${direction * distance}px, 0, 0) scale(${scale}) perspective(900px) rotateY(${direction > 0 ? -rotation : rotation}deg)`;
    item.style.zIndex = String(totalItems - slot);
    item.style.filter = slot > 1 ? 'blur(1px) saturate(0.8)' : 'saturate(0.9)';
    item.style.opacity = slot === 1 ? '0.78' : slot === 2 ? '0.34' : '0';
    item.dataset.depth = String(depth);
  };

  const loadShow = () => {
    const sliderWidth = slider.getBoundingClientRect().width;
    const step = sliderWidth < 640 ? 76 : sliderWidth < 1024 ? 102 : 134;
    const scaleStep = sliderWidth < 640 ? 0.18 : 0.14;

    items.forEach((item, index) => {
      const offset = getSignedOffset(index);
      item.classList.toggle('is-active', offset === 0);
      applyItemState(item, offset, step, scaleStep);
    });

    updateControls();
    root.dataset.sliderReady = 'true';
  };

  const shiftActive = (direction) => {
    active = (active + direction + totalItems) % totalItems;
    loadShow();
  };

  const lockMotion = () => {
    isAnimating = true;
    clearTimeout(animationTimer);
    animationTimer = setTimeout(() => {
      isAnimating = false;
    }, motionDuration);
  };

  const autoAdvance = () => {
    if (totalItems <= 1) return;
    if (isAnimating) return;
    shiftActive(1);
    lockMotion();
  };

  const startAutoplay = () => {
    stopAutoplay();
    if (!isPaused && totalItems > 1) {
      autoplayTimer = setInterval(autoAdvance, autoplaySpeed);
    }
  };

  const stopAutoplay = () => {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  };

  const resetAutoplay = () => {
    stopAutoplay();
    startAutoplay();
  };

  loadShow();
  startAutoplay();

  next.addEventListener('click', () => {
    if (isAnimating) return;
    shiftActive(1);
    lockMotion();
    resetAutoplay();
  });
  prev.addEventListener('click', () => {
    if (isAnimating) return;
    shiftActive(-1);
    lockMotion();
    resetAutoplay();
  });

  root.addEventListener('mouseenter', () => { isPaused = true; stopAutoplay(); });
  root.addEventListener('mouseleave', () => { isPaused = false; startAutoplay(); });
  root.addEventListener('touchstart', () => { isPaused = true; stopAutoplay(); }, { passive: true });
  root.addEventListener('touchend', () => { setTimeout(() => { isPaused = false; startAutoplay(); }, 1000); });

  cartForms.forEach((form) => {
    const button = form.querySelector('.item__cart-button');
    const label = form.querySelector('[data-slider-13-cart-label]');
    const feedback = form.parentElement?.querySelector('[data-slider-13-cart-feedback]');
    if (!button || !label) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (button.disabled) return;

      const defaultLabel = button.dataset.defaultLabel || label.textContent.trim();
      button.dataset.defaultLabel = defaultLabel;
      button.disabled = true;
      button.dataset.state = 'loading';
      label.textContent = 'Adding...';
      if (feedback) {
        feedback.textContent = '';
        feedback.dataset.state = '';
      }

      try {
        const rootPath = window.Shopify?.routes?.root || '/';
        const response = await fetch(`${rootPath}cart/add.js`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
          },
          body: new URLSearchParams(new FormData(form))
        });

        if (!response.ok) {
          let errorMessage = 'Unable to add item to cart';

          try {
            const errorData = await response.json();
            errorMessage = errorData.description || errorData.message || errorMessage;
          } catch (error) {
            errorMessage = 'Unable to add item to cart';
          }

          throw new Error(errorMessage);
        }

        const addedItem = await response.json();
        button.dataset.state = 'added';
        label.textContent = 'Added';
        if (feedback) {
          feedback.textContent = 'Added to cart.';
          feedback.dataset.state = 'success';
        }

        fetch(`${rootPath}cart.js`, {
          headers: {
            Accept: 'application/json'
          }
        })
          .then((cartResponse) => cartResponse.ok ? cartResponse.json() : null)
          .then((cart) => {
            document.dispatchEvent(new CustomEvent('slider13:cart:updated', {
              detail: {
                item: addedItem,
                cart
              }
            }));
          })
          .catch(() => {
            document.dispatchEvent(new CustomEvent('slider13:cart:updated', {
              detail: {
                item: addedItem,
                cart: null
              }
            }));
          });
      } catch (error) {
        button.dataset.state = 'error';
        label.textContent = 'Try again';
        if (feedback) {
          feedback.textContent = error.message || 'Unable to add item to cart';
          feedback.dataset.state = 'error';
        }
      }

      window.setTimeout(() => {
        if (!root.isConnected) return;
        button.disabled = false;
        button.dataset.state = '';
        label.textContent = button.dataset.defaultLabel || 'Add to cart';
        if (feedback) {
          feedback.textContent = '';
          feedback.dataset.state = '';
        }
      }, 1400);
    });
  });

  window.addEventListener('resize', loadShow);
  });
})();
