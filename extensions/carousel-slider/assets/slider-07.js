(function(){
  function closeDisplay(root){
    var panel=root.querySelector('.active-product-display');
    if(!panel)return;
    panel.classList.remove('show');
    var banner=panel.closest('.banner');
    if(banner)banner.classList.remove('ring-display-open');
  }
  function updateDisplay(root,item){
    var imgSrc=item.getAttribute('data-image');
    var title=item.getAttribute('data-title');
    var price=item.getAttribute('data-price');
    var variantId=item.getAttribute('data-id');
    var available=item.getAttribute('data-available')==='true';
    var displayImg=root.querySelector('.active-product-display img');
    var displayTitle=root.querySelector('.product-info-panel h2');
    var displayPrice=root.querySelector('.product-info-panel p');
    var displayId=root.querySelector('.active-product-form input[name="id"]');
    var displayPanel=root.querySelector('.active-product-display');
    var displayButton=root.querySelector('.active-product-form .btn');
    var displayFeedback=root.querySelector('.add-to-cart-feedback');
    if(displayImg)displayImg.src=imgSrc;
    if(displayTitle)displayTitle.textContent=title;
    if(displayPrice)displayPrice.textContent=price;
    if(displayId)displayId.value=variantId;
    if(displayButton){
      displayButton.disabled=!available;
      displayButton.textContent=available?'Add to Cart':'Sold Out';
    }
    if(displayFeedback)displayFeedback.textContent='';
    if(displayPanel){
      displayPanel.classList.add('show');
      var banner=displayPanel.closest('.banner');
      if(banner)banner.classList.add('ring-display-open');
      displayPanel.style.transform='scale(0.95)';
      setTimeout(function(){
        displayPanel.style.transform='scale(1)';
        displayPanel.style.transition='transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      },50);
    }
  }
  function submitAddToCart(event,root,form){
    event.preventDefault();
    var button=form.querySelector('.btn');
    var feedback=root.querySelector('.add-to-cart-feedback');
    var originalLabel=button?button.textContent:'';
    var cartAddUrl=(form.getAttribute('action')||'/cart/add')+'.js';
    if(button&&button.disabled)return false;
    if(button){
      button.disabled=true;
      button.textContent='Adding...';
    }
    if(feedback)feedback.textContent='';
    fetch(cartAddUrl,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
      body:new URLSearchParams(new FormData(form))
    }).then(function(response){
      if(!response.ok){
        return response.json().then(function(data){
          throw new Error(data.description||data.message||'Unable to add this product to cart.');
        });
      }
      return response.json();
    }).then(function(){
      if(feedback)feedback.textContent='Added to cart.';
    }).catch(function(error){
      if(feedback)feedback.textContent=error.message||'Unable to add this product to cart.';
    }).finally(function(){
      if(button){
        button.disabled=false;
        button.textContent=originalLabel||'Add to Cart';
      }
    });
    return false;
  }
  function init(root){
    if(root.dataset.slider07Ready==='true')return;
    root.addEventListener('click',function(event){
      var closeButton=event.target.closest('.close-display-btn');
      if(closeButton&&root.contains(closeButton)){
        closeDisplay(root);
        return;
      }
      var item=event.target.closest('.banner .slider .item');
      if(item&&root.contains(item))updateDisplay(root,item);
    });
    root.addEventListener('submit',function(event){
      var form=event.target.closest('.active-product-form');
      if(form&&root.contains(form))submitAddToCart(event,root,form);
    });
    root.dataset.slider07Ready='true';
  }
  function initAll(){
    document.querySelectorAll('.slider-07-root').forEach(init);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initAll);
  }else{
    initAll();
  }
  document.addEventListener('shopify:section:load',initAll);
})();
