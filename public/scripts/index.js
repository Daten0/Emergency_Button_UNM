(() => {
    // Watch position elements
    const textLatitude = document.querySelector(".latitude");
    const textLongtitude = document.querySelector(".longtitude");
    // Posisi sekarang
    let latitude = 0;
    let longtitude = 0;

// Mobile APP Side
/////////////////////////////////////////////////////////////////////
    // Di client-side (index.js)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then((registration) => {
            // Registrasi berhasil
            console.log('Service Worker registered');
        });
}
// Tambahkan dukungan untuk Web Share API
function shareEmergencyShortcut() {
    if (navigator.share) {
        navigator.share({
            title: 'Emergency Shortcut',
            text: 'Tombol Emergency Cepat',
            url: '/emergency-shortcut'
        });
    }
}
// Untuk mendukung notifikasi di browser modern
if ('Notification' in window) {
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            // Buat shortcut emergency
            const emergencyNotification = new Notification('Emergency Shortcut', {
                body: 'Tekan untuk aktifkan tombol emergency',
                icon: 'public/img/alert.png'
            });

            emergencyNotification.onclick = () => {
                // Kirim emergency
                fetch("/emergency", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        latitude: currentLatitude, 
                        longitude: currentLongitude 
                    })
                });
            }
        }
    });
}
/////////////////////////////////////////////////////////////////////////////
    // Toast
    const toastContainer = document.querySelector(".toast-container");
    const toastTimeout = document.querySelector("#toastTimeout");
    const toastSukses = document.querySelector("#toastSukses");
    const toastError = document.querySelector("#toastError");

    if (navigator.geolocation) {
        // Watch posisi
        navigator.geolocation.watchPosition(locationOnSuccess, locationOnError, {
            enableHighAccuracy: true
        });
    } else {
        locationOnError();
    }

    // Current position
    function locationOnError() {
        const modalGagal = new bootstrap.Modal("#modalIzinLokasiGagal", {
            backdrop: "static",
            keyboard: false
        });

        modalGagal.show();
    }

    /**
     * @param {GeolocationPosition} pos
     */
    function locationOnSuccess(pos) {
        latitude = pos.coords.latitude;
        longtitude = pos.coords.longitude; 

        // Ubah nomor X dan Y
        textLatitude.innerHTML = latitude;
        textLongtitude.innerHTML = longtitude;
    }

    
    // Tombol emergency //
    let onworking = false;

    /**
     * @type {HTMLDivElement}
     */
    const bigButton = document.querySelector(".big-button");

    // Touch perlu dihandle di js untuk transisi
    // karena mobile tidak support :active
    bigButton.ontouchstart = bigButton.onmousedown = () => {
        // Mencegah context menu muncul di mobile
        window.oncontextmenu = function(event) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        };

        if (onworking) return;
        bigButton.classList.add("pressed");
    }

    let timeouted = false
    bigButton.onmouseup = () => {
        window.oncontextmenu = null;
        if (onworking) return;

        bigButton.classList.remove("pressed");

        // Cegah spam kiriman data
        if (!timeouted) {
            onworking = true;

            setTimeout(() => timeouted = false, 1000 * 5);
            timeouted = true;

            bigButton.innerHTML = `<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>`;
            fetch("/emergency", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latitude, longitude: longtitude })
            })
            .then(res => res.json())
            .then(res => {
                if (res.error) {
                    /** @type {HTMLDivElement} */
                    const toast = toastError.cloneNode(true);
                    toast.id = null;
                    const ctrl = bootstrap.Toast.getOrCreateInstance(toast);

                    toastContainer.prepend(toast);
                    ctrl.show();

                    setTimeout(() => {
                        ctrl.hide();
                        setTimeout(() => toastContainer.removeChild(toast), 1000);
                    }, 5000);
                } else {
                    /** @type {HTMLDivElement} */
                    const toast = toastSukses.cloneNode(true);
                    toast.id = null;
                    const ctrl = bootstrap.Toast.getOrCreateInstance(toast);

                    toastContainer.prepend(toast);
                    ctrl.show();

                    setTimeout(() => {
                        ctrl.hide();
                        setTimeout(() => toastContainer.removeChild(toast), 1000);
                    }, 5000);
                }

                // Ubah kembali tombol emergency
                bigButton.innerHTML = "EMERGENCY!";
                onworking = false;
            });
        } else {
            // Berikan toast timeout jika terlalu sering menekan
            /** @type {HTMLDivElement} */
            const toast = toastTimeout.cloneNode(true);
            toast.id = null;
            const ctrl = bootstrap.Toast.getOrCreateInstance(toast);

            toastContainer.prepend(toast);
            ctrl.show();

            setTimeout(() => {
                ctrl.hide();
                setTimeout(() => toastContainer.removeChild(toast), 1000);
            }, 5000);
        }
    }
})();