// متغيرات عامة
let cart = [];
let user = null;
let deferredPrompt;
let adminPhoneNumber = ""; 
let sliderInterval; 
let isMerchant = false;
let merchantDiscount = 0;

const firebaseConfig = {
    apiKey: "AIzaSyDX0esBRiQ4MuyvWH_s2UZ2kJpA9GryDgE",
    authDomain: "tttttt-48c2e.firebaseapp.com",
    databaseURL: "https://tttttt-48c2e-default-rtdb.firebaseio.com",
    projectId: "tttttt-48c2e",
    storageBucket: "tttttt-48c2e.firebasestorage.app",
    messagingSenderId: "982883301644",
    appId: "1:982883301644:web:7b1676215cb4f0fe7c7129",
    measurementId: "G-QLCYC16T20"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

document.addEventListener('DOMContentLoaded', () => {
    
    // التحقق من حالة تسجيل الدخول
    auth.onAuthStateChanged(firebaseUser => {
        if (firebaseUser) {
            user = { 
                name: firebaseUser.displayName || "مستخدم", 
                email: firebaseUser.email, 
                avatar: firebaseUser.photoURL || "https://via.placeholder.com/80" 
            };
            checkMerchantStatus(user.email);
            updateProfileUI();
        } else {
            user = null;
            isMerchant = false;
            updateProfileUI();
        }
    });

    // 1. جلب إعدادات المتجر ونسبة الخصم
    db.ref('settings').on('value', snapshot => {
        const s = snapshot.val();
        if(s) {
            if(s.storeName) {
                const formattedName = `<span class="store-text" style="color:#fff">${s.storeName.charAt(0)}</span>${s.storeName.substring(1)}`;
                const headerDisplay = document.getElementById('store-name-display');
                if(headerDisplay) headerDisplay.innerHTML = formattedName;
                const splashTitle = document.getElementById('splash-title');
                if(splashTitle) splashTitle.innerText = s.storeName;
            }
            if(s.whatsapp) adminPhoneNumber = s.whatsapp;
            if(s.merchantDiscount) {
                merchantDiscount = parseInt(s.merchantDiscount) || 0;
                renderProducts(); // إعادة رسم المنتجات عند تغير الخصم
            }
        }
    });

    // 2. جلب الفئات
    db.ref('categories').on('value', snapshot => {
        const catContainer = document.getElementById('dynamic-categories');
        const data = snapshot.val();
        catContainer.innerHTML = `<div class="category-item" onclick="filterProducts('all')"><div class="cat-box active"><div class="square-icon"></div></div><span class="cat-name">الكل</span></div>`;
        if(data) {
            Object.values(data).forEach(cat => {
                catContainer.innerHTML += `
                <div class="category-item" onclick="filterProducts('${cat.id}')">
                    <div class="cat-box"><img src="${cat.image}" class="cat-img"></div>
                    <span class="cat-name">${cat.name}</span>
                </div>`;
            });
        }
    });

    // 3. السلايدر
    db.ref('banners').on('value', snapshot => {
        const slider = document.getElementById('dynamic-slider');
        const data = snapshot.val();
        slider.innerHTML = "";
        if(sliderInterval) clearInterval(sliderInterval);
        if(data) {
            const banners = Object.values(data);
            banners.forEach(b => { slider.innerHTML += `<img src="${b.image}" alt="${b.title || 'Offer'}">`; });
            let currentIndex = 0;
            const totalSlides = banners.length;
            if(totalSlides > 1) {
                sliderInterval = setInterval(() => {
                    currentIndex = (currentIndex + 1) % totalSlides;
                    slider.style.transform = `translateX(-${currentIndex * 100}%)`;
                }, 3000);
            }
        } else {
            slider.innerHTML = '<img src="https://via.placeholder.com/800x450?text=Welcome" style="width:100%; height:100%; object-fit:cover">';
        }
    });

    // إخفاء شاشة التحميل
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        splash.style.opacity = '0';
        setTimeout(() => splash.style.display = 'none', 500);
        
        // التوجيه: إذا لم يسجل الدخول، اذهب لصفحة الدخول
        auth.onAuthStateChanged(u => {
            if(!u && !sessionStorage.getItem('guestMode')) {
                showPage('login-page');
            }
        });
    }, 2000);

    // PWA Logic
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.getElementById('install-banner').style.display = 'flex'; });
    document.getElementById('install-btn').addEventListener('click', async () => {
        if(deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; document.getElementById('install-banner').style.display = 'none'; }
    });
    document.getElementById('close-install').addEventListener('click', () => document.getElementById('install-banner').style.display = 'none');
    
    // جلب المنتجات (تخزينها في متغير global لإعادة استخدامها)
    window.allProductsData = {};
    db.ref('products').on('value', (snapshot) => {
        window.allProductsData = snapshot.val() || {};
        renderProducts();
    });
});

