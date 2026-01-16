# Yayınlama ve Uygulama Olarak Kurma Rehberi

Bu dashboard'u ücretsiz olarak yayınlamak ve telefonunuza/bilgisayarınıza bir uygulama olarak kurmak için aşağıdaki adımları izleyin.

## 1. Ücretsiz Yayınlama Seçenekleri

### Seçenek A: GitHub Pages (En Popüler)
1. [GitHub](https://github.com/) üzerinde bir hesap oluşturun.
2. Yeni bir "Repository" (depo) oluşturun (Örn: `mesaj-paneli`).
3. Bu klasördeki tüm dosyaları oraya yükleyin.
4. Ayarlar (Settings) > Pages kısmından "Deploy from a branch" seçin ve kaydedin.
5. Uygulamanız `kullaniciadi.github.io/mesaj-paneli` adresinde yayına girecektir.

### Seçenek B: Vercel (En Hızlı)
1. [Vercel](https://vercel.com/) sitesine gidin.
2. "Add New" > "Project" diyerek klasörünüzü sürükleyip bırakın.
3. Size otomatik bir `....vercel.app` adresi verecektir.

---

## 2. Uygulama Olarak Kurma (PWA)

Programı artık gerçek bir uygulama gibi kullanabilirsiniz:

- **Telefonda (Android/iPhone):**
  1. Uygulama adresinizi tarayıcıda açın.
  2. Tarayıcı menüsünden (üç nokta veya paylaş butonu) **"Ana Ekrana Ekle"** veya **"Uygulamayı Yükle"** seçeneğine dokunun.
  3. Artık ana ekranınızda bir ikonunuz olacak.

- **Bilgisayarda (Chrome/Edge):**
  1. Adres çubuğunun sağ tarafında çıkan **"Yükle"** (monitör ikonu) butonuna tıklayın.
  2. Artık masaüstünüzde bir kısayol olacak ve kendi penceresinde açılacak.

---

## 3. ÖNEMLİ: CORS Ayarı

Uygulamayı internete yüklediğinizde Evolution API'niz güvenli nedeniyle bağlantıyı reddedebilir. Bunu çözmek için Evolution API sunucunuzun `.env` dosyasına şu ayarı eklemelisiniz:

```env
CORS_ORIGIN="*"
# Veya daha güvenlisi için sadece kendi adresinizi yazın:
# CORS_ORIGIN="https://kullaniciadi.github.io"
```

Bu ayarı yaptıktan sonra Evolution API'yi yeniden başlatmanız gerekebilir.
