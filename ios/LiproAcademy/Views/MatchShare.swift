import SwiftUI

/// بطاقة صورة لمباريات اليوم مع شعار الأكاديمية، تُشارك بجودة عالية
struct MatchShareCard: View {
    let groups: [MatchGroup]
    let dateText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 16) {
                Image("Logo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 64)
                    .padding(10)
                    .background(Theme.chalk, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text("matches.title")
                        .font(.title.bold())
                        .foregroundStyle(Theme.pitch)
                    Text(verbatim: dateText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }

            ForEach(groups) { group in
                VStack(alignment: .leading, spacing: 12) {
                    Text(verbatim: group.league)
                        .font(.headline)
                        .foregroundStyle(Theme.tealText)
                    ForEach(group.matches) { match in
                        ShareRow(match: match)
                    }
                }
                .padding(.bottom, 4)
                Divider()
            }

            HStack(spacing: 10) {
                Image("Logo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 26)
                Text(verbatim: "liproacademy.com")
                    .font(.footnote.bold())
                    .foregroundStyle(Theme.pitch)
                Spacer(minLength: 0)
                Text("matches.disclaimer")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding(28)
        .frame(width: 390, alignment: .leading)
        .background(Theme.canvas)
    }
}

private struct ShareRow: View {
    let match: Match

    var body: some View {
        HStack(spacing: 10) {
            Text(verbatim: match.time)
                .font(.caption.bold().monospacedDigit())
                .foregroundStyle(Theme.pitch)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Theme.gold, in: Capsule())

            Text(verbatim: "\(match.home) × \(match.away)")
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 4)

            if let channel = match.channel {
                Text(verbatim: channel)
                    .font(.caption2.bold())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

/// يحوّل بطاقة المشاركة إلى ملف PNG عالي الدقة
@MainActor
enum MatchShare {
    static func imageURL(groups: [MatchGroup], dateText: String) -> URL? {
        guard !groups.isEmpty else { return nil }
        let card = MatchShareCard(groups: groups, dateText: dateText)
            .environment(\.locale, L10n.locale)
            .environment(\.layoutDirection, L10n.isEnglish ? .leftToRight : .rightToLeft)
        let renderer = ImageRenderer(content: card)
        renderer.scale = 3
        guard let image = renderer.uiImage, let data = image.pngData() else { return nil }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("LiproAcademy-matches.png")
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }
}
