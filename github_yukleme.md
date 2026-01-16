# GitHub'a Manuel Yükleme Rehberi (En Kolay Yol)

Bilgisayarınızda Git yüklü olmasa bile, dosyalarınızı GitHub'a web sitesi üzerinden saniyeler içinde yükleyebilirsiniz. İşte adımlar:

## 1. Yeni Bir Proje (Repository) Oluşturun
1. [GitHub](https://github.com/new) adresine gidin ve giriş yapın.
2. **Repository name** kısmına `mesaj-paneli` (veya istediğiniz başka bir isim) yazın.
3. Alt kısımdan **"Create repository"** butonuna tıklayın.

## 2. Dosyaları Sürükleyip Bırakın
1. Karşınıza gelen sayfada orta kısımda mavi yazılı **"uploading an existing file"** linkine tıklayın.
2. Bilgisayarınızdaki `unified-dashboard` klasörünü açın.
3. İçindeki TÜM dosyaları (index.html, app.js, manifest.json, sw.js vb.) seçin ve tarayıcıdaki kutunun içine sürükleyip bırakın.
4. Dosyalar yüklendikten sonra alttaki yeşil **"Commit changes"** butonuna tıklayın.

## 3. Web Sitesini Yayına Alın
1. Sayfanın üst menüsünden **Settings** (Çark simgesi) sekmesine tıklayın.
2. Sol menüden **Pages** seçeneğine tıklayın.
3. **Branch** kısmında "None" yazan yeri **"main"** (veya master) yapın ve **"Save"** butonuna tıklayın.
4. 1-2 dakika sonra aynı sayfada en üstte `Your site is live at...` şeklinde bir link belirecektir.

---

**ÖNEMLİ:** Siteniz yayına girdikten sonra telefonunuzdan bu linke tıklayarak uygulamayı kurabilirsiniz. Ayrıca [deployment.md](file:///C:/Users/OEM/.gemini/antigravity/scratch/unified-dashboard/deployment.md) dosyasındaki **CORS** uyarısını unutmayın!
