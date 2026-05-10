(function() {
  function initCarousel(carouselWrapper) {
    if (!carouselWrapper || carouselWrapper.dataset.shvMainInitialized === "true") return;

    const sectionId = carouselWrapper.dataset.sectionId;
    const nextDom = carouselWrapper.querySelector(".shv-nav-next");
    const prevDom = carouselWrapper.querySelector(".shv-nav-prev");
    const sliderDom = carouselWrapper.querySelector(".shv-slider-track");
    const thumbnailBorderDom = carouselWrapper.querySelector(".shv-slider-thumbs");

    if (!sectionId || !sliderDom || !thumbnailBorderDom) return;

    carouselWrapper.dataset.shvMainInitialized = "true";

    let thumbnailItemsDom = thumbnailBorderDom.querySelectorAll(".shv-slide");
    if (thumbnailItemsDom.length > 0) {
      thumbnailBorderDom.appendChild(thumbnailItemsDom[0]);
    }

    const timeRunning = 3000;
    const timeAutoNext = 7000;
    let runTimeOut;
    let runNextAuto;

    function queueAutoNext() {
      clearTimeout(runNextAuto);
      runNextAuto = setTimeout(function() {
        if (nextDom) nextDom.click();
      }, timeAutoNext);
    }

    function showSlider(type) {
      const sliderItemsDom = sliderDom.querySelectorAll(".shv-slide");
      const thumbnailItems = carouselWrapper.querySelectorAll(".shv-slider-thumbs .shv-slide");

      if (!sliderItemsDom.length || !thumbnailItems.length) return;

      if (type === "next") {
        sliderDom.appendChild(sliderItemsDom[0]);
        thumbnailBorderDom.appendChild(thumbnailItems[0]);
        carouselWrapper.classList.add("next");
      } else {
        sliderDom.prepend(sliderItemsDom[sliderItemsDom.length - 1]);
        thumbnailBorderDom.prepend(thumbnailItems[thumbnailItems.length - 1]);
        carouselWrapper.classList.add("prev");
      }

      clearTimeout(runTimeOut);
      runTimeOut = setTimeout(function() {
        carouselWrapper.classList.remove("next");
        carouselWrapper.classList.remove("prev");
      }, timeRunning);

      queueAutoNext();
    }

    if (nextDom) {
      nextDom.addEventListener("click", function() {
        showSlider("next");
      });
    }

    if (prevDom) {
      prevDom.addEventListener("click", function() {
        showSlider("prev");
      });
    }

    window["submitAddToCartForm_" + sectionId] = function(form) {
      fetch("/cart/add.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(new FormData(form))
      })
        .then(function(response) {
          return response.json();
        })
        .then(function(data) {
          console.log("Product added to cart:", data);
        })
        .catch(function(error) {
          console.error("Error adding to cart:", error);
        });
    };

    queueAutoNext();
  }

  function initAll(scope) {
    const root = scope || document;
    if (root.matches && root.matches("[data-shv-main-slider]")) {
      initCarousel(root);
    }

    root.querySelectorAll("[data-shv-main-slider]").forEach(initCarousel);
  }

  initAll(document);

  document.addEventListener("shopify:section:load", function(event) {
    initAll(event.target);
  });
})();
