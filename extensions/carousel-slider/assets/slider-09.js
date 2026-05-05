(function () {
  function initSlider09(root) {
    if (root.dataset.slider09Ready === 'true') return;
    const list = root.querySelectorAll('.carousel .list .item');
    const carousel = root.querySelector('.carousel');
    const dots = root.querySelectorAll('.dots li');
    const nextBtn = root.querySelector('.arrows-next');
    const prevBtn = root.querySelector('.arrows-prev');
    const cartForms = Array.from(root.querySelectorAll('[data-slider-09-cart-form]') || []);
    if (!list?.length || !carousel || !dots?.length || !nextBtn || !prevBtn) return;

    const lastPosition = list.length - 1;
    let active = 0;
    let zIndex = 2;
    let removeEffect;
    let autoRun = setTimeout(() => nextBtn.click(), 5000);

    const setItemActive = (newValue, direction, callbackFunction) => {
      if (newValue === active) return;
      active = newValue;
      callbackFunction(direction);
    };

    const showSlider = (type) => {
      carousel.style.pointerEvents = 'none';
      const itemActiveOld = root.querySelector('.carousel .list .item.active');
      if (itemActiveOld) itemActiveOld.classList.remove('active');
      zIndex++;
      list[active].style.zIndex = zIndex;
      list[active].classList.add('active');
      if (type === 'previous') {
        carousel.style.setProperty('--slider09-active-from', '-300px');
        carousel.style.setProperty('--slider09-item-to', '300px');
        carousel.style.setProperty('--slider09-clip-edge', '0%');
      } else {
        carousel.style.setProperty('--slider09-active-from', '300px');
        carousel.style.setProperty('--slider09-item-to', '-300px');
        carousel.style.setProperty('--slider09-clip-edge', '100%');
      }
      carousel.classList.add('effect');
      const dotActiveOld = root.querySelector('.dots li.active');
      if (dotActiveOld) dotActiveOld.classList.remove('active');
      dots[active].classList.add('active');
      clearTimeout(removeEffect);
      removeEffect = setTimeout(() => { carousel.classList.remove('effect'); carousel.style.pointerEvents = 'auto'; }, 1500);
      clearTimeout(autoRun);
      autoRun = setTimeout(() => nextBtn.click(), 5000);
    };

    nextBtn.addEventListener('click', () => { const newValue = active + 1 > lastPosition ? 0 : active + 1; setItemActive(newValue, 'next', showSlider); });
    prevBtn.addEventListener('click', () => { const newValue = active - 1 < 0 ? lastPosition : active - 1; setItemActive(newValue, 'previous', showSlider); });
    dots.forEach((dot, index) => { dot.addEventListener('click', () => setItemActive(index, 'next', showSlider)); });

    cartForms.forEach((form) => {
      const button = form.querySelector('.add-to-cart');
      const label = form.querySelector('[data-slider-09-cart-label]');
      const feedback = form.parentElement?.querySelector('[data-slider-09-cart-feedback]');
      if (!button || !label) return;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (button.disabled) return;
        const defaultLabel = button.dataset.defaultLabel || label.textContent.trim();
        button.dataset.defaultLabel = defaultLabel;
        button.disabled = true;
        button.dataset.state = 'loading';
        label.textContent = 'Adding...';
        if (feedback) { feedback.textContent = ''; feedback.dataset.state = ''; }
        try {
          const rootPath = window.Shopify?.routes?.root || '/';
          const action = form.getAttribute('action') || rootPath + 'cart/add';
          const cartAddUrl = action.replace(/\.js$/, '') + '.js';
          const response = await fetch(cartAddUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams(new FormData(form))
          });
          if (!response.ok) {
            let errorMessage = 'Unable to add this product to cart.';
            try { const d = await response.json(); errorMessage = d.description || d.message || errorMessage; } catch (e) {}
            throw new Error(errorMessage);
          }
          const addedItem = await response.json();
          button.dataset.state = 'added';
          label.textContent = 'Added';
          if (feedback) { feedback.textContent = 'Added to cart.'; feedback.dataset.state = 'success'; }
          document.dispatchEvent(new CustomEvent('slider09:cart:updated', { detail: { item: addedItem } }));
        } catch (error) {
          button.dataset.state = 'error';
          label.textContent = 'Try again';
          if (feedback) { feedback.textContent = error.message || 'Unable to add this product to cart.'; feedback.dataset.state = 'error'; }
        }
        window.setTimeout(() => {
          if (!root.isConnected) return;
          button.disabled = false;
          button.dataset.state = '';
          label.textContent = button.dataset.defaultLabel || 'Add to cart';
          if (feedback) { feedback.textContent = ''; feedback.dataset.state = ''; }
        }, 1600);
      });
    });

    root.dataset.slider09Ready = 'true';
  }

  function initAll() {
    document.querySelectorAll('.slider-09-root').forEach(initSlider09);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
