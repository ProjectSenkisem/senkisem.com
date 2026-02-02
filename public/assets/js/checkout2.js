document.addEventListener('DOMContentLoaded', () => {
    const cartItemsContainer = document.getElementById('cart-items');
    const totalPriceElement = document.getElementById('total-price');
    const shippingFeeElement = document.getElementById('shipping-fee'); // Elem a szállítási díjhoz
    const checkoutForm = document.getElementById('checkout-form'); // A form ID-je a HTML-ben

    let cart = [];
    let totalPrice = 0;
    // Az e-könyv checkout oldalon a szállítási díj mindig 0 Ft
    const shippingCost = 0; 

    // 1. Kosár betöltése a localStorage-ból
    try {
        const storedCart = localStorage.getItem('cart');
        if (storedCart) {
            cart = JSON.parse(storedCart);
            console.log('Kosár betöltve a LocalStorage-ból:', cart);
        } else {
            console.log('A kosár üres a LocalStorage-ban.');
        }
    } catch (e) {
        console.error('Hiba a kosár betöltésekor a LocalStorage-ból:', e);
        // Hiba esetén üres kosarat mutathatunk
        cart = []; 
    }

    // 2. Kosár tartalmának megjelenítése és végösszeg kalkulálása
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = "<p>A kosarad üres. Kérjük, térj vissza a <a href='index.html'>főoldalra</a>.</p>";
        shippingFeeElement.textContent = '0 Ft (Digitális termék)'; // Üres kosár esetén is kiírjuk
        totalPriceElement.textContent = "0 Ft";
        // Letiltjuk a megrendelés gombot, ha a kosár üres
        if (checkoutForm.querySelector('.btn')) {
            checkoutForm.querySelector('.btn').disabled = true; 
        }
        return; // Kilépünk, nincs mit tovább feldolgozni
    }

    cart.forEach(item => {
        const itemElement = document.createElement('div');
        // Ezt a class nevet használtuk a CSS-ben is, hogy a stílusok alkalmazva legyenek
        itemElement.classList.add('item'); 
        
        // A HTML struktúra, ami illeszkedik a checkout.css-ben definiált `.item` és `.item img`, `.item-details` szabályokhoz
        itemElement.innerHTML = `
            <img src="${item.image}" alt="${item.name}">
            <div class="item-details">
                <p class="item-name"><strong>${item.name}</strong></p>
                <p class="item-price">${item.price}</p>
            </div>
        `;
        cartItemsContainer.appendChild(itemElement);

        // Az ár számmá konvertálása az összeg kalkulálásához
        // Eltávolítja az összes nem számjegyet a stringből, kivéve a tizedesvesszőt/pontot, majd int-é alakítja.
        // Mivel "Ft" van a végén, a replace(/\D/g, '') jó választás.
        const numericPrice = parseInt(item.price.replace(/\D/g, '')) || 0; 
        totalPrice += numericPrice;
    });

    // Szállítási díj megjelenítése (mindig 0 Ft ezen az oldalon, mert e-könyv)
    shippingFeeElement.textContent = `${shippingCost.toLocaleString('hu-HU')} Ft (Digitális termék)`;
    
    // Végösszeg megjelenítése (csak a termék ára, mert a szállítás 0)
    totalPriceElement.textContent = `${totalPrice.toLocaleString('hu-HU')} Ft`;


    // 3. Fizetési kérés eseménykezelője (form submit)
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Megakadályozzuk az alapértelmezett form elküldést

        // Vásárlói adatok begyűjtése a formról
        const formData = new FormData(checkoutForm);
        const customerData = {
            fullName: formData.get('fullName'),
            email: formData.get('email'),
            // Ezek a mezők e-könyv esetén nem feltétlenül kötelezőek, 
            // de ha a HTML-ben szerepelnek, érdemes beküldeni őket
            address: formData.get('address'), 
            city: formData.get('city'),
            country: formData.get('country'),
            zip: formData.get('zip'),
        };

        // Alapvető adatok ellenőrzése
        if (!customerData.fullName || !customerData.email) {
            alert('Kérjük, töltse ki a teljes nevét és az e-mail címét!');
            return; // Megállítjuk a folyamatot, ha hiányoznak az adatok
        }

        // A kosár tartalmának előkészítése a backend számára
        // Fontos, hogy az árat számmá konvertáljuk, mielőtt elküldjük!
        const cartForPayment = cart.map(item => ({
            id: item.id, 
            name: item.name,
            price: parseInt(item.price.replace(/\D/g, '')), 
            image: item.image // Kép URL (opcionális a backendnek, de küldhetjük)
        }));

        try {
            // Kérés küldése a backend '/create-payment-session' végpontjára
            const response = await fetch('https://senkisem.onrender.com/create-payment-session', { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    cart: cartForPayment,
                    customerData: customerData
                })
            });

            const data = await response.json(); // Válasz feldolgozása

            if (response.ok && data.payment_url) {
                // Sikeres válasz esetén átirányítás a Stripe fizetési oldalra
                window.location.href = data.payment_url;
                // Sikeres fizetés után érdemes lehet törölni a kosarat a localStorage-ból
                localStorage.removeItem('cart');
            } else {
                // Hiba esetén értesítés a felhasználónak és logolás
                console.error('Hiba a fizetési session létrehozásakor:', data.error);
                alert(`Hiba történt a fizetési oldal létrehozásakor: ${data.error || 'Ismeretlen hiba'}. Kérjük, próbálja újra!`);
            }
        } catch (error) {
            // Hálózati vagy egyéb technikai hiba kezelése
            console.error('Hálózati vagy egyéb hiba a fizetés indításakor:', error);
            alert('Hálózati hiba történt a fizetés indításakor. Kérjük, ellenőrizze az internetkapcsolatot, és próbálja újra!');
        }
    });
});