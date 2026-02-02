document.addEventListener('DOMContentLoaded', () => {
    const cartItemsContainer = document.getElementById('cart-items');
    const totalPriceElement = document.getElementById('total-price');
    const shippingFeeElement = document.getElementById('shipping-fee'); // Hivatkozás a szállítási díj div-re
    const checkoutForm = document.querySelector('form'); // Hivatkozás a formra

    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    let total = 0;
    const physicalShippingCost = 2950; // Szállítási díj fizikai termékekhez

    // E-könyv ID-je
    const ebookId = 2; 

    // Ellenőrizzük, hogy csak az e-könyv van-e a kosárban
    // (Bár ezen az oldalon ez nem kellene, hogy előforduljon, biztonság kedvéért meghagyjuk.)
    const isOnlyEbookInCart = cart.length === 1 && cart[0].id === ebookId;

    // Kosár megjelenítése és összegzés
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = "<p>A kosarad üres. Kérlek, térj vissza a <a href='/webshop.html'>webshopba</a>.</p>";
        shippingFeeElement.textContent = '0 Ft'; // Ha üres a kosár, nincs szállítás
        totalPriceElement.textContent = "0 Ft";
        checkoutForm.querySelector('.btn').disabled = true;
        return;
    } else {
        cart.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.classList.add('checkout-item');
            itemElement.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 10px;">
                    <img src="${item.image}" alt="${item.name}" style="width: 60px; height: auto; margin-right: 10px;">
                    <div>
                        <div><strong>${item.name}</strong></div>
                        <div>${item.price}</div>
                        ${item.id !== ebookId ? `
                            <label for="size-${item.id}">Méret:</label>
                            <select id="size-${item.id}" class="size-select" data-id="${item.id}">
                                <option value="">Válassz méretet</option>
                                <option value="S">S</option>
                                <option value="M">M</option>
                                <option value="L">L</option>
                                <option value="XL">XL</option>
                            </select>
                        ` : '<p>Digitális termék</p>'}
                    </div>
                </div>
            `;
            cartItemsContainer.appendChild(itemElement);

            const numericPrice = parseInt(item.price.replace(/\D/g, '')) || 0;
            total += numericPrice;
        });

        // Szállítási díj hozzáadása feltételesen
        if (!isOnlyEbookInCart) { // Ha nem csak e-könyv van, akkor adjuk hozzá
            total += physicalShippingCost;
            shippingFeeElement.textContent = `${physicalShippingCost.toLocaleString('hu-HU')} Ft`;
        } else {
            shippingFeeElement.textContent = '0 Ft (Digitális termék)'; // Ha mégis csak e-könyv, akkor 0
        }
        
        totalPriceElement.textContent = `${total.toLocaleString('hu-HU')} Ft`;
    }

    // Fizetés indítása
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Méretválasztás ellenőrzése csak fizikai termékek esetén
        const sizeSelects = document.querySelectorAll('.size-select');
        const sizeMap = {};
        let allSizesSelected = true;

        // Csak akkor ellenőrizzük a méreteket, ha vannak fizikai termékek a kosárban
        const hasPhysicalProducts = cart.some(item => item.id !== ebookId);

        if (hasPhysicalProducts) {
            sizeSelects.forEach(select => {
                const value = select.value;
                const id = select.dataset.id;
                if (!value) {
                    allSizesSelected = false;
                    select.style.border = "2px solid red";
                } else {
                    select.style.border = "";
                    sizeMap[id] = value;
                }
            });

            if (!allSizesSelected) {
                alert("Kérlek, válaszd ki minden fizikai termékhez a megfelelő méretet a folytatáshoz.");
                return;
            }
        }

        const form = e.target;
        const customerData = {
            fullName: form.fullName.value,
            email: form.email.value,
            address: form.address.value,
            city: form.city.value,
            country: form.country.value,
            zip: form.zip.value,
        };
        
        // Ellenőrizzük az alapvető mezőket
        if (!customerData.fullName || !customerData.email || !customerData.address || !customerData.city || !customerData.country || !customerData.zip) {
            alert("Kérjük, töltse ki az összes kötelező mezőt (név, email, cím, város, ország, irányítószám).");
            return;
        }

        // Méret hozzáfűzése a cart-hoz (csak a fizikai termékekhez)
        const cartForPayment = cart.map(item => {
            if (item.id !== ebookId) { // Csak fizikai termékeknél adunk hozzá méretet
                return {
                    ...item,
                    size: sizeMap[item.id] || null // Ha nincs kiválasztva méret, akkor null
                };
            }
            return item; // E-könyvet változatlanul hagyjuk
        });

        try {
            const response = await fetch('https://senkisem.onrender.com/create-payment-session', { // Fontos, hogy a teljes URL legyen itt, ha nem azonos originről hívod
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    cart: cartForPayment,
                    customerData: customerData
                })
            });

            const data = await response.json();

            if (response.ok && data.payment_url) {
                window.location.href = data.payment_url;
            } else {
                console.error('Hiba a fizetési oldal létrehozásakor:', data.error);
                alert(`Hiba történt a fizetési oldal létrehozásakor: ${data.error || 'Ismeretlen hiba'}. Kérjük, próbáld újra!`);
            }
        } catch (error) {
            console.error('Hálózati hiba a fizetés indításakor:', error);
            alert('Hálózati hiba történt a fizetés indításakor. Kérjük, ellenőrizze az internetkapcsolatot, és próbálja újra!');
        }
    });
});