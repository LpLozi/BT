# BT — Budget Tracking 2.0

Mobil öncelikli kişisel finans ve finansal hafıza uygulaması.

## BT 2.0
- Günlük, haftalık ve aylık finans görünümü
- Ayın 25'i varsayılan dönem başlangıcı ve döneme özel tarih override'ları
- Pozitif bakiyeyi sonraki döneme taşıyan devreden bakiye motoru
- Gelir / gider / net bakiye ve kategori dağılımı
- Yerel **BT Hafıza** içgörüleri: dönem karşılaştırması, en büyük gider alanı, önündeki 30 günlük planlı ödemeler
- İşlem ekleme, düzenleme, arama ve güvenli silme
- 30 günlük çöp kutusu ve hızlı Geri Al
- Taksitli işlemler: ödeme planı, tamamlama ve yeniden açma
- Tekrarlayan işlemler: ekleme, düzenleme, duraklatma, yeniden başlatma ve silme
- Hesap ve kategori yönetimi
- Hesap bazlı finans raporu
- Kategori bütçeleri ve bütçe doluluk takibi
- JSON yedek dışa aktarma ve doğrulanmış geri yükleme
- Eski `BT_DATA` kayıtlarını koruyan şema normalizasyonu/migration
- Bozuk eski kayıt için ham kurtarma kopyası
- Opsiyonel PIN kilidi + PBKDF2/AES-GCM ile cihaz içi şifreli saklama
- PWA / iPhone ana ekran desteği ve service worker ile offline önbellek

## Güvenlik notu
PIN kilidi etkinleştirildiğinde PIN sunucuya gönderilmez ve uygulama tarafından kurtarılamaz. PIN'i unutmadan önce güncel bir yedek almak önerilir.

## Geliştirme
```bash
npm install
npm run dev
npm run build
```

Vercel yapılandırması repodaki `vercel.json` üzerinden Vite build + `dist` çıktısına sabitlenmiştir.
