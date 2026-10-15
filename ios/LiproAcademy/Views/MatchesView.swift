import SwiftUI

struct MatchesView: View {
    @State private var store = MatchesStore()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("matches.disclaimer")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)

                    content
                }
                .padding(16)
            }
            .background(Theme.canvas)
            .navigationTitle("matches.title")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable { await store.load() }
            .task { await store.load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.matches.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
        } else if store.today.isEmpty {
            ContentUnavailableView(
                "matches.empty.title",
                systemImage: "sportscourt",
                description: Text("matches.empty.body")
            )
            .padding(.top, 40)
        } else {
            ForEach(store.today) { match in
                MatchCard(match: match)
            }
        }
    }
}

private struct MatchCard: View {
    let match: Match

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(match.league)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                if match.isLive == true {
                    Label("matches.live", systemImage: "dot.radiowaves.left.and.right")
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.red, in: Capsule())
                } else {
                    Text(match.time)
                        .font(.caption.bold())
                        .foregroundStyle(Theme.pitch)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Theme.gold, in: Capsule())
                }
            }

            HStack(alignment: .center) {
                Text(match.home)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)

                Group {
                    if let home = match.homeScore, let away = match.awayScore, match.hasScore {
                        Text("\(home) – \(away)")
                    } else {
                        Text("matches.vs")
                    }
                }
                .font(.title2.bold())
                .foregroundStyle(Theme.tealText)
                .contentTransition(.numericText())

                Text(match.away)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }

            if match.channel != nil || match.commentator != nil {
                Divider()
                VStack(alignment: .leading, spacing: 6) {
                    if let channel = match.channel {
                        Label {
                            Text("matches.channel") + Text(": \(channel)")
                        } icon: {
                            Image(systemName: "tv.fill")
                        }
                    }
                    if let commentator = match.commentator {
                        Label {
                            Text("matches.commentator") + Text(": \(commentator)")
                        } icon: {
                            Image(systemName: "mic.fill")
                        }
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
}
