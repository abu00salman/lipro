import Foundation

struct Branch: Identifiable, Hashable {
    let id: String
    let name: String
    let city: String
    /// أيام التدريب بترقيم Calendar: 0 = الأحد … 6 = السبت
    let days: [Int]
    let time: String
    let venue: String
    let mapURL: URL
    let photo: String

    var registerMessage: String {
        "مرحبًا، أبغى أسجل في \(name)"
    }

    func trains(on day: Weekday) -> Bool {
        days.contains(day.rawValue)
    }
}

enum Weekday: Int, CaseIterable, Identifiable {
    case sunday = 0, monday, tuesday, wednesday, thursday, friday, saturday

    var id: Int { rawValue }

    var title: String {
        ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][rawValue]
    }

    var short: String {
        ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"][rawValue]
    }

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
            name: "ليبرو جيزان",
            city: "محافظة جيزان",
            days: [6, 1, 4],
            time: "٥:٠٠ – ٧:٣٠ م",
            venue: "ملعب يارا — حي المعبوج",
            mapURL: URL(string: "https://maps.app.goo.gl/jESBcXjSMu929TM19")!,
            photo: "branch-jizan"
        ),
        Branch(
            id: "bish",
            name: "ليبرو بيش",
            city: "محافظة بيش",
            days: [0, 2, 3],
            time: "٧:٠٠ – ٩:٠٠ م",
            venue: "ملعب الشعلاني",
            mapURL: URL(string: "https://maps.app.goo.gl/MTAYUm6TBtkUSArR7")!,
            photo: "branch-bish"
        ),
        Branch(
            id: "khamis",
            name: "ليبرو خميس مشيط",
            city: "مدينة خميس مشيط",
            days: [0, 1, 4],
            time: "٤:٠٠ – ٧:٠٠ م",
            venue: "ملعب الهدف — خلف كوبري السجون",
            mapURL: URL(string: "https://maps.app.goo.gl/NnZYt67jBhQ2ktnu7")!,
            photo: "branch-khamis"
        ),
        Branch(
            id: "madaya",
            name: "ليبرو المضايا",
            city: "المضايا",
            days: [0, 2, 4],
            time: "٥:٠٠ – ٧:٣٠ م",
            venue: "ملعب ليبرو المضايا",
            mapURL: URL(string: "https://maps.app.goo.gl/xgtmfGmrtFuS51c36")!,
            photo: "branch-madaya"
        ),
        Branch(
            id: "mataan",
            name: "ليبرو المطعن",
            city: "المطعن",
            days: [6, 1, 3],
            time: "٧:٠٠ – ٩:٠٠ م",
            venue: "ملعب ليبرو المطعن",
            mapURL: URL(string: "https://maps.app.goo.gl/vvuKYtDQ1wFFivA78")!,
            photo: "branch-mataan"
        ),
        Branch(
            id: "aliyah",
            name: "ليبرو العالية",
            city: "العالية",
            days: [6, 1, 3],
            time: "٧:٠٠ – ٩:٠٠ م",
            venue: "ملعب ليبرو العالية",
            mapURL: URL(string: "https://maps.app.goo.gl/kQtpVJ38WomBDfQKA")!,
            photo: "branch-aliyah"
        ),
        Branch(
            id: "albaha",
            name: "ليبرو الباحة",
            city: "محافظة الباحة",
            days: [6, 1, 4],
            time: "٤:٠٠ – ٦:٣٠ م",
            venue: "ملعب الفيفا — حي الأزهر",
            mapURL: URL(string: "https://www.google.com/maps/search/?api=1&query=%D9%85%D9%84%D8%B9%D8%A8%20%D8%A7%D9%84%D9%81%D9%8A%D9%81%D8%A7%20%D8%AD%D9%8A%20%D8%A7%D9%84%D8%A3%D8%B2%D9%87%D8%B1%20%D8%A7%D9%84%D8%A8%D8%A7%D8%AD%D8%A9")!,
            photo: "branch-albaha"
        ),
    ]

    static func training(on day: Weekday) -> [Branch] {
        all.filter { $0.trains(on: day) }
    }

    static var trainingToday: [Branch] {
        training(on: .riyadhToday)
    }
}
