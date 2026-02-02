document.addEventListener('DOMContentLoaded', () => {
  const cartIcon = document.getElementById('cart-icon');
  const wishlistIcon = document.getElementById('wishlist-icon');
  const cartSidebar = document.getElementById('cart-sidebar');
  const wishlistSidebar = document.getElementById('wishlist-sidebar');
  const closeButtons = document.querySelectorAll(".close-btn");

  const cartCount = document.createElement('span');
  const wishlistCount = document.createElement('span');

  cartCount.classList.add('nav__count');
  wishlistCount.classList.add('nav__count');

  cartIcon.appendChild(cartCount);
  wishlistIcon.appendChild(wishlistCount);

  let currentCart = [];

  const updateCounts = () => {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];

    cartCount.textContent = cart.length;
    wishlistCount.textContent = wishlist.length;
  };

  const loadItemsToSidebar = (key, listId) => {
    const items = JSON.parse(localStorage.getItem(key)) || [];
    const list = document.getElementById(listId);
    list.innerHTML = '';

    let totalPrice = 0;
    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.classList.add('sidebar__item');
      li.innerHTML = `
        <img src="${item.image}" alt="${item.name}" class="sidebar__img">
        <div class="sidebar__details">
          <span class="sidebar__name">${item.name}</span>
          <span class="sidebar__price">${item.price}</span>
          <button class="remove-btn" data-key="${key}" data-index="${index}" data-list="${listId}">Eltávolítás</button>
        </div>
      `;
      list.appendChild(li);

      const numericPrice = parseInt(item.price.replace(/\D/g, ''));
      totalPrice += numericPrice;
    });

    const sidebar = list.closest('.sidebar');
    const totalPriceElement = sidebar.querySelector('#total-price');
    if (totalPriceElement) {
      totalPriceElement.textContent = `${totalPrice.toLocaleString()} Ft`;
    }

    const checkoutButton = sidebar.querySelector('#cart-checkout-btn');
    if (checkoutButton) {
      checkoutButton.classList.toggle('hidden', items.length === 0);
    }

    // Mentjük a kosár aktuális állapotát a fizetéshez
    if (key === 'cart') {
      currentCart = items;
    }
  };

  const addToStorage = (key, product) => {
    const items = JSON.parse(localStorage.getItem(key)) || [];
    items.push(product);
    localStorage.setItem(key, JSON.stringify(items));
    updateCounts();

    if (key === 'cart' && cartSidebar.classList.contains('active')) {
      loadItemsToSidebar('cart', 'cart-list');
    }
    if (key === 'wishlist' && wishlistSidebar.classList.contains('active')) {
      loadItemsToSidebar('wishlist', 'wishlist-list');
    }
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-cart')) {
      const productElement = e.target.closest('.home__article');
      const product = {
        id: productElement.dataset.id,
        name: productElement.querySelector('.home__product').textContent,
        price: productElement.querySelector('.home__price').textContent,
        image: productElement.querySelector('.home__img').src
      };
      addToStorage('cart', product);
    }

    if (e.target.closest('.btn-fav')) {
      const productElement = e.target.closest('.home__article');
      const product = {
        id: productElement.dataset.id,
        name: productElement.querySelector('.home__product').textContent,
        price: productElement.querySelector('.home__price').textContent,
        image: productElement.querySelector('.home__img').src
      };
      addToStorage('wishlist', product);
    }

    if (e.target.classList.contains('remove-btn')) {
      const key = e.target.dataset.key;
      const index = parseInt(e.target.dataset.index);
      const listId = e.target.dataset.list;

      const items = JSON.parse(localStorage.getItem(key)) || [];
      items.splice(index, 1);
      localStorage.setItem(key, JSON.stringify(items));

      loadItemsToSidebar(key, listId);
      updateCounts();
    }
  });

  cartIcon.addEventListener("click", () => {
    loadItemsToSidebar('cart', 'cart-list');
    cartSidebar.classList.add('active');
  });

  wishlistIcon.addEventListener("click", () => {
    loadItemsToSidebar('wishlist', 'wishlist-list');
    wishlistSidebar.classList.add('active');
  });

  closeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.close).classList.remove('active');
    });
  });

  updateCounts();

  // CHECKOUT logika itt:
  document.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();

    e.preventDefault();

    const sizeSelects = document.querySelectorAll('.size-select');
    const sizeMap = {};
    let allSizesSelected = true;
  
    sizeSelects.forEach(select => {
      const value = select.value;
      const id = select.dataset.id;
  
      if (!value) {
        allSizesSelected = false;
        select.style.border = "2px solid red";
      } else {
        select.style.border = ""; // visszaállítás
        sizeMap[id] = value;
      }
    });
  
    if (!allSizesSelected) {
      alert("Kérlek válaszd ki minden termék méretét!");
      return;
    }
  
    // Hozzáadjuk a kiválasztott méreteket a kosár elemeihez
    const cartWithSizes = currentCart.map(item => ({
      ...item,
      size: sizeMap[item.id]
    }));
  
    const name = document.querySelector('input[placeholder="Teljes Név"]').value;
    const email = document.querySelector('input[placeholder="email@email.com"]').value;
    const address = document.querySelector('input[placeholder="Utca, Házszám (épület, emelet, ajtó)"]').value;
    const city = document.querySelector('input[placeholder="Város"]').value;
    const country = document.querySelector('input[placeholder="Magyarország"]').value;
    const postalCode = document.querySelector('input[placeholder="1234"]').value;
  
    try {
      const response = await fetch('/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cart: cartWithSizes,
          shipping: { name, email, address, city, country, postalCode }
        })
      });
  
      const data = await response.json();
  
      if (data.success) {
        alert('Köszönjük a rendelést! Hamarosan értesítünk.');
        window.location.href = '/success.html';
      } else {
        alert('Hiba történt a rendelés során.');
      }
    } catch (error) {
      console.error(error);
      alert('Hiba történt a rendelés során.');
    }
  });
  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const response = await fetch('/create-payment-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ cart: currentCart })
        });

        const data = await response.json();
        if (data.payment_url) {
          window.location.href = data.payment_url;
        } else {
          alert('Hiba történt a fizetési oldal létrehozásakor.');
        }
      } catch (error) {
        console.error(error);
        alert('Hiba történt a fizetés indításakor.');
      }
    });
  }
});
