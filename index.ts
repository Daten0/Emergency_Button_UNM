import express, { text } from "express";
import multer from "multer";
import nunjucks from "nunjucks";
import open from "open";
import path from "path";
import { fileURLToPath } from "url";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";


// Firebase
import { initializeApp } from "@firebase/app";
import { getFirestore, doc, setDoc, getDoc, arrayUnion, updateDoc } from "@firebase/firestore";
import { 
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    onAuthStateChanged,
    type User
} from "@firebase/auth";

if (
    !process.env["FIREBASE_API_KEY"] ||
    !process.env["FIREBASE_AUTH_DOMAIN"] ||
    !process.env["FIREBASE_PROJECT_ID"] ||
    !process.env["FIREBASE_STORAGE_BUCKET"] ||
    !process.env["FIREBASE_MESSAGING_SENDER_ID"] ||
    !process.env["FIREBASE_APP_ID"]
) throw new Error("Autentikasi Firebase tidak lengkap. Mohon periksa file .env");

const firebaseApp = initializeApp({
    apiKey: process.env["FIREBASE_API_KEY"],
    authDomain: process.env["FIREBASE_AUTH_DOMAIN"],
    projectId: process.env["FIREBASE_PROJECT_ID"],
    storageBucket: process.env["FIREBASE_STORAGE_BUCKET"],
    messagingSenderId: process.env["FIREBASE_MESSAGING_SENDER_ID"],
    appId: process.env["FIREBASE_APP_ID"]
});
const firebaseAuth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
let currentUser: User | null;

// Perhatikan state login pengguna
onAuthStateChanged(firebaseAuth, (user) => {
    currentUser = user;
    // console.log(user); // UNTUK DEBUGGING
});

// App baru
const app = express();
// Handle form-data
const upload = multer({ storage: multer.memoryStorage() });

// Persiapkan nunjucks
app.set("view engine", "njk");
const njk = nunjucks.configure("public", {
    watch: true,
    express: app,
    autoescape: true
});

// Filter nunjucks
njk.addFilter("date", (date: number) => {
    const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    const d = new Date(date);
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    
    return `${day} ${month} ${year}` ;
});

// File static
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));
// Jangan perbolehkan akses kalau belum login
app.use((req, res, next) => {
    if ((
        req.url != "/register" &&
        req.url != "/login" &&
        !req.url.startsWith("/styles") &&
        !req.url.startsWith("/scripts") &&
        !req.url.startsWith("/img")
    ) && !currentUser) {
        res.redirect("/login");
    } else {
        next();
    }
})

// Halaman utama
///////////////////////////////////////////////////////

// Halaman utama (atau login jika belum login)
app.get("/", (_req, res) => {
    res.render("index", { title: "Beranda", noDummy: true });
});

