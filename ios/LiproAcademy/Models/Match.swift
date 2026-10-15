import Foundation

struct Match: Identifiable, Hashable {
    let id: String
    /// yyyy-MM-dd بتوقيت الرياض
    let date: String
    /// الوقت كما يظهر على الموقع، مثل 04:40 PM
    let time: String
    let league: String
    let home: String
    let away: String
    let channel: String?
    let commentator: String?
    let featured: Bool

    /// دقائق من منتصف الليل لترتيب المباريات حسب الوقت الفعلي
    var minutesSinceMidnight: Int {
        let parts = time.split(separator: " ")
        let hm = parts.first?.split(separator: ":").compactMap { Int($0) } ?? []
        guard hm.count == 2 else { return 0 }
        var hour = hm[0] % 12
        if parts.count > 1, parts[1].uppercased() == "PM" { hour += 12 }
        return hour * 60 + hm[1]
    }
}

/// يقرأ مباريات اليوم من صفحة المباريات على الموقع نفسها (قائمة EXTRA_MATCHES)،
/// فأي تحديث للمباريات على الموقع يظهر في التطبيق مباشرة دون إصدار جديد
@MainActor
@Observable
final class MatchesStore {
    static let pageURL = URL(string: "https://liproacademy.com/matches/index.html")!

    private(set) var matches: [Match] = []
    private(set) var isLoading = false
    private(set) var failed = false

    var today: [Match] {
        matches.filter { $0.date == Self.todayKey }
            .sorted { $0.minutesSinceMidnight < $1.minutesSinceMidnight }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let (data, response) = try await URLSession.shared.data(from: Self.pageURL)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }
            let html = String(decoding: data, as: UTF8.self)
            matches = Self.parse(html)
            failed = false
        } catch {
            failed = true
        }
    }

    /// يستخرج كائنات المباريات من كتلة EXTRA_MATCHES في صفحة الموقع
    static func parse(_ html: String) -> [Match] {
        guard let start = html.range(of: "var EXTRA_MATCHES = ["),
              let end = html.range(of: "];", range: start.upperBound..<html.endIndex) else {
            return []
        }
        let block = String(html[start.upperBound..<end.lowerBound])

        let objectPattern = try! NSRegularExpression(pattern: #"\{([^{}]*)\}"#)
        let fieldPattern = try! NSRegularExpression(pattern: #"(\w+)\s*:\s*('([^']*)'|true|false)"#)

        let objects = objectPattern.matches(in: block, range: NSRange(block.startIndex..., in: block))
        return objects.enumerated().compactMap { index, object in
            guard let bodyRange = Range(object.range(at: 1), in: block) else { return nil }
            let body = String(block[bodyRange])
            var fields: [String: String] = [:]
            for field in fieldPattern.matches(in: body, range: NSRange(body.startIndex..., in: body)) {
                guard let keyRange = Range(field.range(at: 1), in: body) else { continue }
                let quoted = Range(field.range(at: 3), in: body).map { String(body[$0]) }
                let bare = Range(field.range(at: 2), in: body).map { String(body[$0]) }
                fields[String(body[keyRange])] = quoted ?? bare ?? ""
            }
            guard let date = fields["date"], let time = fields["time"],
                  let home = fields["home"], let away = fields["away"] else { return nil }
            return Match(
                id: "\(index)-\(date)-\(time)-\(home)",
                date: date,
                time: time,
                league: fields["league"] ?? "",
                home: home,
                away: away,
                channel: fields["channel"],
                commentator: fields["commentator"],
                featured: fields["featured"] == "true"
            )
        }
    }

    private static var todayKey: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Riyadh")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: .now)
    }
}