// دالة رسم المنتجات (منفصلة لكي يتم استدعاؤها عند تغير حالة التاجر)
function renderProducts() {
    const container = document.getElementById('products-container');
    container.innerHTML = "";
    if (!window.allProductsData || Object.keys(window.allProductsData).length === 0) { 
        container.innerHTML = "<p style='width:200%; text-align:center;'>لا توجد منتجات</p>"; 
        return; 
    }
    
    const products = Object.keys(window.allProductsData).map(key => ({ id: key, ...window.allProductsData[key] })).reverse();
    
    products.forEach(prod => {
        const safeTitle = prod.title ? prod.title.replace(/'/g, "&apos;") : "";
        const safeDesc = prod.description ? prod.description.replace(/'/g, "&apos;").replace(/\n/g, "<br>") : "";
        
        // حساب السعر (للتاجر أو العادي)
        let finalPrice = prod.price;
        let priceHTML = `<span class="price">${Number(prod.price).toLocaleString()} د.ع</span>`;
        
        if (isMerchant && merchantDiscount > 0) {
            finalPrice = prod.price - (prod.price * (merchantDiscount / 100));
            priceHTML = `
                <span class="price">${Number(finalPrice).toLocaleString()} د.ع</span>
                <span class="old-price">${Number(prod.price).toLocaleString()}</span>
            `;
        }

        const card = `
        <div class="product-card" data-category="${prod.category || 'general'}" onclick="openProductPage('${prod.id}', '${safeTitle}', ${prod.price}, ${finalPrice}, '${prod.image}', '${safeDesc}')">
            <span class="discount-badge">جديد</span>
            <img src="${prod.image}" class="prod-img" loading="lazy">
            <div class="prod-details">
                <div class="prod-title">${prod.title}</div>
                <div class="price-row">
                    <div style="display:flex; align-items:center;">${priceHTML}</div>
                    <button class="add-cart-btn"><i class="fa-solid fa-plus"></i></button>
                </div>
            </div>
        </div>`;
        container.innerHTML += card;
    });
}

// التحقق من التاجر
function checkMerchantStatus(email) {
    if(!email) return;
    db.ref('merchants').once('value').then(snapshot => {
        const merchants = snapshot.val();
        isMerchant = false;
        if(merchants) {
            Object.values(merchants).forEach(m => {
                if(m.email && m.email.toLowerCase() === email.toLowerCase()) {
                    isMerchant = true;
                }
            });
        }
        renderProducts(); // إعادة رسم المنتجات بالأسعار الجديدة
    });
}

// التنقل والصفحات
window.showPage = function(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active-page'));
    document.getElementById(pageId).classList.add('active-page');
    window.scrollTo(0,0);
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if(pageId === 'home-page') document.querySelector('.nav-item:nth-child(1)').classList.add('active');
    if(pageId === 'cart-page') document.querySelector('.nav-item:nth-child(2)').classList.add('active');
    if(pageId === 'profile-page') document.querySelector('.nav-item:nth-child(3)').classList.add('active');
}
window.goBack = function() { showPage('home-page'); }

// التفاصيل والسلة (تم التعديل لاستقبال السعر النهائي)
window.openProductPage = function(id, title, originalPrice, finalPrice, img, desc) {
    document.getElementById('detail-title').innerText = title;
    
    // عرض السعر في التفاصيل
    const priceEl = document.getElementById('detail-price');
    if (originalPrice !== finalPrice) {
        priceEl.innerHTML = `<span style="color:#d32f2f; font-weight:bold; font-size:18px;">${Number(finalPrice).toLocaleString()} د.ع</span> <span style="text-decoration:line-through; color:#999; font-size:14px;">${Number(originalPrice).toLocaleString()}</span>`;
    } else {
        priceEl.innerText = Number(finalPrice).toLocaleString() + " د.ع";
    }

    document.getElementById('detail-img').src = img;
    document.querySelector('.detail-desc p').innerHTML = desc || "لا يوجد وصف";
    
    // حفظ السعر الحالي لإضافته للسلة
    document.getElementById('detail-price').dataset.currentPrice = finalPrice;
    
    showPage('product-page');
}

window.addToCartFromDetail = function() {
    const title = document.getElementById('detail-title').innerText;
    const price = parseInt(document.getElementById('detail-price').dataset.currentPrice);
    const img = document.getElementById('detail-img').src;
    addToCart(title, price, img);
    goBack();
}
window.addToCart = function(title, price, img) {
    cart.push({ title, price, img });
    updateCartUI();
    showToast("تمت الإضافة للسلة!");
}
function updateCartUI() {
    document.getElementById('cart-count').innerText = cart.length;
    const list = document.getElementById('cart-items-list');
    const totalEl = document.getElementById('cart-total-price');
    if(cart.length === 0) { list.innerHTML = '<div class="empty-cart-msg">السلة فارغة</div>'; totalEl.innerText = "0 د.ع"; return; }
    let html = '', total = 0;
    cart.forEach((item, index) => {
        total += item.price;
        html += `<div class="cart-item"><img src="${item.img}"><div class="cart-info"><h4>${item.title}</h4><div class="item-price">${item.price.toLocaleString()} د.ع</div></div><button class="delete-btn" onclick="removeFromCart(${index})"><i class="fa-solid fa-trash"></i></button></div>`;
    });
    list.innerHTML = html;
    totalEl.innerText = total.toLocaleString() + " د.ع";
}
window.removeFromCart = function(index) { cart.splice(index, 1); updateCartUI(); }
window.clearCart = function() { cart = []; updateCartUI(); }

// إرسال الطلب
window.processCheckout = function() {
    if(cart.length === 0) return showToast("السلة فارغة!");
    const name = document.getElementById('order-name').value;
    const phone = document.getElementById('order-phone').value;
    const address = document.getElementById('order-address').value;
    
    if(!name || !phone || !address) return showToast("يرجى ملء جميع البيانات");
    
    let total = 0; cart.forEach(c => total += c.price);
    const orderData = { 
        customerName: name, 
        phone: phone, 
        address: address, 
        items: cart, 
        total: total.toLocaleString() + " د.ع", 
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        isMerchantOrder: isMerchant // علامة لمعرفة إذا كان الطلب من تاجر
    };

    db.ref('orders').push(orderData).then(() => {
        showToast("تم إرسال طلبك بنجاح!");
        clearCart();
        setTimeout(() => showPage('home-page'), 2000);
    });
}

// === نظام تسجيل الدخول الجديد ===

// تبديل بين تسجيل الدخول وإنشاء حساب
window.toggleAuthMode = function(mode) {
    if(mode === 'register') {
        document.getElementById('email-login-form').style.display = 'none';
        document.getElementById('email-register-form').style.display = 'flex';
    } else {
        document.getElementById('email-register-form').style.display = 'none';
        document.getElementById('email-login-form').style.display = 'flex';
    }
}

// تسجيل دخول بالإيميل
window.handleEmailLogin = function() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    if(!email || !pass) return showToast("أدخل البريد وكلمة المرور");
    
    auth.signInWithEmailAndPassword(email, pass)
        .then(() => { showToast("تم الدخول بنجاح"); showPage('home-page'); })
        .catch(err => showToast("خطأ: " + err.message));
}

// إنشاء حساب جديد
window.handleEmailRegister = function() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    if(!email || !pass || !name) return showToast("جميع الحقول مطلوبة");

    auth.createUserWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            userCredential.user.updateProfile({ displayName: name }).then(() => {
                showToast("تم إنشاء الحساب"); showPage('home-page');
            });
        })
        .catch(err => showToast("خطأ: " + err.message));
}

