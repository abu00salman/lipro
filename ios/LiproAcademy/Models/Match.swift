import Foundation

struct Match: Identifiable, Codable, Hashable {
    let id: String
    /// yyyy-MM-dd بتوقيت الرياض
    let date: String
    /// HH:mm بتوقيت الرياض
    let time: String
    let league: String
    let home: String
    let away: String
    let channel: String?
    let commentator: String?
    let homeScore: Int?
    let awayScore: Int?
    let isLive: Bool?

    var hasScore: Bool { homeScore != nil && awayScore != nil }
}

private struct MatchFeed: Codable {
    let updated: String?
    let matches: [Match]
}

/// يقرأ مباريات اليوم من ملف matches.json على الموقع، فيُحدَّث دون إصدار تطبيق جديد
@MainActor
@Observable
final class MatchesStore {
    static let feedURL = URL(string: "https://liproacademy.com/matches.json")!

    private(set) var matches: [Match] = []
    private(set) var isLoading = false
    private(set) var failed = false

    var today: [Match] {
        matches.filter { $0.date == Self.todayKey }
            .sorted { $0.time < $1.time }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let (data, response) = try await URLSession.shared.data(from: Self.feedURL)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }
            matches = try JSONDecoder().decode(MatchFeed.self, from: data).matches
            failed = false
        } catch {
            failed = true
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
