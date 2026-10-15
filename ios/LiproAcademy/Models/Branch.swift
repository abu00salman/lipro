import Foundation

struct Branch: Identifiable, Hashable {
    let id: String
    let nameAR: String
    let nameEN: String
    let cityAR: String
    let cityEN: String
    let venueAR: String
    let venueEN: String
    /// أيام التدريب بترقيم Calendar: 0 = الأحد … 6 = السبت
    let days: [Int]
    let startHour: Int
    let startMinute: Int
    let endHour: Int
    let endMinute: Int
    let mapURL: URL
    let photos: [String]

    var name: String { L10n.pick(nameAR, nameEN) }
    var city: String { L10n.pick(cityAR, cityEN) }
    var venue: String { L10n.pick(venueAR, venueEN) }

    var timeText: String {
        "\(Self.clock(startHour, startMinute)) – \(Self.clock(endHour, endMinute))"
    }

    var registerMessage: String {
        L10n.pick("مرحبًا، أبغى أسجل في \(nameAR)", "Hello, I'd like to register at \(nameEN)")
    }

    func trains(on day: Weekday) -> Bool {
        days.contains(day.rawValue)
    }

    /// تنسيق الوقت حسب لغة الجهاز (٥:٠٠ م أو 5:00 PM)
    private static func clock(_ hour: Int, _ minute: Int) -> String {
        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        var calendar = Calendar.current
        calendar.locale = L10n.locale
        let date = calendar.date(from: components) ?? .now
        return date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(L10n.locale))
    }
}

enum Weekday: Int, CaseIterable, Identifiable {
    case sunday = 0, monday, tuesday, wednesday, thursday, friday, saturday

    var id: Int { rawValue }

    /// أسماء الأيام من نظام اللغة نفسه، فتظهر بالعربية أو الإنجليزية تلقائيًا
    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = L10n.locale
        return calendar
    }

    var title: String { Self.calendar.weekdaySymbols[rawValue] }
    var short: String { Self.calendar.shortWeekdaySymbols[rawValue] }

    /// أيام التدريب في الأكاديمية (لا تدريب يوم الجمعة)، تبدأ بالسبت
    static let trainingDays: [Weekday] = [.saturday, .sunday, .monday, .tuesday, .wednesday, .thursday]

    /// اليوم الحالي بتوقيت الرياض
    static var riyadhToday: Weekday {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Riyadh") ?? .current
        let index = calendar.component(.weekday, from: .now) - 1
        return Weekday(rawValue: index) ?? .sunday
    }
}