// تسجيل دخول جوجل
window.handleGoogleLogin = function() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then(() => { showToast("تم الدخول بنجاح"); showPage('home-page'); })
        .catch(err => showToast("خطأ في الاتصال"));
}

// دخول كزائر
window.skipLogin = function() {
    sessionStorage.setItem('guestMode', 'true');
    showPage('home-page');
}

// تسجيل خروج
window.logoutUser = function() {
    auth.signOut().then(() => {
        user = null;
        sessionStorage.removeItem('guestMode');
        showPage('login-page');
        updateProfileUI();
    });
}

function updateProfileUI() {
    if(user) {
        document.getElementById('profile-name').innerText = user.name;
        document.getElementById('profile-email').innerText = user.email;
        document.getElementById('profile-img').src = user.avatar;
        document.getElementById('login-menu-item').style.display = 'none';
        document.getElementById('logout-menu-item').style.display = 'flex';
        document.getElementById('sidebar-logout-btn').style.display = 'flex';
    } else {
        document.getElementById('profile-name').innerText = "ضيف";
        document.getElementById('profile-email').innerText = "لم يتم تسجيل الدخول";
        document.getElementById('profile-img').src = "https://via.placeholder.com/80";
        document.getElementById('login-menu-item').style.display = 'flex';
        document.getElementById('logout-menu-item').style.display = 'none';
        document.getElementById('sidebar-logout-btn').style.display = 'none';
    }
}

window.openWhatsAppSupport = function() {
    if (adminPhoneNumber) window.open(`https://wa.me/${adminPhoneNumber}`, '_blank');
    else showToast("رقم الخدمة غير متوفر");
}
function showToast(msg) {
    const toast = document.getElementById('toast-notification');
    toast.innerText = msg; toast.classList.add('show-toast');
    setTimeout(() => toast.classList.remove('show-toast'), 2000);
}
// القوائم
window.toggleSidebar = function() { document.getElementById('sidebar').classList.toggle('active'); document.getElementById('sidebar-overlay').classList.toggle('active'); }
document.getElementById('menu-btn').addEventListener('click', toggleSidebar);
document.getElementById('close-sidebar').addEventListener('click', toggleSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', toggleSidebar);

// الفلترة
window.filterProducts = function(cat) {
    const cards = document.querySelectorAll('.product-card');
    document.querySelectorAll('.cat-box').forEach(b => b.classList.remove('active'));
    event.currentTarget.querySelector('.cat-box').classList.add('active');
    cards.forEach(card => {
        if(cat === 'all' || card.dataset.category === cat) card.style.display = 'flex';
        else card.style.display = 'none';
    });
}
