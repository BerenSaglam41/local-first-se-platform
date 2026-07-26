# SE-OS Workforce System — Düzeltme Planı

## Amaç

CEO tek komut verir. 4–5 worker görevleri planlar, uygun AI provider ile çalışır, aynı proje workspace’inde ilerler, birbirine bilgi/review aktarır ve sonucu gerçek proje üzerinde doğrular.

## Tespit edilen problemler

- Worker workspace’i boş oluşturuluyor; hedef projenin mevcut kodu worker’a verilmiyor.
- Follow-up chat yeni/boş workspace açabiliyor.
- Proje çalışırken ikinci chat komutu aynı worker’lara çakışabiliyor.
- Provider seçimi role göre sabit; worker bazında seçim yok.
- Collaboration/review servisleri mission execution hattına bağlı değil.
- Verification çoğu zaman gerçek hedef projede çalışmıyor.
- Git worktree yöneticisi gerçek `git worktree add` kullanmıyor.
- Project/chat state process memory’de; restart sonrası kayboluyor.
- Dashboard/TUI gerçek durum ile mock/demo durumunu ayırmalı.

## Uygulama sırası

1. Target workspace context’i project → mission → task → worker hattına taşı.
2. Her project için tek shared workspace oluştur; follow-up aynı workspace’i kullansın.
3. Worker başına provider seçimini config ve TUI üzerinden destekle.
4. Provider unavailable ise task başlamadan açık hata ver; sessiz provider değişimi yapma.
5. Worker task completion sonrası collaboration event/review üret.
6. Verification’ı shared target workspace üzerinde build/typecheck/test/lint ile çalıştır.
7. Git izolasyonunu gerçek `git worktree add` ile yap; merge öncesi conflict kontrolü çalıştır.
8. Project state, conversation history, worker assignment ve event kayıtlarını SQLite’a yaz.
9. TUI’da aktif proje, worker, provider, hata ve devam komutunu görünür yap.

## Kabul kriterleri

- İlk komut mevcut proje dosyalarını okuyabilir.
- İkinci chat komutu ilk komutun aynı project/workspace state’ini kullanır.
- Çalışan hâlâ meşgulse ikinci task duplicate execution başlatmaz.
- Her worker’ın provider’ı ayrı seçilebilir ve seçilen provider gerçekten kullanılır.
- Provider kurulu değilse sonuç `FAILED` ve gerçek sebep ile görünür.
- Verification gerçek workspace’te çalışır; skipped kontrol başarı gibi sayılmaz.
- Worker çıktısı yalnızca doğrulama sonrası hedef branch’e alınır.
- Process restart sonrası project/chat state geri yüklenir.
- `npm run build` ve `npm test` geçer.

## Durum

- [x] TUI aynı anda ikinci project başlatma çakışmasını engelliyor.
- [x] Aktif project ID execution başlamadan tutuluyor.
- [x] Telemetry aktif project’i gösteriyor.
- [x] Chat async hatayı görünür gösteriyor.
- [x] Shared project staging workspace: project → mission → task → worker aynı path’i kullanıyor; hedef klasör başlangıçta seed, bitince sync ediliyor.
- [x] Per-worker provider UI: `WORKERS` sekmesinde worker seçip `C` ile kurulu provider değiştiriliyor.
- [x] Execution’a bağlı collaboration/review: task ownership ve QA review request execution başarılarından üretiliyor.
- [x] Verification shared workspace’te çalışıyor; unavailable provider açık FAILED sebebi veriyor.
- [x] Project history persistence: `.se_workspaces/project_history.json` ile restart sonrası geçmiş/continuation yükleniyor.
- [ ] Gerçek git worktree + SQLite project repository: sonraki sertleştirme adımı.

## Kullanım notu

- `WORKERS` sekmesine geç, worker seç, `C` ile provider ata. Provider kurulu değilse worker bilinçli olarak hata verir; bu yanlış provider’a sessiz geçişi engeller.
- `PROJECT WIZARD` hedef klasörü seçer. Worker’lar hedefin staging kopyasında birlikte çalışır; başarılı/başarısız çıktı hedef klasöre ve `REPORT.md` dosyasına yazılır.
- `CHAT` proje çalışırken yeni proje açmaz. Çalışma bitince son project ID’ye continuation gönderir.

## Canlı CLI üyelik testi

Terminal:

```bash
npm run build
node dist/v2/cli/bin.js
```

TUI içinde:

1. Başlangıç ekranında `ENTER`.
2. Runtime ekranında kurulu bir CLI seç ve `ENTER`.
3. Main Menu → `New Project`.
4. Test adı: `CLI Memory Test`.
5. Hedef: `Custom Path` → `/tmp/se-os-cli-memory-test`.
6. Confirm & Start.
7. Proje bitene kadar bekle; Dashboard’da `FAILED` olursa Logs/Workers ekranındaki gerçek provider hatasını kontrol et.
8. Proje bitince `5` ile Chat’e geç ve şu komutu ver: `Önceki görevin devamı olarak STATUS.md oluştur; mevcut dosyaları silme.`
9. Hedef klasörde dosyaları kontrol et:

```bash
find /tmp/se-os-cli-memory-test -maxdepth 2 -type f -print
cat /tmp/se-os-cli-memory-test/REPORT.md
```

Test sırasında aynı Chat mesajını ikinci kez göndermemek ve ilk execution’ın bitmesini beklemek gerekir.

## Provider kararı

Bu sistem API key/API tabanlı olmayacak. Her worker, kullanıcının lokal makinesinde login edilmiş CLI hesabını kullanır:

- Claude → `claude -p "..."`
- Codex → `codex exec "..."`
- Gemini → `gemini -p "..."`
- Antigravity → kuruluysa kendi CLI komutuyla

CLI process’i ortak project workspace’inde (`cwd`) başlatılır. Böylece üyelik/auth bilgisi lokal CLI’dan gelir; SE-OS API key saklamaz.

SE-OS login ekranı değildir: provider binary’sini ve sürümünü kontrol eder, sonra aynı OS kullanıcısıyla CLI process’i başlatır. Gerçek hesap login’i provider’ın kendi CLI’sında yapılır. Bu nedenle provider ekranındaki “installed” durumu “authenticated” anlamına gelmez; ilk gerçek task provider’ın kendi auth hatasını döndürebilir.

## Mevcut ekip değerlendirmesi

Varsayılan ekip:

1. Alice — Lead Architect: mimari, görev planı, teknik kararlar.
2. Bob — Backend Engineer: backend/model/API implementasyonu.
3. Charlie — QA Engineer: test ve review.
4. Diana — Documentation Engineer: dokümantasyon/OpenAPI.
5. Eve — Research Engineer: araştırma ve teknik keşif.

Bu ekip başlangıç için mantıklı; ancak genel web ürünü için Frontend ve DevOps yeteneği eksik. Worker sayısını hemen artırmak yerine skills/capability profiline `Frontend`, `DevOps`, `Security` ve `Database` eklemek daha doğru. Görev tipine göre mevcut worker’a skill atanmalı; herkes her işi yapan genel bot olmamalı.

Uygulanan default skill profilleri:

- Alice: `architecture`, `system design`, `technical leadership`, `code review`
- Bob: `backend`, `database`, `api`, `code generation`
- Charlie: `qa`, `testing`, `security`, `code review`
- Diana: `frontend`, `ux`, `documentation`, `openapi`
- Eve: `devops`, `research`, `documentation`, `dependency analysis`

Task assignment artık önce skill eşleşmesi arıyor, eşleşme yoksa department fallback kullanıyor. Böylece role adı değişse bile görev doğru yeteneğe gidebilir.