extension Branch {
    static let all: [Branch] = [
        Branch(
            id: "jizan",
            nameAR: "ليبرو جيزان", nameEN: "Lipro Jizan",
            cityAR: "محافظة جيزان", cityEN: "Jizan Province",
            venueAR: "ملعب يارا — حي المعبوج", venueEN: "Yara Stadium — Al-Mabouj",
            days: [6, 1, 4],
            startHour: 17, startMinute: 0, endHour: 19, endMinute: 30,
            mapURL: URL(string: "https://maps.app.goo.gl/jESBcXjSMu929TM19")!,
            photos: ["branch-jizan", "branch-jizan-2"]
        ),
        Branch(
            id: "bish",
            nameAR: "ليبرو بيش", nameEN: "Lipro Bish",
            cityAR: "محافظة بيش", cityEN: "Bish Province",
            venueAR: "ملعب الشعلاني", venueEN: "Al-Shuaili Stadium",
            days: [0, 2, 3],
            startHour: 19, startMinute: 0, endHour: 21, endMinute: 0,
            mapURL: URL(string: "https://maps.app.goo.gl/MTAYUm6TBtkUSArR7")!,
            photos: ["branch-bish"]
        ),
        Branch(
            id: "khamis",
            nameAR: "ليبرو خميس مشيط", nameEN: "Lipro Khamis Mushait",
            cityAR: "مدينة خميس مشيط", cityEN: "Khamis Mushait",
            venueAR: "ملعب الهدف — خلف كوبري السجون", venueEN: "Al-Hadaf Stadium — behind Al-Sujoon Bridge",
            days: [0, 1, 4],
            startHour: 16, startMinute: 0, endHour: 19, endMinute: 0,
            mapURL: URL(string: "https://maps.app.goo.gl/NnZYt67jBhQ2ktnu7")!,
            photos: ["branch-khamis"]
        ),
        Branch(
            id: "madaya",
            nameAR: "ليبرو المضايا", nameEN: "Lipro Al-Madaya",
            cityAR: "المضايا", cityEN: "Al-Madaya",
            venueAR: "ملعب ليبرو المضايا", venueEN: "Lipro Al-Madaya Stadium",
            days: [0, 2, 4],
            startHour: 17, startMinute: 0, endHour: 19, endMinute: 30,
            mapURL: URL(string: "https://maps.app.goo.gl/xgtmfGmrtFuS51c36")!,
            photos: ["branch-madaya"]
        ),
        Branch(
            id: "mataan",
            nameAR: "ليبرو المطعن", nameEN: "Lipro Al-Mataan",
            cityAR: "المطعن", cityEN: "Al-Mataan",
            venueAR: "ملعب ليبرو المطعن", venueEN: "Lipro Al-Mataan Stadium",
            days: [6, 1, 3],
            startHour: 19, startMinute: 0, endHour: 21, endMinute: 0,
            mapURL: URL(string: "https://maps.app.goo.gl/vvuKYtDQ1wFFivA78")!,
            photos: ["branch-mataan"]
        ),
        Branch(
            id: "aliyah",
            nameAR: "ليبرو العالية", nameEN: "Lipro Al-Aliyah",
            cityAR: "العالية", cityEN: "Al-Aliyah",
            venueAR: "ملعب ليبرو العالية", venueEN: "Lipro Al-Aliyah Stadium",
            days: [6, 1, 3],
            startHour: 19, startMinute: 0, endHour: 21, endMinute: 0,
            mapURL: URL(string: "https://maps.app.goo.gl/kQtpVJ38WomBDfQKA")!,
            photos: ["branch-aliyah"]
        ),
        Branch(
            id: "albaha",
            nameAR: "ليبرو الباحة", nameEN: "Lipro Al-Baha",
            cityAR: "محافظة الباحة", cityEN: "Al-Baha Province",
            venueAR: "ملعب الفيفا — حي الأزهر", venueEN: "FIFA Stadium — Al-Azhar district",
            days: [6, 1, 4],
            startHour: 16, startMinute: 0, endHour: 18, endMinute: 30,
            mapURL: URL(string: "https://www.google.com/maps/search/?api=1&query=%D9%85%D9%84%D8%B9%D8%A8%20%D8%A7%D9%84%D9%81%D9%8A%D9%81%D8%A7%20%D8%AD%D9%8A%20%D8%A7%D9%84%D8%A3%D8%B2%D9%87%D8%B1%20%D8%A7%D9%84%D8%A8%D8%A7%D8%AD%D8%A9")!,
            photos: ["branch-albaha"]
        ),
    ]

    static func training(on day: Weekday) -> [Branch] {
        all.filter { $0.trains(on: day) }
    }

    static var trainingToday: [Branch] {
        training(on: .riyadhToday)
    }
}

/// المفضلة محفوظة محليًا على الجهاز ومتاحة لكل الشاشات عبر Environment
@MainActor
@Observable
final class Favorites {
    private static let key = "favoriteBranches"
    private(set) var ids: Set<String>

    init() {
        ids = Set(UserDefaults.standard.stringArray(forKey: Self.key) ?? [])
    }

    func contains(_ branch: Branch) -> Bool {
        ids.contains(branch.id)
    }

    func toggle(_ branch: Branch) {
        if ids.contains(branch.id) {
            ids.remove(branch.id)
        } else {
            ids.insert(branch.id)
        }
        UserDefaults.standard.set(Array(ids), forKey: Self.key)
    }
}
