(function(){
  document.querySelectorAll('.shv-slider-wrapper').forEach(function(w){
    var sectionId = w.id.replace('shv-carousel-', '');

    (function(){
      var nextDom = w.querySelector('.shv-nav-next');
      var prevDom = w.querySelector('.shv-nav-prev');
      var S = w.querySelector('.shv-slider-track');
      var T = w.querySelector('.shv-slider-thumbs');
      var ti = T.querySelectorAll('.shv-slide');
      var tR = 920;
      var tA = 7000;
      var rTO;
      var rNA;
      var isAnimating = false;

      function getRect(element) {
        return element ? element.getBoundingClientRect() : null;
      }

      function setImageGeometry(prefix, slide) {
        var image = slide ? slide.querySelector('img') : null;
        var imageRect = getRect(image || slide);
        var trackRect = getRect(S);

        if (!imageRect || !trackRect) {
          return;
        }

        w.style.setProperty('--shv-' + prefix + '-left', (imageRect.left - trackRect.left) + 'px');
        w.style.setProperty('--shv-' + prefix + '-top', (imageRect.top - trackRect.top) + 'px');
        w.style.setProperty('--shv-' + prefix + '-width', imageRect.width + 'px');
        w.style.setProperty('--shv-' + prefix + '-height', imageRect.height + 'px');
        w.style.setProperty('--shv-' + prefix + '-transform', 'translate3d(0,0,0)');
      }

      if (ti.length > 0) {
        T.appendChild(ti[0]);
      }

      function queueAutoplay() {
        clearTimeout(rNA);
        rNA = setTimeout(function(){
          if (nextDom) {
            nextDom.click();
          }
        }, tA);
      }

      function show(type) {
        if (isAnimating) {
          return;
        }

        var si = S.querySelectorAll('.shv-slide');
        var thumbSlides = w.querySelectorAll('.shv-slider-thumbs .shv-slide');
        isAnimating = true;
        w.classList.remove('next');
        w.classList.remove('prev');

        if (type === 'next') {
          setImageGeometry('next-from', thumbSlides[0]);
          S.appendChild(si[0]);
          T.appendChild(thumbSlides[0]);
        } else {
          S.prepend(si[si.length - 1]);
          T.prepend(thumbSlides[thumbSlides.length - 1]);
          setImageGeometry('prev-target', T.querySelector('.shv-slide'));
        }

        window.requestAnimationFrame(function(){
          w.classList.add(type);
        });

        clearTimeout(rTO);
        rTO = setTimeout(function(){
          w.classList.remove('next');
          w.classList.remove('prev');
          isAnimating = false;
        }, tR);

        queueAutoplay();
      }

      queueAutoplay();

      if (nextDom) {
        nextDom.onclick = function(){ show('next'); };
      }

      if (prevDom) {
        prevDom.onclick = function(){ show('prev'); };
      }

      window['submitAddToCartForm_' + sectionId] = function(form){
        var cartAddUrl = form.getAttribute('action') || '/cart/add';
        var submitButton = form.querySelector('.shv-add-to-cart-btn');
        var submitLabel = submitButton ? submitButton.querySelector('.hide-on-mobile') : null;
        var feedback = form.parentElement ? form.parentElement.querySelector('[data-shv-cart-feedback]') : null;
        var defaultLabel = submitLabel ? submitLabel.textContent : '';

        if (submitButton && submitButton.disabled) {
          return;
        }

        if (submitButton) {
          submitButton.disabled = true;
        }

        if (submitLabel) {
          submitLabel.textContent = 'Adding...';
        }

        if (feedback) {
          feedback.textContent = '';
          feedback.dataset.state = '';
        }

        fetch(cartAddUrl + '.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: new URLSearchParams(new FormData(form))
        })
          .then(function(r){
            if (!r.ok) {
              return r.json().then(function(data){
                throw new Error(data.description || data.message || 'Unable to add this product to cart.');
              });
            }

            return r.json();
          })
          .then(function(){
            if (feedback) {
              feedback.textContent = 'Added to cart.';
              feedback.dataset.state = 'success';
            }

            if (submitLabel) {
              submitLabel.textContent = 'Added';
            }
          })
          .catch(function(e){
            if (feedback) {
              feedback.textContent = e.message || 'Unable to add this product to cart.';
              feedback.dataset.state = 'error';
            }

            if (submitLabel) {
              submitLabel.textContent = 'Try Again';
            }
          })
          .finally(function(){
            setTimeout(function(){
              if (!w.isConnected) return;

              if (submitButton) {
                submitButton.disabled = false;
              }

              if (submitLabel) {
                submitLabel.textContent = defaultLabel || 'Add to Cart';
              }

              if (feedback) {
                feedback.textContent = '';
                feedback.dataset.state = '';
              }
            }, 1800);
          });
      };
    })();
  });
})();
