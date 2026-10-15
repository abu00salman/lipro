# تطبيق أكاديمية ليبرو (iOS)

تطبيق SwiftUI أصلي لأكاديمية ليبرو الرياضية، يُبنى كملف IPA غير موقّع (unsigned) عبر GitHub Actions.

## المميزات

- **انتقالات سلسة**: تكبير بين بطاقة الفرع وصفحة التفاصيل (`matchedTransitionSource` + `navigationTransition(.zoom)`)، وحركة دخول متدرجة، وتبديل أيام الجدول بانزلاق.
- **أيقونة متوافقة مع iPhone الجديد**: نسخ فاتحة، داكنة، ومُلوّنة (Tinted) من أيقونة التطبيق في Asset Catalog.
- **التدريب اليوم**: يقرأ اليوم بتوقيت الرياض ويعرض الفروع المتدربة.
- **تسجيل عبر واتساب**: رسالة جاهزة لكل فرع.
- **عربي RTL** بالكامل.

## البناء

الملف `project.yml` يولّد مشروع Xcode عبر XcodeGen، والـ workflow في
`.github/workflows/ios-unsigned-ipa.yml` يبني الملف على macOS.

1. افتح تبويب **Actions** في GitHub واختر **iOS unsigned IPA**.
2. اضغط **Run workflow** (أو ادفع تعديلًا على مجلد `ios/`).
3. حمّل الـ artifact باسم `LiproAcademy-unsigned-ipa` — داخله `LiproAcademy-unsigned.ipa`.

### البناء محليًا على Mac

```bash
brew install xcodegen
cd ios
xcodegen generate
open LiproAcademy.xcodeproj
```

## التثبيت على الجهاز

ملف IPA غير الموقّع لا يعمل مباشرة على iPhone. يلزم توقيعه بأحد الطرق:

- **Sideloadly** أو **AltStore** على Windows/Mac باستخدام Apple ID شخصي (الصلاحية 7 أيام مع الحساب المجاني).
- **Xcode** بإضافة الـ IPA أو فتح المشروع وتوقيعه بحسابك.
- حساب Apple Developer المدفوع لتوزيع دائم أو عبر TestFlight.

## التعديل

- بيانات الفروع في `LiproAcademy/Models/Branch.swift`، وهي مطابقة لبيانات الموقع.
- الألوان في `LiproAcademy/Theme.swift`.
- معرّف الحزمة `com.liproacademy.app` في `project.yml`. غيّره إذا كان لديك نطاق آخر.
- الأيقونات في `LiproAcademy/Assets.xcassets/AppIcon.appiconset/`.
