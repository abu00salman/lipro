import SwiftUI

struct MatchesView: View {
    enum Filter: String, CaseIterable, Identifiable {
        case all, saved
        var id: String { rawValue }
    }

    @State private var store = MatchesStore()
    @State private var filter: Filter = .all
    @Environment(SavedMatches.self) private var saved

    private var visible: [Match] {
        store.today.filter { filter == .all || saved.contains($0) }
    }

    private var dayShareText: String {
        store.today.map(\.shareText).joined(separator: "\n")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header

                    Picker("matches.filter", selection: $filter.animation(.snappy)) {
                        Text("matches.filter.all").tag(Filter.all)
                        Text("matches.filter.saved").tag(Filter.saved)
                    }
                    .pickerStyle(.segmented)

                    content
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .padding(.bottom, 24)
            }
            .background(Theme.canvas)
            .navigationTitle("matches.title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !store.today.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(item: dayShareText) {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                }
            }
            .refreshable { await store.load() }
            .task { await store.load() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("matches.disclaimer")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.75))

            Text(Date.now.formatted(Date.FormatStyle(date: .complete, time: .omitted).locale(L10n.locale)))
                .font(.title2.bold())
                .foregroundStyle(.white)

            Text("matches.count \(store.today.count)")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.gold)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(Theme.heroGradient, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.matches.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
        } else if visible.isEmpty {
            ContentUnavailableView(
                filter == .saved ? "matches.empty.saved" : "matches.empty.title",
                systemImage: filter == .saved ? "bookmark" : "sportscourt",
                description: Text(filter == .saved ? "matches.empty.savedBody" : "matches.empty.body")
            )
            .padding(.top, 30)
        } else {
            LazyVStack(spacing: 14) {
                ForEach(visible) { match in
                    MatchCard(match: match)
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                }
            }
            .animation(.snappy, value: visible)
        }
    }
}

private struct MatchCard: View {
    let match: Match
    @Environment(SavedMatches.self) private var saved

    var body: some View {
        let isSaved = saved.contains(match)
        let saveLabel: LocalizedStringKey = isSaved ? "matches.saved" : "matches.save"

        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                if let badge = match.badge {
                    Text(badge)
                        .font(.caption2.bold())
                        .foregroundStyle(Theme.pitch)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.gold, in: Capsule())
                }
                Text(match.league)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(match.time)
                    .font(.footnote.bold().monospacedDigit())
                    .foregroundStyle(Theme.tealText)
            }

            HStack(spacing: 12) {
                TeamName(name: match.home)
                Text("matches.vs")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
                    .padding(9)
                    .background(Theme.teal.opacity(0.12), in: Circle())
                TeamName(name: match.away)
            }

            HStack(spacing: 10) {
                if let channel = match.channel {
                    ChannelBadge(name: channel)
                }
                Spacer(minLength: 0)
                if let commentator = match.commentator {
                    Label(commentator, systemImage: "mic.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Divider()

            HStack(spacing: 18) {
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                        saved.toggle(match)
                    }
                } label: {
                    Label(saveLabel, systemImage: isSaved ? "bookmark.fill" : "bookmark")
                        .symbolEffect(.bounce, value: isSaved)
                }

                ShareLink(item: match.shareText) {
                    Label("matches.share", systemImage: "square.and.arrow.up")
                }

                Spacer(minLength: 0)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.tealText)
            .sensoryFeedback(.success, trigger: isSaved)
        }
        .padding(20)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay {
            if match.featured {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .strokeBorder(Theme.gold.opacity(0.9), lineWidth: 1.5)
            }
        }
    }
}

private struct TeamName: View {
    let name: String

    var body: some View {
        Text(name)
            .font(.headline)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity)
    }
}

/// شارة القناة بلون علامتها التجارية، لأن الموقع لا يحوي شعارات القنوات
struct ChannelBadge: View {
    let name: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "tv.fill")
                .font(.caption2)
            Text(name)
                .font(.caption.bold())
                .lineLimit(1)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Self.color(for: name), in: Capsule())
    }

    private static func color(for name: String) -> Color {
        let value = name.lowercased()
        if value.contains("bein") { return Color(hex: 0x6A1B9A) }
        if value.contains("ثمانية") { return Color(hex: 0x0B6E5F) }
        if value.contains("starz") { return Color(hex: 0x1F1F1F) }
        if value.contains("mbc") { return Color(hex: 0x1F4E9C) }
        if value.contains("الكأس") || value.contains("أبوظبي") || value.contains("السعودية") {
            return Color(hex: 0xC88908)
        }
        return Theme.teal
    }
}