// POST Terima data emergency lalu kirim ke telegram
app.post("/emergency", express.json(), async (req, res): Promise<any> => {
    if (!currentUser) {
        return res.json({ error: true, message: "Pengguna tidak ditemukan atau belum login" });
    }

    console.log("Laporan baru dari " + currentUser.displayName);
    try {
        const data = {
            name: currentUser.displayName || "NoName",
            latitude: req.body.latitude,
            longitute: req.body.longitude,
            date: Date.now(),
            gmap: `https://www.google.com/maps?q=loc:${req.body.latitude},${req.body.longitude}`
        }
        // Debugging
        console.log("Memeriksa dokumen history untuk UID:", currentUser.uid);
        //
        const historyRef = doc(firestore, "history", currentUser.uid);
        const historyDoc = await getDoc(historyRef);

        if (!historyDoc.exists()) {
            // Jika dokumen tidak ada, buat dokumen baru dengan data awal
            await setDoc(historyRef, { history: [data] });
        } else {
            // Jika dokumen ada, tambahkan data ke array history
            await updateDoc(historyRef, {
                history: arrayUnion(data)
            });
        }
        // Tambah emergency user ke history
        console.log("Menyimpan history...");
        await updateDoc(doc(firestore, "history", currentUser.uid), {
            history: arrayUnion(data)
        });

        // Kirim informasi ke bot telegram
        console.log("Mengirim ke Telegram...");
        const information = await getDoc(doc(firestore, "users", currentUser.uid));

        let message = "**🚨 Laporan Terbaru!**";
        message += "\n\n";
        message += `Nama: ${currentUser.displayName || "NoName"}\n`;
        message += `NIM: ${information.get("nim")}\n`;
        message += `Email: ${information.get("email")}\n`;
        message += `Fakultas: ${information.get("fakultas")}\n`;
        message += `Prodi: ${information.get("studi")}\n`;
        message += `Latitude: ${data.latitude}\n`;
        message += `Longitude: ${data.longitute}\n`;
        message += `\n\n`;
        message += data.gmap;

        await fetch(`https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: process.env["TELEGRAM_CHAT_ID"],
                text: message
            })
        });
        
        console.log("Laporan berhasil dikirim!")
        // Beritahu client
        res.json({ error: false, message: "Tersimpan!" });
    } catch (error) {
        console.error(error);
        res.json({ error: true, message: "Tidak diketahui." })
    }
});

/////////////////////////////////////////
// Native Mobile APP web App
// Tambahkan di index.ts
app.get("/emergency-shortcut", (req, res) => {
    // Validasi autentikasi
    if (currentUser) {
        // Render halaman khusus shortcut emergency
        res.render("emergency-shortcut", { 
            user: currentUser 
        });
    } else {
        res.redirect("/login");
    }
});
////////////////////////////////////////////////

// Halaman biasa
///////////////////////////////////////////////////////

// Halaman profil
app.get("/profile", async (_req, res) => {
    const information = await getDoc(doc(firestore, "users", currentUser?.uid || "0"))
        .then(res => res.data())
        .catch(console.error);

    res.render("profile", { title: "Profil", information, photoURL: currentUser?.photoURL });
});

// Akses ke foto profil
app.use("/uploads", express.static(__dirname + "/uploads"));
// Halaman riwayat
app.get("/history", async (_req, res) => {
    const histories = await getDoc(doc(firestore, "history", currentUser?.uid || "0"))
        .then(res => res.get("history"))
        .catch(console.error);
    const information = await getDoc(doc(firestore, "users", currentUser?.uid || "0"))
        .then(res => res.data())
        .catch(console.error);

    res.render("history", { title: "Riwayat", histories, information });
});

// Halaman login dan logout
///////////////////////////////////////////////////////

// Halaman login
app.get("/login", (_req, res) => {
    if (currentUser) {
        res.redirect("/");
    } else {
        res.render("login", { login: true, title: "Masuk" });
    }
});

// POST Login
app.post("/login", express.urlencoded({ extended: true }), async (req, res) => {
    try {
        const credential = await signInWithEmailAndPassword(firebaseAuth, req.body["login-email"], req.body["login-password"]);
        console.log(credential.user.displayName + " masuk.")
        res.redirect(".");
    } catch (error) {
        console.error("Login user gagal", error);
        res.render("login", { login: true, title: "Masuk", wrongUser: true });
    }
});

// Logout
app.get("/logout", async (_req, res) => {
    console.log(currentUser?.displayName + " keluar.")

    await signOut(firebaseAuth)
    res.redirect("/login");
});

// Halaman register
///////////////////////////////////////////////////////

// Halaman register
app.get("/register", (_req, res) => {
    if (currentUser) res.redirect("/");
    else res.render("register", { login: true, title: "Daftar" });
});

// POST register
app.post("/register", upload.single("register-photo"), async (req, res) => {
    const email = req.body["register-email"];
    const password = req.body["register-password"];

    // Lempar error jika email dan password kosong
    if (!email && !password) {
        res.redirect("/register");
        throw new Error("Email atau password kosong.");
    }

    console.log("Menyimpan user...");
    let user: User;

    // Informasi pribadi
    const userInformation = {
        name: req.body["register-name"] as string,
        nim: req.body["register-nim"] as string,
        email: req.body["register-email"] as string,
        fakultas: req.body["register-fakultas"] as string,
        studi: req.body["register-studi"] as string,
        photo: "/" + req.file?.path as string,
    }

    try {
        user = await createUserWithEmailAndPassword(firebaseAuth, email, password)
            .then(user => user.user);
        // Simpan foto ke Firebase Storage jika ada
        if (req.file) {
            const photoBuffer = req.file.buffer; // Ambil buffer foto
            const storageRef = ref(storage, `profile_pictures/${user.uid}.jpg`);
            await uploadBytes(storageRef, photoBuffer);
            const photoURL = await getDownloadURL(storageRef); // Ambil URL foto yang dapat diakses

            // Simpan URL foto ke Firebase Authentication dan Firestore
            await updateProfile(user, {
                displayName: req.body["register-name"],
                photoURL: photoURL
            });

            userInformation.photo = photoURL; // Simpan URL foto di Firestore
        }
        // Simpan data pribadi juga ke Authentication
        updateProfile(user, {
            displayName: req.body["register-name"],
            photoURL: userInformation.photo
        });
    } catch (error) {
        console.error("Menyimpan user gagal", error);
        return res.render("register", { login: true, title: "Daftar", alreadyRegistered: true });
    }

    console.log("Menyimpan informasi pribadi...")
    // Simpan informasi pribadi
    await setDoc(doc(firestore, "users", user.uid), userInformation);
    // Simpan placeholder history
    await setDoc(doc(firestore, "history", user.uid), { history: [] });
    try {
        await setDoc(doc(firestore, "history", user.uid), { history: [] });
        console.log("Dokumen history berhasil dibuat.");
    } catch (error) {
        console.error("Gagal membuat dokumen history:", error);
    }

    // Lanjutkan ke login
    console.log("Penyimpanan user dan informasi berhasil!");
    res.redirect("/login");
});

///////////////////////////////////////////////////////

app.listen(process.env.PORT || 8080, () => {
    open("http://localhost:8080");
});
// const port = process.env.PORT || 8080;
// app.listen(port, () => console.log('Listening to port ${port}'));
// const PORT = process.env.PORT;
// app.listen(PORT, () => console.log(`Listening to port ${PORT}`)); // eslint-disable-line